import type {
  Company,
  Lane,
  MatchesJson,
  Snapshot,
  TriageState,
} from "@/lib/types";
import { loadMatches } from "@/lib/types";

/** One drill-in signal row across all companies (stable id for triage). */
export interface SignalRow {
  id: string;
  company_id: string;
  company_name: string;
  lane: Lane;
  cross_lane: boolean;
  /** "evidence" = source-backed record, "timing" = market/earnings signal, "post" = social */
  section: "evidence" | "timing" | "post";
  kind: string;
  title: string;
  detail: string;
  date: string; // ISO day, sortable
  source_url: string;
  source: string;
  direction?: string;
  psu_engaged?: boolean;
}

const SIGNAL_IDS = new Set(["week_move", "momentum_6mo", "fresh_high", "fresh_low", "earnings_soon", "hire", "title_change", "reshuffle", "possibly_departed"]);

export function allSignals(companies: Company[]): SignalRow[] {
  const rows: SignalRow[] = [];
  for (const c of companies) {
    for (const ev of c.top_evidence) {
      if (!ev.event_date) continue;
      rows.push({
        id: `${c.company_id}:${ev.event_date}:ev:${rows.length}`,
        company_id: c.company_id,
        company_name: c.name,
        lane: c.lane,
        cross_lane: c.cross_lane,
        section: "evidence",
        kind: ev.psu_engaged ? "psu_engaged" : ev.kind,
        title: ev.excerpt,
        detail: ev.implication,
        date: ev.event_date,
        source_url: ev.source_url,
        source: ev.source,
        psu_engaged: ev.psu_engaged,
      });
    }
    for (const s of c.signals) {
      if (!s.event_date) continue;
      rows.push({
        id: `${c.company_id}:${s.event_date}:sg:${rows.length}`,
        company_id: c.company_id,
        company_name: c.name,
        lane: c.lane,
        cross_lane: c.cross_lane,
        section: SIGNAL_IDS.has(s.kind) ? "timing" : "post",
        kind: s.kind,
        title: s.text,
        detail: "",
        date: s.event_date,
        source_url: s.source_url,
        source: "signal ledger",
        direction: s.direction,
      });
    }
  }
  return rows.sort((a, b) => (a.date === b.date ? (a.company_name < b.company_name ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export function signalBucket(date: string, today = new Date()): "now" | "past" {
  const d = new Date(date + "T00:00:00");
  const days = (today.getTime() - d.getTime()) / 86_400_000;
  return days <= 30 ? "now" : "past";
}

/** Triage persistence — per-viewer, survives reloads in this browser. */
const TRIAGE_KEY = "signals-demo.triage.v1";

export function readTriage(): TriageState {
  try {
    return JSON.parse(localStorage.getItem(TRIAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function writeTriage(state: TriageState) {
  try {
    localStorage.setItem(TRIAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / storage blocked — triage just won't persist */
  }
}

export function matchesFor(matches: MatchesJson | null, companyId: string) {
  return matches?.companies[companyId] ?? null;
}

export { loadMatches };

/** Human label per evidence source key. */
/** One date formatter for the whole app ("May 28, 2026"). */
export function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function companiesForLane(snapshot: Snapshot, lane: Lane | "all"): Company[] {
  const sorted = [...snapshot.companies].sort((a, b) => {
    // Demo-lane companies first, then others alphabetically.
    const laneRank = (l: Lane) => (l === "don" || l === "brian" ? 0 : 1);
    return laneRank(a.lane) - laneRank(b.lane) || a.name.localeCompare(b.name);
  });
  if (lane === "all") return sorted.filter((c) => c.lane !== "unassigned");
  return sorted.filter((c) => c.lane === lane);
}

export function otherCompanies(snapshot: Snapshot): Company[] {
  return [...snapshot.companies]
    .filter((c) => c.lane === "unassigned")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Signal + evidence rows flattened into one freshest-first wall. */
export interface WallRow {
  company: Company;
  date: string | null;
  source_url: string;
  headline: string;
  detail: string;
  source: string;
  kind: string;
}

export function signalWall(companies: Company[]): WallRow[] {
  const rows: WallRow[] = [];
  for (const c of companies) {
    for (const ev of c.top_evidence) {
      rows.push({
        company: c,
        date: ev.event_date,
        source_url: ev.source_url,
        headline: ev.excerpt,
        detail: ev.implication,
        source: ev.source,
        kind: ev.psu_engaged ? "psu_engaged" : ev.kind,
      });
    }
    for (const s of c.signals) {
      rows.push({
        company: c,
        date: s.event_date,
        source_url: s.source_url,
        headline: s.text,
        detail:
          s.kind === "post" || s.kind === "earnings_soon"
            ? "timing / presence — never research-need evidence"
            : `momentum: ${s.direction}`,
        source: "signal",
        kind: s.direction,
      });
    }
  }
  // Cap timing signals per company at 2 (a company's stock + earnings
  // repeats would otherwise flood the wall with near-identical cards).
  const timingSeen = new Map<string, number>();
  const capped = rows.filter((r) => {
    if (r.source !== "signal") return true;
    const n = timingSeen.get(r.company.company_id) ?? 0;
    if (n >= 2) return false;
    timingSeen.set(r.company.company_id, n + 1);
    return true;
  });
  return capped
    .filter((r) => r.date)
    .sort((a, b) => {
      // Freshest first; evidence above catalysts at equal recency (the
      // engine's rule: catalysts are timing-only, never research-need).
      const d = a.date === b.date ? 0 : a.date! < b.date! ? 1 : -1;
      if (d !== 0) return d;
      const w = wallRank(a) - wallRank(b);
      if (w !== 0) return w;
      return a.company.name.localeCompare(b.company.name);
    });
}

/** Wall rank: evidence above catalysts at equal recency. */
const KIND_WEIGHT: Record<string, number> = {
  psu_engaged: 0,
  careers: 1,
  filings: 1,
  patents: 1,
  openalex: 1,
  news_rss: 1,
  psu: 1,
  post: 4,
  week_move: 5,
  momentum_6mo: 5,
  fresh_high: 5,
  fresh_low: 5,
  earnings_soon: 6,
};

export function wallRank(r: WallRow): number {
  return KIND_WEIGHT[r.kind] ?? (r.source === "signal" ? 5 : 2);
}

/** Human label per evidence source key. */
export const SOURCE_LABELS: Record<string, string> = {
  filings: "SEC EDGAR",
  news_rss: "Newsroom / Google News",
  careers: "Job board",
  patents: "USPTO / PatentsView",
  openalex: "OpenAlex (co-authorship)",
  psu: "PSU engagement",
  innovation: "SBIR / CVC",
  market: "Market (timing)",
  signal: "Signal ledger",
};

export function scoreDims(score: Company["score"]): { dim: string; v: number }[] {
  if (!score) return [];
  return score.dims.map((d) => ({ dim: d.dim, v: d.score }));
}

export function parseDissent(score: Company["score"]): { dim: string; scores: number[] }[] {
  if (!score?.dissent) return [];
  try {
    return JSON.parse(score.dissent);
  } catch {
    return [];
  }
}

export const MOMENTUM_LABEL: Record<string, string> = {
  expanding: "Expanding",
  pulling_back: "Pulling back",
  mixed: "Mixed",
  quiet: "Quiet",
  presence: "Presence only",
};
