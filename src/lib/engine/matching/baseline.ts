import { CONCEPT_BY_ID, conceptLabel, extractConcepts, relatedOf } from '../taxonomy';
import type { EngagementType, Faculty, MatchRequest } from '../types';
import type {
  Band, ComponentKey, ConceptHit, Confidence, EvidenceItem, EvidenceType, MatchCorpus, MatchProvider,
  MatchResponse, MatchResult, ScoreAdjustment, ScoreComponent,
} from './types';

/**
 * Baseline matcher — deterministic and explainable.
 *
 * score = Σ(weightᵢ · componentᵢ) / Σ(weightᵢ for components with data) + adjustments
 *
 * Components with no underlying data (e.g. a researcher with no project
 * records) are reported as "not assessed" and their weight is redistributed,
 * so sparse records lower *confidence*, not *match quality*.
 */

export const WEIGHTS: Record<ComponentKey, number> = {
  topic: 0.35,
  expertise: 0.2,
  active: 0.2,
  evidence: 0.15,
  pathway: 0.1,
};

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  topic: 'Topic relevance',
  expertise: 'Stated expertise',
  active: 'Active research',
  evidence: 'Supporting evidence',
  pathway: 'Engagement fit',
};

/** Minimum topic relevance (0..1) for a researcher to be returned at all. */
export const RELEVANCE_FLOOR = 0.2;

const SOURCE_WEIGHT: Record<EvidenceType, number> = {
  expertise: 1,
  keyword: 0.9,
  summary: 0.7,
  project: 1,
  publication: 0.85,
  ip: 0.8,
};

const DAY = 86_400_000;

export function bandFor(score: number): Band {
  if (score >= 75) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 45) return 'possible';
  return 'weak';
}

export const BAND_LABEL: Record<Band, string> = {
  strong: 'Strong match',
  good: 'Good match',
  possible: 'Possible match',
  weak: 'Weak match',
};

/** How strongly a set of concepts supports one requested concept. */
function conceptStrength(q: string, have: Set<string>): { s: number; direct: boolean } {
  if (have.has(q)) return { s: 1, direct: true };
  const rel = relatedOf(q);
  if (rel.some((r) => have.has(r))) return { s: 0.5, direct: false };
  // reverse relation (have X whose related list includes q)
  for (const h of have) if (relatedOf(h).includes(q)) return { s: 0.45, direct: false };
  return { s: 0, direct: false };
}

function conceptsOf(...texts: (string | undefined)[]): Set<string> {
  return new Set(extractConcepts(texts.filter(Boolean).join(' . ')));
}

/**
 * Per-faculty concept extraction is expensive (taxonomy phrase scan over long
 * keyword strings) and the faculty records are stable in-memory objects, so
 * cache by object identity — a write replaces the record object and the
 * stale entry becomes harmless garbage.
 */
const facultyConceptCache = new WeakMap<
  object,
  { kw: Set<string>; expertise: Set<string>; declared: Set<string> }
>();

function facultyConcepts(f: Faculty): { kw: Set<string>; expertise: Set<string>; declared: Set<string> } {
  let cached = facultyConceptCache.get(f);
  if (!cached) {
    const kw = f.keywords.length ? conceptsOf(f.keywords.join(' . ')) : new Set<string>();
    const expertise = new Set(f.expertise);
    cached = { kw, expertise, declared: new Set([...f.expertise, ...kw]) };
    facultyConceptCache.set(f, cached);
  }
  return cached;
}

const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

/**
 * Coverage curve: missing one of several requested topics should cost less
 * than missing the only one. soft(1) = 1, soft(0.5) ≈ 0.65, soft(0.25) ≈ 0.35.
 */
export const soft = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 1.5);

export function requestConcepts(req: MatchRequest): { all: string[]; inferred: string[] } {
  const inferred = extractConcepts([req.text, req.outcome, req.notes].filter(Boolean).join(' . '));
  const ex = new Set(req.excludedTopics ?? []);
  const all = [...new Set([...req.topics.filter((t) => CONCEPT_BY_ID[t]), ...inferred])].filter((t) => !ex.has(t));
  return { all, inferred: inferred.filter((x) => !req.topics.includes(x) && !ex.has(x)) };
}

