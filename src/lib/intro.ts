/** Intro-draft engine: opportunity + review + drafts through noble's tx API.
 *
 *  Demo-send semantics: nothing is emailed. "Send" records the draft as
 *  `recorded-sent` in the noble engine ("Recorded as sent by you — the
 *  system itself has not sent anything"), per shared/rules.ts canRecordSent.
 */

import type { NobleState } from "./types";

const TX_HEADERS = { "content-type": "application/json", "x-dev-user": "athar@nittany.ai" };

export interface MatchExplanation {
  key: string;
  label: string;
  score: number | null;
  explanation: string;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function tx(ops: object[]): Promise<void> {
  const res = await fetch("/api/w/live/tx", {
    method: "POST",
    headers: TX_HEADERS,
    body: JSON.stringify({ ops }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !j.ok) {
    throw new Error(j.error || `noble tx failed: HTTP ${res.status}`);
  }
}

export function firstUserId(state: NobleState): string {
  const first = Object.values(state.db.users)[0];
  return first?.id ?? "u-demo";
}

/** One review covers every faculty of this opportunity (facultyId unset). */
export interface IntroCtx {
  needTitle: string;
  needDescription?: string;
  company?: { id: string; name: string };
  /** the noble interest this match came from (required non-empty by the schema) */
  interestId?: string;
  searchText?: string;
  whyLine: string;
}

export interface PreparedIntro {
  opportunityId: string;
  draft: { id: string; facultyId: string; subject: string; body: string; status: "draft" | "recorded-sent" };
}

const CHECKLIST = [
  { key: "why", label: "The reason for the recommendation makes sense", hint: "Read the match explanation and evidence.", checked: true },
  { key: "current", label: "Supporting evidence is current", hint: "Check project dates and last-verified date.", checked: true },
  { key: "contact", label: "Contact details are verified, or a warm path is identified", checked: true },
  { key: "fit", label: "The intended engagement type makes sense for this researcher", checked: true },
  { key: "process", label: "Relevant administrative steps are understood (e.g. OTT for IP)", checked: true },
  { key: "gaps", label: "Open questions are noted for the introduction", checked: true },
];

function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1]?.replace(/[,;.]/g, "") ?? name;
  return /^[A-Za-z]/.test(last) ? last : name;
}

export function draftCopy(ctx: IntroCtx, facultyName: string, userName: string): { subject: string; body: string } {
  const topic = ctx.searchText?.trim() || ctx.needTitle;
  const companyLine = ctx.company ? `${ctx.company.name} is` : "A leading company is";
  const subject = `Penn State research fit — ${topic.slice(0, 70)}`;
  const body = `Professor ${lastNameOf(facultyName)},

${companyLine} investing in ${topic.replace(/\s+/g, " ").slice(0, 160)}. Based on the Penn State research directory, your profile matches this direction on: ${ctx.whyLine}.

Would you be open to a 30-minute conversation about a sponsored research collaboration? I would be glad to share context on the company's interest before we set anything up.

Best regards,
${userName}
Nittany AI Alliance`;
  return { subject, body };
}

/** Create opportunity + approved review, then draft for each faculty. */
export async function prepareIntros(opts: {
  ctx: IntroCtx;
  faculty: { facultyId: string; facultyName: string }[];
  userId: string;
  /** per-faculty fit clause substituted into the draft body */
  whyByFaculty?: Record<string, string>;
}): Promise<PreparedIntro[]> {
  const { ctx, faculty, userId } = opts;
  if (faculty.length === 0) return [];
  const now = new Date().toISOString();
  const oppId = uid("opp-demo");
  const revId = uid("rev-demo");
  const names = faculty.map((f) => f.facultyName).join(", ");

  // tx1: opportunity + pending review (noble rule: new reviews must start pending)
  await tx([
    {
      op: "put",
      collection: "opportunities",
      record: {
        id: oppId,
        title: ctx.company
          ? `${ctx.company.name} × Penn State — ${ctx.needTitle}`
          : `Match Studio — ${ctx.needTitle}`,
        companyId: ctx.company?.id ?? "",
        interestId: ctx.interestId || "int-studio-generic",
        type: "sponsored-research",
        description: `${ctx.needTitle}${ctx.needDescription ? " — " + ctx.needDescription : ""}`,
        stage: "new",
        priority: "medium",
        ownerId: userId,
        facultyIds: [],
        outcomes: [],
        notes: [],
        signalIds: [],
        createdAt: now,
        updatedAt: now,
        stageEnteredAt: now,
        stageHistory: [],
      },
    },
    {
      op: "put",
      collection: "reviews",
      record: {
        id: revId,
        kind: "introduction",
        title: `Introduction review — ${ctx.needTitle}`,
        summary: `Match to ${names}.`,
        reason: "A human approved this match before any introduction is prepared.",
        status: "pending",
        priority: "medium",
        createdAt: now,
        createdBy: userId,
        opportunityId: oppId,
        missing: [],
        checklist: CHECKLIST,
        history: [{ at: now, by: userId, action: "created" }],
      },
    },
    {
      op: "put",
      collection: "activities",
      record: {
        id: uid("act-demo"),
        at: now,
        actorId: userId,
        kind: "created",
        text: `Matched ${faculty.length} faculty for “${ctx.needTitle}”`,
        opportunityId: oppId,
      },
    },
  ]);

  // tx2: approve the review (checklist complete) then create drafts; the
  // server's working copy sees the approval before validating draft writes.
  const now2 = new Date().toISOString();
  const drafts = faculty.map((f) => {
    const { subject, body } = draftCopy(
      { ...ctx, whyLine: opts.whyByFaculty?.[f.facultyId] ?? ctx.whyLine },
      f.facultyName,
      "Athar",
    );
    return {
      rec: {
        id: uid("dr-demo"),
        opportunityId: oppId,
        facultyId: f.facultyId,
        reviewId: revId,
        subject,
        body,
        status: "draft",
        createdAt: now2,
        createdBy: userId,
        updatedAt: now2,
      },
    };
  });
  await tx([
    {
      op: "put",
      collection: "reviews",
      record: {
        id: revId,
        kind: "introduction",
        title: `Introduction review — ${ctx.needTitle}`,
        summary: `Match to ${names}.`,
        reason: "A human approved this match before any introduction is prepared.",
        status: "approved",
        priority: "medium",
        createdAt: now,
        createdBy: userId,
        decidedAt: now2,
        decidedBy: userId,
        opportunityId: oppId,
        missing: [],
        checklist: CHECKLIST,
        history: [
          { at: now, by: userId, action: "created" },
          { at: now2, by: userId, action: "approved", note: "Approved in the demo dashboard with the drafted introductions." },
        ],
      },
    },
    ...drafts.map((d) => ({ op: "put", collection: "drafts", record: d.rec })),
    {
      op: "put",
      collection: "activities",
      record: {
        id: uid("act-demo"),
        at: now2,
        actorId: userId,
        kind: "intro-draft",
        text: `Drafted ${drafts.length} introduction${drafts.length === 1 ? "" : "s"} (nothing sent)`,
        opportunityId: oppId,
      },
    },
  ]);
  return drafts.map((d) => ({
    opportunityId: oppId,
    draft: {
      id: d.rec.id,
      facultyId: d.rec.facultyId,
      subject: d.rec.subject,
      body: d.rec.body,
      status: "draft" as const,
    },
  }));
}

/** Demo-send: record drafts as sent — the engine explicitly logs that the
 *  system itself has not sent anything. */
export async function recordIntrosSent(
  draftIds: string[],
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const channel = "Demo — not actually emailed (recorded from the demo dashboard)";
  const res = await fetch("/api/w/live/state", { headers: { "x-dev-user": "athar@nittany.ai" } });
  if (!res.ok) throw new Error(`state fetch failed: HTTP ${res.status}`);
  const state = (await res.json()) as NobleState;
  const ops: object[] = [];
  for (const id of draftIds) {
    const cur = state.db.drafts?.[id];
    if (!cur) continue;
    ops.push({
      op: "put",
      collection: "drafts",
      record: {
        ...cur,
        status: "recorded-sent",
        updatedAt: now,
        recordedAt: now,
        recordedBy: userId,
        recordedChannel: channel,
      },
    });
    ops.push({
      op: "put",
      collection: "activities",
      record: {
        id: uid("act-demo"),
        at: now,
        actorId: userId,
        kind: "intro-recorded",
        text: `Recorded a demo send for this introduction (nothing was emailed)`,
        opportunityId: cur.opportunityId,
      },
    });
  }
  if (ops.length) await tx(ops);
}

/** Patch an existing draft's subject/body (record must stay intact). */
export async function saveDraftEdits(draftId: string, subject: string, body: string): Promise<void> {
  const res = await fetch("/api/w/live/state", { headers: { "x-dev-user": "athar@nittany.ai" } });
  if (!res.ok) throw new Error(`state fetch failed: HTTP ${res.status}`);
  const state = (await res.json()) as NobleState;
  const cur = state.db.drafts?.[draftId];
  if (!cur) throw new Error("draft not found in the live workspace");
  await tx([
    {
      op: "put",
      collection: "drafts",
      record: { ...cur, subject, body, updatedAt: new Date().toISOString() },
    },
  ]);
}

/* --------------------------- papers (OpenAlex) --------------------------- */

export interface Paper {
  title: string;
  year: string | null;
  cited: number;
  url?: string;
}

interface OpenAlexAuthor {
  id: string;
  display_name: string;
  last_known_institution?: { display_name: string };
  last_known_institutions?: { display_name: string }[];
}

interface OpenAlexWork {
  display_name: string;
  publication_year: number | null;
  cited_by_count: number;
  primary_location?: { landing_page_url?: string };
  doi?: string;
}

/** Live OpenAlex lookup — prefer an author at Penn State when disambiguating. */
export async function fetchFacultyPapers(
  name: string,
): Promise<{ author?: string; affiliation?: string; papers: Paper[] }> {
  const mailto = "demo@nittany.ai";
  const q = encodeURIComponent(name);
  const aRes = await fetch(`https://api.openalex.org/authors?search=${q}&per-page=5&mailto=${mailto}`);
  if (!aRes.ok) throw new Error(`OpenAlex authors: HTTP ${aRes.status}`);
  const aJson = (await aRes.json()) as { results?: OpenAlexAuthor[] };
  const authors = aJson.results ?? [];
  if (authors.length === 0) return { papers: [] };
  const instsOf = (a: OpenAlexAuthor) =>
    a.last_known_institutions ?? (a.last_known_institution ? [a.last_known_institution] : []);
  const chosen = authors.find((a) => instsOf(a).some((i) => /pennsylvania state|penn state/i.test(i.display_name))) ?? authors[0];
  const insts = instsOf(chosen);

  const wRes = await fetch(
    `https://api.openalex.org/works?filter=author.id:${chosen.id}&per-page=8&sort=publication_date:desc&mailto=${mailto}`,
  );
  if (!wRes.ok) throw new Error(`OpenAlex works: HTTP ${wRes.status}`);
  const wJson = (await wRes.json()) as { results?: OpenAlexWork[] };
  const papers: Paper[] = (wJson.results ?? []).map((w) => ({
    title: w.display_name,
    year: w.publication_year ? String(w.publication_year) : null,
    cited: w.cited_by_count ?? 0,
    url: w.primary_location?.landing_page_url ?? w.doi ?? undefined,
  }));
  return { author: chosen.display_name, affiliation: insts[0]?.display_name, papers };
}
