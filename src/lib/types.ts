/** Shape of public/data/snapshot.json — mirrors scripts/export_snapshot.py. */

export type Lane = "don" | "brian" | "unassigned";

export interface DimScore {
  dim: string;
  score: number;
  justification: string;
  evidence_ids: string[];
}

export interface CompanyScore {
  final: number;
  capped: boolean;
  dims: DimScore[];
  dissent: string; // JSON-encoded array of {dim, scores: [a, b]}
}

export interface EvidenceMeta {
  source: string;
  source_url: string;
  excerpt: string;
  published: string | null;
  event_date: string | null;
  implication: string;
  uncertainty: string;
  kind: string;
  verified: boolean;
  stale: boolean;
  psu_engaged: boolean;
}

export interface SignalEventMeta {
  kind: string;
  direction: "expanding" | "pulling_back" | "presence";
  text: string;
  event_date: string | null;
  source_url: string;
}

export interface MomentumRead {
  direction: "expanding" | "pulling_back" | "mixed" | "quiet";
  window_rows: number;
  by_class: { expanding: number; pulling_back: number; presence: number };
}

export interface InvestmentField {
  field: string;
  spend_note: string;
  latest_date: string | null;
  evidence_ids: string[];
}

export interface Alumnus {
  name: string;
  role: string;
  psu_links: string[];
  relevance: number;
  route: string;
  verified: boolean;
}

export interface Company {
  company_id: string;
  name: string;
  lane: Lane;
  cross_lane: boolean;
  ticker_note: string | null;
  db_path: string;
  evidence: { total: number; verified: number };
  signals: SignalEventMeta[];
  momentum: MomentumRead;
  investment_fields: InvestmentField[];
  alumni: Alumnus[];
  score: CompanyScore | null;
  top_evidence: EvidenceMeta[];
}

export interface Snapshot {
  generated_at: string;
  note: string;
  totals: { companies: number; evidence_total: number; evidence_verified: number };
  companies: Company[];
}

/* ---------------- matches.json (scripts/match_faculty.py) ---------- */

export interface ProfessorMatch {
  rank: number;
  score: number;
  band: "strong" | "moderate" | "weak" | "insufficient";
  reasons: string[];
  candidate: { name: string; unit: string; url: string };
}

export interface FieldMatch {
  field: string;
  latest_date: string | null;
  synthetic_data: boolean;
  results: ProfessorMatch[];
}

export interface CompanyMatches {
  name: string;
  fields_matched: number;
  fields: FieldMatch[];
}

export interface MatchesJson {
  faculty_count: number;
  faculty_file: string;
  synthetic_data: boolean;
  companies: Record<string, CompanyMatches>;
}

/* ---------------- triage state (per-viewer persistence) ------------ */

export type TriageStatus = "new" | "saved" | "dismissed";

export interface TriageState {
  [signalId: string]: TriageStatus;
}

export async function loadSnapshot(url = "/data/snapshot.json"): Promise<Snapshot> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`snapshot fetch failed: HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as Snapshot;
}

export async function loadMatches(url = "/data/matches.json"): Promise<MatchesJson> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`matches fetch failed: HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as MatchesJson;
}

/* ---------------- noble CRM state (GET /api/w/live/state) -------------- */
/* We reuse noble's engine (ingest, matching, workspaces) but render it in
   this app's own UI. Shapes mirror frontend/shared/types.ts. */

export interface NobleSource {
  sourceId: string;
  label: string;
  url?: string;
  retrievedAt: string;
}

export interface NobleCompany {
  id: string;
  name: string;
  industry: string;
  website?: string;
  size: string;
  description: string;
  objectives: string[];
  relationship: string;
  createdAt: string;
  sources: NobleSource[];
}

export interface NobleSignal {
  id: string;
  kind: string;
  title: string;
  detail: string;
  date: string;
  source: NobleSource;
  facultyIds: string[];
  companyIds: string[];
  topics: string[];
  suggestedAction: string;
  status: "new" | "reviewed" | "converted" | "dismissed";
  ingestedBy: string;
}

export interface NobleInterest {
  id: string;
  companyId: string;
  pathway: string;
  title: string;
  description?: string;
  topics: string[];
  status: "open" | "exploring" | "paused" | "fulfilled";
  createdAt: string;
}

export interface NobleUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface NobleOpportunity {
  id: string;
  title: string;
  companyId: string;
  stage: string;
  createdAt: string;
}

/* noble intro draft — mirrors frontend/shared/types.ts IntroDraft */
export interface NobleDraft {
  id: string;
  opportunityId: string;
  facultyId: string;
  reviewId: string;
  subject: string;
  body: string;
  status: "draft" | "recorded-sent";
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  recordedAt?: string;
  recordedBy?: string;
  recordedChannel?: string;
}

export interface NobleDb {
  users: Record<string, NobleUser>;
  companies: Record<string, NobleCompany>;
  signals: Record<string, NobleSignal>;
  interests: Record<string, NobleInterest>;
  faculty: Record<string, Record<string, unknown>>;
  departments?: Record<string, { id: string; name: string; college?: string }>;
  opportunities: Record<string, NobleOpportunity>;
  drafts?: Record<string, NobleDraft>;
}

export interface NobleState {
  db: NobleDb;
  meta?: { workspace: string; authMode: string };
}

const DEV_USER = "athar@nittany.ai"; // dev auth picks a user by email

export async function loadNobleState(workspace = "live"): Promise<NobleState> {
  const res = await fetch(`/api/w/${workspace}/state`, {
    headers: { "x-dev-user": DEV_USER },
  });
  if (!res.ok) {
    throw new Error(`noble state fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as NobleState;
}

/* ------------------- static snapshot fallback (deploys) ------------------- */

export interface NobleMatchResult {
  results?: {
    facultyId: string;
    score: number;
    band: string;
    components?: { key: string; label: string; score: number | null; explanation: string }[];
  }[];
  requestConcepts?: string[];
  inferredConcepts?: string[];
}

export interface NobleSnapshot extends NobleState {
  /** precomputed per-need matches (scripts/export_live.py) */
  matches?: Record<string, NobleMatchResult>;
}

export interface LoadedNoble {
  state: NobleState;
  matches: Record<string, NobleMatchResult>;
  /** true = live noble engine; false = baked snapshot, read-only */
  live: boolean;
}

const SNAPSHOT_URL = "/data/noble-snapshot.json";

/** Live engine first; when it isn't reachable (e.g. a static deploy), fall
    back to the bundled snapshot so the dashboard still renders read-only. */
export async function loadNobleWithFallback(workspace = "live"): Promise<LoadedNoble> {
  try {
    return { state: await loadNobleState(workspace), matches: {}, live: true };
  } catch (liveErr) {
    const res = await fetch(SNAPSHOT_URL);
    if (!res.ok) throw liveErr;
    const snap = (await res.json()) as NobleSnapshot;
    return {
      state: { db: snap.db, meta: snap.meta },
      matches: snap.matches ?? {},
      live: false,
    };
  }
}