export function scoreFaculty(
  f: Faculty,
  req: MatchRequest,
  q: string[],
  corpus: MatchCorpus,
  now: Date,
): Omit<MatchResult, 'rank'> & { relevance: number } {
  const dept = corpus.departments[f.departmentId];
  const projects = corpus.projects.filter((p) => p.facultyIds.includes(f.id));
  const pubs = corpus.publications.filter((p) => p.facultyIds.includes(f.id));
  const ips = corpus.ip.filter((p) => p.facultyIds.includes(f.id));
  const year = now.getUTCFullYear();

  // --- Gather evidence sources ------------------------------------------
  type Src = { type: EvidenceType; id?: string; title: string; detail?: string; date?: string; active?: boolean; concepts: Set<string>; w: number };
  const sources: Src[] = [];
  const cached = facultyConcepts(f);
  sources.push({ type: 'expertise', title: 'Listed areas of expertise', concepts: cached.expertise, w: SOURCE_WEIGHT.expertise });
  if (f.keywords.length) sources.push({ type: 'keyword', title: 'Research keywords', detail: f.keywords.join(', '), concepts: cached.kw, w: SOURCE_WEIGHT.keyword });
  sources.push({ type: 'summary', title: 'Research summary', concepts: conceptsOf(f.summary, dept?.name), w: SOURCE_WEIGHT.summary });
  for (const p of projects) {
    const active = p.status === 'active';
    sources.push({
      type: 'project', id: p.id, title: p.title, detail: p.sponsor, date: p.start, active,
      concepts: new Set([...p.topics, ...conceptsOf(p.title, p.description)]),
      w: active ? 1 : p.status === 'completed' ? 0.8 : 0.7,
    });
  }
  for (const p of pubs) {
    const age = year - p.year;
    sources.push({
      type: 'publication', id: p.id, title: p.title, detail: `${p.venue}, ${p.year}`, date: String(p.year),
      concepts: new Set([...p.topics, ...conceptsOf(p.title)]),
      w: age <= 3 ? SOURCE_WEIGHT.publication : age <= 6 ? 0.7 : 0.55,
    });
  }
  for (const p of ips) {
    sources.push({ type: 'ip', id: p.id, title: p.title, detail: p.status, date: p.filed, concepts: new Set([...p.topics, ...conceptsOf(p.title, p.summary)]), w: SOURCE_WEIGHT.ip });
  }

  // --- Concept coverage --------------------------------------------------
  const hits: ConceptHit[] = [];
  const evidence = new Map<string, EvidenceItem>();
  for (const concept of q) {
    let best = 0;
    let direct = false;
    const via = new Set<EvidenceType>();
    for (const s of sources) {
      const { s: cs, direct: d } = conceptStrength(concept, s.concepts);
      if (cs === 0) continue;
      const v = cs * s.w;
      via.add(s.type);
      if (v > best) { best = v; direct = d; }
      if (s.type === 'project' || s.type === 'publication' || s.type === 'ip') {
        const key = `${s.type}:${s.id}`;
        const e = evidence.get(key) ?? { type: s.type, id: s.id, title: s.title, detail: s.detail, date: s.date, active: s.active, concepts: [], strength: 0 };
        e.concepts.push(concept);
        e.strength = Math.max(e.strength, v);
        evidence.set(key, e);
      }
    }
    hits.push({ concept, strength: best, direct, via: [...via] });
  }
  const relevance = q.length ? hits.reduce((a, h) => a + h.strength, 0) / q.length : 0;

  // --- Components --------------------------------------------------------
  const declared = cached.declared;
  const expertise = q.length ? q.reduce((a, c) => a + conceptStrength(c, declared).s, 0) / q.length : 0;

  const activeProjects = projects.filter((p) => p.status === 'active');
  let active: number | null = null;
  let activeExpl = 'No project records on file, so current research could not be assessed.';
  if (projects.length) {
    const scored = activeProjects.map((p) => {
      const set = new Set([...p.topics, ...conceptsOf(p.title, p.description)]);
      return { p, s: q.length ? q.reduce((a, c) => a + conceptStrength(c, set).s, 0) / q.length : 0 };
    }).sort((a, b) => b.s - a.s);
    active = scored[0]?.s ?? 0;
    activeExpl = scored[0] && scored[0].s > 0
      ? `Best active project: “${scored[0].p.title}”.`
      : activeProjects.length
        ? 'Active projects on file are not on these topics.'
        : 'No active projects listed; past projects only.';
  }

  const items = [...evidence.values()];
  const nItems = items.filter((e) => e.strength >= 0.4).length;
  const hasRecords = projects.length + pubs.length + ips.length > 0;
  const evidenceScore = hasRecords ? 1 - Math.exp(-nItems / 2.2) : null;
  const evidenceExpl = hasRecords
    ? `${nItems} project, publication or IP record${nItems === 1 ? '' : 's'} touch the requested topics.`
    : 'No projects, publications or IP on file for this researcher.';

  const { score: pathway, explanation: pathwayExpl } = pathwayFit(req.engagementType, f, projects, ips, items);

  const components: ScoreComponent[] = [
    { key: 'topic', label: COMPONENT_LABELS.topic, weight: WEIGHTS.topic, score: pct(soft(relevance)), explanation: topicExplanation(hits) },
    { key: 'expertise', label: COMPONENT_LABELS.expertise, weight: WEIGHTS.expertise, score: pct(soft(expertise)), explanation: expertiseExplanation(q, declared) },
    { key: 'active', label: COMPONENT_LABELS.active, weight: WEIGHTS.active, score: active === null ? null : pct(soft(active)), explanation: activeExpl },
    { key: 'evidence', label: COMPONENT_LABELS.evidence, weight: WEIGHTS.evidence, score: evidenceScore === null ? null : pct(evidenceScore), explanation: evidenceExpl },
    { key: 'pathway', label: COMPONENT_LABELS.pathway, weight: WEIGHTS.pathway, score: pathway === null ? null : pct(pathway), explanation: pathwayExpl },
  ];

  const known = components.filter((x) => x.score !== null);
  const wsum = known.reduce((a, x) => a + x.weight, 0);
  let score = wsum ? known.reduce((a, x) => a + x.weight * (x.score as number), 0) / wsum : 0;

  // --- Adjustments -------------------------------------------------------
  const adjustments: ScoreAdjustment[] = [];
  if (req.disciplines.length && dept && req.disciplines.includes(dept.college)) {
    adjustments.push({ label: 'Preferred discipline', points: 4, explanation: `${dept.college} was listed as a preferred discipline.` });
  }
  if (f.availability === 'unavailable') adjustments.push({ label: 'Availability', points: -15, explanation: 'Recorded as unavailable for new collaborations.' });
  if (f.availability === 'limited') adjustments.push({ label: 'Availability', points: -5, explanation: 'Recorded as having limited availability.' });
  score = Math.max(0, Math.min(100, Math.round(score + adjustments.reduce((a, x) => a + x.points, 0))));

  // --- Confidence, unknowns, concerns ------------------------------------
  const confidence = confidenceFor(f, projects.length + pubs.length, now);
  const unknowns: string[] = [];
  if (f.availability === 'unknown') unknowns.push('Current availability not confirmed');
  const pw = req.engagementType === 'licensing' ? 'research' : req.engagementType;
  const interest = f.interests.find((i) => i.pathway === pw);
  if (!interest?.verified) unknowns.push(`Interest in ${pathwayNoun(req.engagementType)} not confirmed`);
  if (req.engagementType === 'research') unknowns.push('Funding preferences and current commitments unknown');
  if (!f.emailVerified) unknowns.push('Contact details not verified');
  for (const comp of components) if (comp.score === null) unknowns.push(comp.explanation);
  for (const n of f.coverageNotes) unknowns.push(n);

  const concerns: string[] = [];
  const age = f.lastVerified ? Math.floor((now.getTime() - Date.parse(f.lastVerified)) / DAY) : null;
  if (age === null) concerns.push('Profile has never been verified');
  else if (age > 365) concerns.push(`Profile last verified ${Math.round(age / 30)} months ago`);
  if (f.availability === 'limited') concerns.push('Limited availability recorded');
  if (f.availability === 'unavailable') concerns.push('Recorded as unavailable');
  if (req.engagementType === 'licensing') {
    const licensed = ips.filter((i) => i.licensing === 'licensed' && evidence.has(`ip:${i.id}`));
    if (licensed.length) concerns.push(`${licensed.length} related technolog${licensed.length === 1 ? 'y is' : 'ies are'} already licensed`);
  }
  const weakConcepts = hits.filter((h) => h.strength === 0).map((h) => conceptLabel(h.concept));
  if (weakConcepts.length && weakConcepts.length < q.length) concerns.push(`No evidence for: ${weakConcepts.join(', ')}`);

  const sortedEvidence = items.sort((a, b) => b.strength - a.strength || Number(!!b.active) - Number(!!a.active));

  return {
    facultyId: f.id,
    score,
    band: bandFor(score),
    components,
    adjustments,
    concepts: hits,
    evidence: sortedEvidence,
    unknowns,
    concerns,
    confidence,
    summary: summarize(score, hits, sortedEvidence),
    pathways: suggestPathways(req.engagementType, f, ips, sortedEvidence),
    relatedProjectIds: sortedEvidence.filter((e) => e.type === 'project').map((e) => e.id!),
    relatedIpIds: sortedEvidence.filter((e) => e.type === 'ip').map((e) => e.id!),
    relevance,
  };
}

function pathwayNoun(t: EngagementType) {
  return { research: 'sponsored research', talent: 'talent / recruiting partnerships', engagement: 'industry engagement', licensing: 'technology licensing' }[t];
}

function pathwayFit(
  type: EngagementType,
  f: Faculty,
  projects: MatchCorpus['projects'],
  ips: MatchCorpus['ip'],
  evidence: EvidenceItem[],
): { score: number | null; explanation: string } {
  const verified = (p: string) => f.interests.some((i) => i.pathway === p && i.verified);
  switch (type) {
    case 'research': {
      if (verified('research')) return { score: 1, explanation: 'Has confirmed interest in sponsored research.' };
      const relevantFunded = evidence.some((e) => e.type === 'project' && projects.find((p) => p.id === e.id)?.sponsor);
      if (relevantFunded) return { score: 0.85, explanation: 'Has externally sponsored projects on related topics.' };
      if (projects.some((p) => p.sponsor)) return { score: 0.65, explanation: 'Has a record of externally sponsored projects.' };
      return { score: null, explanation: 'No record of sponsored work or stated interest; fit not assessed.' };
    }
    case 'talent': {
      if (verified('talent')) return { score: 1, explanation: 'Has confirmed interest in recruiting partnerships.' };
      if (f.labSize !== undefined) return { score: Math.min(1, f.labSize / 10), explanation: `Leads a group of about ${f.labSize} graduate students and postdocs.` };
      return { score: null, explanation: 'Group size and student pipeline unknown.' };
    }
    case 'licensing': {
      const rel = ips.filter((i) => evidence.some((e) => e.type === 'ip' && e.id === i.id));
      if (rel.some((i) => i.licensing === 'available')) return { score: 1, explanation: 'Related technology listed as available for licensing.' };
      if (rel.some((i) => i.licensing === 'unknown' || i.licensing === 'optioned')) return { score: 0.7, explanation: 'Related IP exists; licensing status unconfirmed.' };
      if (rel.length) return { score: 0.35, explanation: 'Related IP exists but is already licensed.' };
      if (ips.length) return { score: 0.25, explanation: 'Has IP on file, but none related to this request.' };
      return { score: 0.1, explanation: 'No IP on file — licensing pathway unlikely; research collaboration may still fit.' };
    }
    case 'engagement': {
      if (verified('engagement')) return { score: 1, explanation: 'Has confirmed interest in industry engagement events.' };
      return { score: null, explanation: 'Interest in engagement activities not recorded.' };
    }
  }
}

function confidenceFor(f: Faculty, recordCount: number, now: Date): Confidence {
  const age = f.lastVerified ? (now.getTime() - Date.parse(f.lastVerified)) / DAY : Infinity;
  const fresh = age <= 180 ? 1 : age <= 365 ? 0.6 : age === Infinity ? 0 : 0.25;
  const sources = f.sources.length >= 2 ? 1 : f.sources.length === 1 ? 0.6 : 0;
  const coverage = recordCount >= 4 ? 1 : recordCount >= 2 ? 0.6 : recordCount === 1 ? 0.35 : 0;
  const complete = f.coverageNotes.length ? 0.5 : 1;
  const factors = [
    { label: 'Freshness', value: fresh, w: 30, detail: f.lastVerified ? `Verified ${Math.round(age)} days ago` : 'Never verified' },
    { label: 'Record coverage', value: coverage, w: 25, detail: `${recordCount} project/publication record${recordCount === 1 ? '' : 's'}` },
    { label: 'Contact verified', value: f.emailVerified ? 1 : 0, w: 15, detail: f.emailVerified ? 'Verified contact on file' : 'Unverified' },
    { label: 'Independent sources', value: sources, w: 15, detail: `${f.sources.length} source${f.sources.length === 1 ? '' : 's'}` },
    { label: 'Known gaps', value: complete, w: 15, detail: f.coverageNotes.length ? `${f.coverageNotes.length} known gap${f.coverageNotes.length === 1 ? '' : 's'}` : 'None recorded' },
  ];
  const score = Math.round(factors.reduce((a, x) => a + x.value * x.w, 0));
  return {
    score,
    level: score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low',
    factors: factors.map(({ label, value, detail }) => ({ label, value: Math.round(value * 100), detail })),
  };
}

function topicExplanation(hits: ConceptHit[]) {
  const direct = hits.filter((h) => h.direct && h.strength > 0).map((h) => conceptLabel(h.concept));
  const related = hits.filter((h) => !h.direct && h.strength > 0).map((h) => conceptLabel(h.concept));
  const parts = [];
  if (direct.length) parts.push(`Direct evidence for ${direct.join(', ')}`);
  if (related.length) parts.push(`adjacent work for ${related.join(', ')}`);
  return parts.length ? parts.join('; ') + '.' : 'No topic overlap found.';
}

function expertiseExplanation(q: string[], declared: Set<string>) {
  const listed = q.filter((c) => declared.has(c)).map(conceptLabel);
  return listed.length
    ? `Lists ${listed.join(', ')} as expertise.`
    : 'Requested topics are not among listed expertise; relevance comes from projects or adjacent fields.';
}

function summarize(score: number, hits: ConceptHit[], ev: EvidenceItem[]) {
  const top = hits.filter((h) => h.strength >= 0.5).sort((a, b) => b.strength - a.strength).slice(0, 2).map((h) => conceptLabel(h.concept));
  const proj = ev.filter((e) => e.type === 'project');
  const activeN = proj.filter((e) => e.active).length;
  const pubs = ev.filter((e) => e.type === 'publication').length;
  const ip = ev.filter((e) => e.type === 'ip').length;
  const bits = [];
  if (activeN) bits.push(`${activeN} active project${activeN > 1 ? 's' : ''}`);
  else if (proj.length) bits.push(`${proj.length} past project${proj.length > 1 ? 's' : ''}`);
  if (pubs) bits.push(`${pubs} publication${pubs > 1 ? 's' : ''}`);
  if (ip) bits.push(`${ip} IP record${ip > 1 ? 's' : ''}`);
  const lead = `${BAND_LABEL[bandFor(score)]}${top.length ? ` on ${top.join(' and ')}` : ''}`;
  return bits.length ? `${lead}, supported by ${bits.join(', ')}.` : `${lead}, based on listed expertise only.`;
}

function suggestPathways(type: EngagementType, f: Faculty, ips: MatchCorpus['ip'], ev: EvidenceItem[]): string[] {
  const out: string[] = [];
  if (ev.some((e) => e.type === 'project' && e.active)) out.push('Sponsored research project');
  if (type === 'research' || ev.length) out.push('Exploratory faculty conversation');
  if (ips.some((i) => i.licensing === 'available' && ev.some((e) => e.id === i.id))) out.push('Technology licensing discussion (via OTT)');
  if ((f.labSize ?? 0) >= 5 || type === 'talent') out.push('Student project, internship or recruiting pipeline');
  if (type === 'engagement') out.push('Seminar, lab visit or sponsored event');
  return [...new Set(out)].slice(0, 4);
}

export function runBaseline(request: MatchRequest, corpus: MatchCorpus, now = new Date()): MatchResponse {
  const { all: q, inferred } = requestConcepts(request);
  const excluded: MatchResponse['excluded'] = [];
  const rows: (Omit<MatchResult, 'rank'> & { relevance: number; name: string })[] = [];
  for (const f of corpus.faculty) {
    if (request.constraints.excludeFacultyIds?.includes(f.id)) { excluded.push({ facultyId: f.id, reason: 'Excluded by request' }); continue; }
    const r = scoreFaculty(f, request, q, corpus, now);
    if (r.relevance < RELEVANCE_FLOOR) continue;
    if (request.constraints.requireIP && r.relatedIpIds.length === 0) { excluded.push({ facultyId: f.id, reason: 'No related IP on file' }); continue; }
    if (request.constraints.activeResearchOnly && !r.evidence.some((e) => e.type === 'project' && e.active)) { excluded.push({ facultyId: f.id, reason: 'No related active project' }); continue; }
    if (request.constraints.requireVerifiedContact && !f.emailVerified) { excluded.push({ facultyId: f.id, reason: 'Contact not verified' }); continue; }
    rows.push({ ...r, name: f.name });
  }
  rows.sort((a, b) => b.score - a.score || b.confidence.score - a.confidence.score || a.name.localeCompare(b.name));
  return {
    providerId: baselineProvider.id,
    providerVersion: baselineProvider.version,
    generatedAt: now.toISOString(),
    method: 'Weighted concept coverage across expertise, projects, publications and IP, with taxonomy-based related-topic credit.',
    requestConcepts: q,
    inferredConcepts: inferred,
    results: rows.map(({ relevance: _r, name: _n, ...r }, i) => ({ ...r, rank: i + 1 })),
    excluded,
    considered: corpus.faculty.length,
  };
}

export const baselineProvider: MatchProvider = {
  id: 'baseline',
  name: 'Baseline explainable matcher',
  version: '1.0.0',
  description: 'Deterministic, taxonomy-based concept matching. No AI, no external calls. Same input always gives the same ranking.',
  match: (req, corpus, opts) => runBaseline(req, corpus, opts?.now),
};

/** Explain why `a` ranks above `b`: per-component contribution differences. */
export function explainRanking(a: MatchResult, b: MatchResult) {
  const contrib = (r: MatchResult) => {
    const known = r.components.filter((c) => c.score !== null);
    const wsum = known.reduce((s, c) => s + c.weight, 0);
    return Object.fromEntries(r.components.map((c) => [c.key, c.score === null ? null : (c.weight * c.score) / wsum]));
  };
  const ca = contrib(a);
  const cb = contrib(b);
  const diffs = a.components.map((c) => {
    const x = ca[c.key];
    const y = cb[c.key];
    return { key: c.key, label: c.label, a: c.score, b: b.components.find((d) => d.key === c.key)!.score, delta: x === null || y === null ? null : Math.round((x - y) * 10) / 10 };
  });
  const adjA = a.adjustments.reduce((s, x) => s + x.points, 0);
  const adjB = b.adjustments.reduce((s, x) => s + x.points, 0);
  return { diffs: diffs.sort((p, q) => Math.abs(q.delta ?? 0) - Math.abs(p.delta ?? 0)), adjustmentDelta: adjA - adjB, scoreDelta: a.score - b.score };
}
