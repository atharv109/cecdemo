import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fmtDate, readTriage, writeTriage, type SignalRow } from "@/lib/data";
import {
  loadNobleState,
  type NobleCompany,
  type NobleDraft,
  type NobleInterest,
  type NobleSignal,
  type NobleState,
  type TriageState,
} from "@/lib/types";
import {
  prepareIntros,
  recordIntrosSent,
  saveDraftEdits,
  firstUserId,
  type IntroCtx,
  type MatchExplanation,
} from "@/lib/intro";
import {
  BulkIntroBar,
  FacultyEmailDrawer,
  IntroStatusChip,
  RowExpansion,
  draftStatuses,
} from "@/components/demo/intro";
import { AreaSparkline } from "@/components/charts/sparkline";
import {
  Panel,
  SectionNav,
  SignalLine,
  weeklyActivity,
} from "@/components/demo/views";
import {
  Avatar,
  StatusChip,
  btnPrimary,
  btnOutline,
} from "@/components/demo/parts";

/* -------------------------------- routing ------------------------------ */

type Route =
  | { view: "home" }
  | { view: "signals" }
  | { view: "faculty" }
  | { view: "companies" }
  | { view: "company"; companyId: string }
  | { view: "match"; needId: string }
  | { view: "studio"; text?: string }
  | { view: "opportunities" };

/* ------------------------- small formatting helpers -------------------- */

const KIND_GLOSS: Record<string, string> = {
  "company-announcement": "Company announcement",
  "company-focus-change": "Focus / market move",
  "funding-announcement": "PSU engagement",
  "new-project": "New project",
  "new-publication": "Publication",
  "new-ip": "IP filed",
};

function kindTone(kind: string): "blue" | "amber" | "green" {
  if (kind === "company-focus-change") return "amber";
  if (kind === "funding-announcement") return "green";
  return "blue";
}

function relDays(date: string): string {
  const t = new Date(date + "T00:00:00").getTime();
  if (Number.isNaN(t)) return date;
  const n = Math.round((Date.now() - t) / 86_400_000);
  if (n <= 0) return "today";
  if (n === 1) return "1 day ago";
  if (n < 30) return `${n} days ago`;
  return fmtDate(date);
}

/* ---------------------------- noble → ui adapters ----------------------- */

function nobleSignalToRow(s: NobleSignal, nameById: Map<string, string>): SignalRow {
  const company = s.companyIds[0];
  return {
    id: s.id,
    company_id: company ?? "",
    company_name: company ? (nameById.get(company) ?? company) : "—",
    lane: "unassigned",
    cross_lane: false,
    section: s.kind === "company-focus-change" ? "timing" : "evidence",
    kind: s.kind,
    title: s.title,
    detail: s.detail,
    date: (s.date ?? "").slice(0, 10),
    source_url: s.source?.url ?? "",
    source: s.source?.label?.split(" (")[0] ?? KIND_GLOSS[s.kind] ?? s.kind,
  };
}

function signals30d(rows: SignalRow[]): number {
  const cut = Date.now() - 30 * 86_400_000;
  return rows.filter((r) => r.date && new Date(r.date + "T00:00:00").getTime() >= cut).length;
}

function fmtBucket(date: string): "now" | "past" {
  return (Date.now() - new Date(date + "T00:00:00").getTime()) / 86_400_000 <= 30
    ? "now"
    : "past";
}

/* ---------------------- match studio (noble engine) --------------------- */

interface MatchResult {
  results?: {
    facultyId: string;
    score: number;
    band: string;
    components?: { key: string; label: string; score: number | null; explanation: string }[];
  }[];
  requestConcepts?: string[];
  inferredConcepts?: string[];
}

function useMatch(need: NobleInterest | null) {
  const [result, setResult] = useState<MatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!need) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    fetch("/api/w/live/match", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dev-user": "athar@nittany.ai" },
      body: JSON.stringify({
        request: {
          text: `${need.title}. ${need.description ?? ""}`,
          engagementType: "research",
          topics: [],
          disciplines: [],
          constraints: {},
        },
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setResult(d))
      .catch((e) => setErr(String(e)))
      .finally(() => setBusy(false));
  }, [need?.id]);
  return { result, busy, err };
}

/* --------------------------------- app --------------------------------- */

export default function App() {
  const [state, setState] = useState<NobleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ view: "home" });
  const [triage, setTriage] = useState<TriageState>(() => readTriage());
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadNobleState().then(setState, (e) => setError(String(e)));
  }, []);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of Object.values(state?.db.companies ?? {})) m.set(c.id, c.name);
    return m;
  }, [state]);

  const companies = useMemo(
    () =>
      Object.values(state?.db.companies ?? {}).sort((a, b) => a.name.localeCompare(b.name)),
    [state],
  );
  const signals = useMemo(
    () =>
      Object.values(state?.db.signals ?? {})
        .map((s) => nobleSignalToRow(s, nameById))
        .filter((r) => r.date)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [state, nameById],
  );
  const needs = useMemo(
    () => Object.values(state?.db.interests ?? {}),
    [state],
  );
  const needsByCompany = useMemo(() => {
    const m = new Map<string, NobleInterest[]>();
    for (const n of needs) {
      const arr = m.get(n.companyId) ?? [];
      arr.push(n);
      m.set(n.companyId, arr);
    }
    return m;
  }, [needs]);
  const signalsByCompany = useMemo(() => {
    const m = new Map<string, SignalRow[]>();
    for (const r of signals) {
      const arr = m.get(r.company_id) ?? [];
      arr.push(r);
      m.set(r.company_id, arr);
    }
    return m;
  }, [signals]);
  const facultyCount = Object.keys(state?.db.faculty ?? {}).length;
  const toTriage = useMemo(() => signals.filter((s) => !triage[s.id]).length, [signals, triage]);
  const userId = useMemo(() => (state ? firstUserId(state) : ""), [state]);
  const refresh = useCallback(async () => {
    try {
      setState(await loadNobleState());
    } catch {
      /* keep the previous state on a failed refresh */
    }
  }, []);
  const last7 = useMemo(
    () =>
      signals.filter((r) => (Date.now() - new Date(r.date + "T00:00:00").getTime()) / 86_400_000 <= 7)
        .length,
    [signals],
  );

  function handleTriage(id: string, status: "saved" | "dismissed" | "new") {
    setTriage((prev) => {
      const next = { ...prev };
      if (status === "new") delete next[id];
      else next[id] = status;
      writeTriage(next);
      return next;
    });
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-xl p-10 text-sm">
        CRM engine unreachable: {error}
        <p className="mt-2 text-muted-foreground">
          Start the noble server (npm run dev in frontend/), then reload.
        </p>
      </div>
    );
  }
  if (!state) {
    return (
      <div role="status" aria-live="polite" className="p-10 text-sm text-muted-foreground">
        Loading live workspace…
      </div>
    );
  }

  const openCompany = (id: string) => setRoute({ view: "company", companyId: id });

  const navItems: { id: string; label: string; count?: string; tone?: "dim" }[] = [
    { id: "home", label: "Overview" },
    { id: "studio", label: "Match Studio" },
    { id: "signals", label: "Signals", count: String(signals.length) },
    { id: "companies", label: "Companies", count: String(companies.length) },
    { id: "opportunities", label: "Opportunities" },
    {
      id: "faculty",
      label: "Faculty",
      count: facultyCount ? String(facultyCount) : "pending",
      tone: facultyCount ? undefined : "dim",
    },
  ];
  const onNav = (id: string) =>
    route.view === id ||
    (id === "companies" && route.view === "company") ||
    (id === "faculty" && route.view === "faculty");

  function quickSearch() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = companies.find((c) => c.name.toLowerCase().includes(q));
    if (hit) {
      openCompany(hit.id);
      setQuery("");
    }
  }

  return (
    <div className="flex min-h-svh">
      {/* ------------------------- dark navy sidebar ------------------------- */}
      <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col bg-primary">
        <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-[10px] font-bold text-white ring-1 ring-white/20">
            PS
          </div>
          <div className="leading-tight text-white">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/50">
              Penn State
            </div>
            <div className="text-[13px] font-semibold">Research Partnerships</div>
          </div>
        </div>

        <nav className="px-2.5 py-3">
          <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Workspace
          </div>
          {navItems.map((item) => {
            const on = onNav(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoute({ view: item.id as Route["view"] } as Route)}
                className={cn(
                  "mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors active:scale-[0.98]",
                  on
                    ? "bg-white/15 font-medium text-white"
                    : "text-white/55 hover:bg-white/10 hover:text-white",
                )}
              >
                {item.label}
                {item.count && (
                  <span
                    className={cn(
                      "tabular-nums text-[11px]",
                      item.tone === "dim" ? "text-white/35 italic" : "text-white/45",
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5">
          <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Watchlist
          </div>
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openCompany(c.id)}
              className={cn(
                "mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors active:scale-[0.98]",
                route.view === "company" && route.companyId === c.id
                  ? "bg-white/15 font-medium text-white"
                  : "text-white/55 hover:bg-white/10 hover:text-white",
              )}
            >
              <Avatar name={c.name} className="h-6 w-6 rounded-md text-[10px]" />
              <span className="truncate">{c.name}</span>
              <span className="ml-auto tabular-nums text-[11px] text-white/35">
                {needsByCompany.get(c.id)?.length ?? ""}
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live workspace
          </div>
          <div className="mt-0.5 text-[10px] text-white/40">real matchengine records</div>
          <p className="mt-2 border-l border-white/15 pl-2 text-[10px] leading-relaxed text-white/40">
            Never contacts anyone. A person reviews, prepares and sends every introduction.
          </p>
        </div>
      </aside>

      {/* ------------------------------- main -------------------------------- */}
      <main className="min-w-0 flex-1">
        {/* topbar */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-6 backdrop-blur">
          <div className="relative w-full max-w-sm">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && quickSearch()}
              placeholder="Search companies… (Enter to open)"
              aria-label="Search companies"
              className="w-full rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-card"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <StatusChip label="Live · matchengine collection" tone="green" />
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                A
              </span>
              <div className="leading-tight">
                <div className="text-xs font-semibold">Athar</div>
                <div className="text-[10px] text-muted-foreground">Administrator</div>
              </div>
            </div>
          </div>
        </header>

        {route.view === "studio" && (
          <StudioView
            initialText={route.text ?? null}
            companies={companies}
            facultyRow={state.db.faculty as Record<string, { name?: string; title?: string; departmentId?: string; profileUrl?: string }>}
            deptRow={state.db.departments as Record<string, { name?: string }> | undefined}
            userId={userId}
            draftsMap={state.db.drafts}
            refresh={refresh}
          />
        )}

        {route.view === "match" &&
          (() => {
            const need = state.db.interests[route.needId];
            return need ? (
              <MatchView
                need={need}
                company={state.db.companies[need.companyId]}
                facultyRow={state.db.faculty as Record<string, { name?: string; title?: string; departmentId?: string; profileUrl?: string }>}
                deptRow={state.db.departments as Record<string, { name?: string }> | undefined}
                userId={userId}
                draftsMap={state.db.drafts}
                refresh={refresh}
                onBack={() => setRoute({ view: "company", companyId: need.companyId })}
                onStudio={() =>
                  setRoute({
                    view: "studio",
                    text: `${need.title}. ${need.description ?? ""}`.trim(),
                  })
                }
              />
            ) : (
              <div className="p-10 text-sm text-muted-foreground">Need not found.</div>
            );
          })()}

        {route.view === "opportunities" && (
          <OpportunitiesView
            state={state}
            onOpen={(id) => setRoute({ view: "company", companyId: id })}
          />
        )}

        {route.view === "company" && state.db.companies[route.companyId] && (
          <NobleCompanyView
            company={state.db.companies[route.companyId]}
            signals={signalsByCompany.get(route.companyId) ?? []}
            needs={needsByCompany.get(route.companyId) ?? []}
            facultyCount={facultyCount}
            onHome={() => setRoute({ view: "companies" })}
            onMatch={(needId) => setRoute({ view: "match", needId })}
          />
        )}

        {route.view === "home" && (
          <HomeView
            companies={companies}
            signals={signals}
            needs={needs}
            needsByCompany={needsByCompany}
            signalsByCompany={signalsByCompany}
            facultyCount={facultyCount}
            toTriage={toTriage}
            last7={last7}
            onOpen={openCompany}
            onTriage={handleTriage}
            onMatch={(needId) => setRoute({ view: "match", needId })}
          />
        )}

        {route.view === "companies" && (
          <CompaniesView
            companies={companies}
            needsByCompany={needsByCompany}
            signalsByCompany={signalsByCompany}
            onOpen={openCompany}
          />
        )}

        {route.view === "signals" && (
          <SignalsTriageView
            signals={signals}
            triage={triage}
            onTriage={handleTriage}
            onOpenCompany={openCompany}
          />
        )}

        {route.view === "faculty" && (
          <FacultyView
            facultyCount={facultyCount}
            facultyRaw={state.db.faculty}
            departments={state.db.departments as Record<string, { id: string; name: string; college?: string }> | undefined}
            needs={needs}
            nameById={nameById}
            onMatch={(needId) => setRoute({ view: "match", needId })}
          />
        )}
      </main>
    </div>
  );
}

/* ------------------------------ company table --------------------------- */

function CompanyTable({
  companies,
  needsByCompany,
  signalsByCompany,
  onOpen,
}: {
  companies: NobleCompany[];
  needsByCompany: Map<string, NobleInterest[]>;
  signalsByCompany: Map<string, SignalRow[]>;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Company</th>
            <th className="px-3 py-2.5 font-medium">Relationship</th>
            <th className="px-3 py-2.5 font-medium">Needs</th>
            <th className="px-3 py-2.5 font-medium">Signals (30d)</th>
            <th className="px-3 py-2.5 font-medium">Activity (8w)</th>
            <th className="px-4 py-2.5 font-medium">Open opportunities</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => {
            const rows = signalsByCompany.get(c.id) ?? [];
            const needs = needsByCompany.get(c.id) ?? [];
            return (
              <tr
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.name} />
                    <div className="leading-tight">
                      <div className="font-medium hover:text-primary">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.industry}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <StatusChip label="Prospect" tone="blue" />
                </td>
                <td className="px-3 py-2.5">
                  <StatusChip label={`${needs.length} ${needs.length === 1 ? "need" : "needs"}`} tone="neutral" dotted={false} />
                </td>
                <td className="px-3 py-2.5 tabular-nums">{signals30d(rows)}</td>
                <td className="px-3 py-2.5">
                  <AreaSparkline data={weeklyActivity(rows, 8)} dataKey="value" height={20} width={80} />
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">—</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------- home view ------------------------------ */

function Kpi({
  label,
  value,
  sub,
  tone,
  children,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "accent";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5",
        tone === "accent" ? "border-primary/25 bg-primary/[0.06]" : "border-border bg-card",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums tracking-tight",
            tone === "accent" && "text-primary",
          )}
        >
          {value}
        </span>
        {children}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function HomeView({
  companies,
  signals,
  needs,
  needsByCompany,
  signalsByCompany,
  facultyCount,
  toTriage,
  last7,
  onOpen,
  onTriage,
  onMatch,
}: {
  companies: NobleCompany[];
  signals: SignalRow[];
  needs: NobleInterest[];
  needsByCompany: Map<string, NobleInterest[]>;
  signalsByCompany: Map<string, SignalRow[]>;
  facultyCount: number;
  toTriage: number;
  last7: number;
  onOpen: (id: string) => void;
  onTriage: (id: string, status: "saved" | "dismissed" | "new") => void;
  onMatch: (needId: string) => void;
}) {
  return (
    <div className="px-6 py-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Research partnerships — daily signals</h1>
        <p className="text-xs text-muted-foreground">
          live company signals → Penn State expertise · catalysts are timing-only · nothing is auto-sent — a person decides
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Signals to triage" value={toTriage} sub="across all companies" tone="accent" />
        <Kpi label="Companies on watch" value={companies.length} sub={`${needs.length} open needs`} />
        <Kpi label="Signals · 7 days" value={last7} sub="freshest activity">
          <AreaSparkline
            data={weeklyActivity(signals, 8)}
            dataKey="value"
            height={22}
            width={72}
          />
        </Kpi>
        <Kpi label="Faculty on file" value={facultyCount || "pending"} sub="required for live matching" />
      </div>

      <Panel title="Companies on watch" count={`${companies.length}`}>
        <CompanyTable
          companies={companies}
          needsByCompany={needsByCompany}
          signalsByCompany={signalsByCompany}
          onOpen={onOpen}
        />
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Freshest signals" count={`${signals.length} total`}>
          <div className="space-y-2 p-3">
            {signals.slice(0, 8).map((row) => (
              <SignalLine key={row.id} row={row} onOpenCompany={onOpen} onTriage={onTriage} />
            ))}
          </div>
        </Panel>

        <Panel title="Needs ready to match" count={`${needs.length}`}>
          <div className="divide-y divide-border/60">
            {needs.slice(0, 10).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onMatch(n.id)}
                className="group block w-full px-4 py-2.5 text-left transition-colors hover:bg-muted/40 active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={name0x(n.companyId, companies)} className="h-7 w-7 rounded-md text-[10px]" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[13px] font-medium">{n.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {n.topics.slice(0, 3).join(" · ")}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Find faculty →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function name0x(companyId: string, companies: NobleCompany[]): string {
  return companies.find((c) => c.id === companyId)?.name ?? companyId;
}

/* -------------------------------- companies ----------------------------- */

function CompaniesView({
  companies,
  needsByCompany,
  signalsByCompany,
  onOpen,
}: {
  companies: NobleCompany[];
  needsByCompany: Map<string, NobleInterest[]>;
  signalsByCompany: Map<string, SignalRow[]>;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="px-6 py-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Companies</h1>
        <p className="text-xs text-muted-foreground">
          organizations under watch, their distinct needs, and how they already connect to Penn State · click a row to open the dossier
        </p>
      </header>
      <Panel count={`${companies.length} records · live matchengine collection`}>
        <CompanyTable
          companies={companies}
          needsByCompany={needsByCompany}
          signalsByCompany={signalsByCompany}
          onOpen={onOpen}
        />
      </Panel>
    </div>
  );
}

/* -------------------------- signals: master-detail ---------------------- */

function SignalsTriageView({
  signals,
  triage,
  onTriage,
  onOpenCompany,
}: {
  signals: SignalRow[];
  triage: TriageState;
  onTriage: (id: string, status: "saved" | "dismissed" | "new") => void;
  onOpenCompany: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"new" | "saved" | "dismissed">("new");
  const [selId, setSelId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      signals.filter((r) =>
        filter === "new" ? !triage[r.id] : triage[r.id] === filter,
      ),
    [signals, triage, filter],
  );
  const sel = (selId && list.find((r) => r.id === selId)) || list[0] || null;
  const isTiming = sel?.section === "timing";
  const savedCount = Object.values(triage).filter((s) => s === "saved").length;
  const dismissedCount = Object.values(triage).filter((s) => s === "dismissed").length;

  return (
    <div className="flex h-[calc(100svh-3.5rem)] min-h-[480px]">
      {/* list pane */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-border bg-card/40">
        <div className="border-b border-border/60 px-4 py-3">
          <h1 className="text-base font-semibold tracking-tight">Signal triage</h1>
          <p className="text-[11px] text-muted-foreground">
            events that might open or change an engagement · a person decides
          </p>
          <div className="mt-2">
            <SectionNav
              tabs={[
                { id: "new", label: "To triage", count: String(signals.filter((r) => !triage[r.id]).length) },
                { id: "saved", label: "Saved", count: String(savedCount) },
                { id: "dismissed", label: "Dismissed", count: String(dismissedCount) },
              ]}
              active={filter}
              onChange={(id: string) => setFilter(id as "new" | "saved" | "dismissed")}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              {filter === "new" ? "Inbox zero — everything triaged." : `Nothing ${filter} yet.`}
            </p>
          )}
          {list.map((row) => {
            const on = sel?.id === row.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelId(row.id)}
                className={cn(
                  "block w-full border-b border-border/40 border-l-2 px-4 py-3 text-left transition-colors",
                  on
                    ? "border-l-primary bg-primary/[0.06]"
                    : "border-l-transparent hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium text-foreground">{row.company_name}</span>
                  <span className="tabular-nums text-muted-foreground">{relDays(row.date)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-snug">{row.title}</p>
                <div className="mt-1.5">
                  <StatusChip
                    label={KIND_GLOSS[row.kind] ?? row.kind}
                    tone={kindTone(row.kind)}
                    dotted={false}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* detail pane */}
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {sel ? (
          <article className="rounded-xl border border-border bg-card p-5" key={sel.id}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip label={KIND_GLOSS[sel.kind] ?? sel.kind} tone={kindTone(sel.kind)} />
              {!triage[sel.id] && <StatusChip label="New" tone="green" />}
              <time dateTime={sel.date} className="text-[11px] tabular-nums text-muted-foreground">
                {fmtDate(sel.date)}
              </time>
            </div>

            <h2 className="mt-2 text-lg font-semibold leading-snug tracking-tight">{sel.title}</h2>

            {!isTiming && sel.detail && (
              <p className="mt-1 text-sm text-muted-foreground">{sel.detail}</p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Affected
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCompany(sel.company_id)}
                  className="mt-2 flex items-center gap-2.5 rounded-lg px-1 py-0.5 text-left transition-colors hover:text-primary active:scale-[0.98]"
                >
                  <Avatar name={sel.company_name} />
                  <span className="text-sm font-medium">{sel.company_name}</span>
                </button>
                {sel.source_url.startsWith("http") && (
                  <a
                    href={sel.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-[11px] text-primary underline-offset-2 hover:underline"
                  >
                    View source ↗
                  </a>
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Suggested next step
                </div>
                <p className="mt-2 text-xs leading-relaxed text-foreground">
                  {isTiming
                    ? "Timing signal only — says now / not-now, never research need. Read the source, then decide when to engage."
                    : "Read the source and decide next step. Nothing is auto-sent."}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Rule-based suggestion. A person decides.
                </p>
              </div>
            </div>

            {!isTiming && (
              <div className="mt-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Why it may matter
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sel.company_name} has open needs sharing these topics — check its page before reaching out.
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
              {triage[sel.id] !== "saved" && (
                <button type="button" className={btnPrimary} onClick={() => onTriage(sel.id, "saved")}>
                  ✓ Save
                </button>
              )}
              {triage[sel.id] !== "dismissed" && (
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => onTriage(sel.id, "dismissed")}
                >
                  ✕ Dismiss
                </button>
              )}
              {(triage[sel.id] === "saved" || triage[sel.id] === "dismissed") && (
                <button type="button" className={btnOutline} onClick={() => onTriage(sel.id, "new")}>
                  ↩ Undo
                </button>
              )}
              <button
                type="button"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onOpenCompany(sel.company_id)}
              >
                Open company page →
              </button>
            </div>
          </article>
        ) : (
          <p className="text-sm text-muted-foreground">
            No signal in this bucket — select the “To triage” tab.
          </p>
        )}
      </div>
    </div>
  );
}

/* --------------------------- company page (noble) ----------------------- */

function NobleCompanyView({
  company,
  signals,
  needs,
  facultyCount,
  onHome,
  onMatch,
}: {
  company: NobleCompany;
  signals: SignalRow[];
  needs: NobleInterest[];
  facultyCount: number;
  onHome: () => void;
  onMatch: (needId: string) => void;
}) {
  const [tab, setTab] = useState("overview");
  const now = signals.filter((r) => fmtBucket(r.date) === "now");
  const past = signals.filter((r) => fmtBucket(r.date) !== "now");

  return (
    <div>
      {/* header */}
      <header className="border-b border-border bg-card px-6 pb-4 pt-4">
        <div className="text-[11px] text-muted-foreground">
          <button type="button" onClick={onHome} className="hover:text-foreground hover:underline">
            Companies
          </button>
          <span className="mx-1.5">›</span>
          {company.industry}
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar name={company.name} className="h-12 w-12 rounded-xl text-lg" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{company.name}</h1>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{company.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip label={`${company.relationship} relationship`} tone="blue" />
                <StatusChip
                  label={`${needs.length} needs on record`}
                  tone="neutral"
                  dotted={false}
                />
                <StatusChip label={`${signals.length} signals`} tone="neutral" dotted={false} />
              </div>
            </div>
          </div>
          <button type="button" onClick={onHome} className={cn(btnOutline, "shrink-0")}>
            ← All companies
          </button>
        </div>
      </header>

      {/* tab nav */}
      <nav className="border-b border-border/70 bg-card px-6 py-2">
        <SectionNav
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "signals", label: "Signals", count: String(signals.length) },
            { id: "needs", label: "Research & talent needs", count: String(needs.length) },
          ]}
          active={tab}
          onChange={setTab}
        />
      </nav>

      <div className="px-6 py-5">
        {tab === "overview" && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <Panel title="Signal activity · 12 weeks">
                <div className="px-5 pb-5 pt-4">
                  <AreaSparkline
                    data={weeklyActivity(signals)}
                    dataKey="value"
                    fill="gradient"
                    height={64}
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>12 wks ago</span>
                    <span className="tabular-nums">{now.length} in the last 30 days</span>
                    <span>this week</span>
                  </div>
                </div>
              </Panel>

              <Panel title="Engagement objectives" action={<span className="text-[10px] text-muted-foreground">from investment fields</span>}>
                <div className="px-5 py-4">
                  {company.objectives.length > 0 ? (
                    <ul className="space-y-1.5">
                      {company.objectives.map((o) => (
                        <li key={o} className="flex gap-2 text-sm">
                          <span className="text-muted-foreground">→</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      no synthesis yet — collecting
                    </p>
                  )}
                </div>
              </Panel>
            </div>

            <div className="space-y-5">
              <Panel title="Record">
                <dl className="space-y-2 px-4 pb-4 pt-3 text-xs">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Relationship
                    </dt>
                    <dd className="mt-0.5">{company.relationship}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Added
                    </dt>
                    <dd className="mt-0.5 tabular-nums">{fmtDate(company.createdAt?.slice(0, 10))}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Source
                    </dt>
                    <dd className="mt-0.5">matchengine live collection (nittany-ai)</dd>
                  </div>
                </dl>
              </Panel>
              <Panel title="Faculty matching">
                <div className="px-5 pb-5 pt-3 text-xs text-muted-foreground">
                  {facultyCount === 0 ? (
                    <>
                      Every need below is match-ready. The real faculty list hasn’t been ingested
                      yet — once it is, “Find faculty” ranks actual Penn State researchers per need.
                    </>
                  ) : (
                    `${facultyCount} researchers on file — run Find faculty per need.`
                  )}
                </div>
              </Panel>
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Suggested engagement pathways
                </h2>
                <span className="text-[10px] text-muted-foreground">rule-based · a person decides</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
                  <StatusChip label="Sponsored research" tone="blue" dotted={false} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {needs.length} recorded need{needs.length === 1 ? "" : "s"} with topic tokens —
                    run Find faculty per need.
                  </p>
                </div>
                <div className="rounded-xl border border-amber-600/20 bg-amber-50/60 p-4">
                  <StatusChip label="Talent & recruiting" tone="amber" dotted={false} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    No current signal for this pathway · 0 recorded needs.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <StatusChip label="Brand & engagement" tone="neutral" dotted={false} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    No campus visibility activity recorded yet · 0 recorded needs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "signals" && (
          <div className="mx-auto max-w-4xl space-y-6">
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current (last 30 days) · {now.length}
              </h2>
              <div className="space-y-2">
                {now.map((row) => (
                  <SignalLine key={row.id} row={row} compact onOpenCompany={() => {}} />
                ))}
                {now.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                    none in the last 30 days
                  </p>
                )}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Past · {past.length}
              </h2>
              <div className="space-y-2">
                {past.slice(0, 30).map((row) => (
                  <SignalLine key={row.id} row={row} compact onOpenCompany={() => {}} />
                ))}
                {past.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                    nothing on record yet
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "needs" && (
          <div className="grid gap-3 md:grid-cols-2">
            {needs.map((n) => (
              <article key={n.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <StatusChip label="Sponsored research" tone="blue" dotted={false} />
                  <StatusChip label={n.status} tone={n.status === "open" ? "green" : "neutral"} />
                </div>
                <h3 className="mt-2.5 text-sm font-semibold tracking-tight">{n.title}</h3>
                {n.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {n.topics.slice(0, 5).map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-3 border-t border-border/50 pt-3">
                  <button type="button" className={btnPrimary} onClick={() => onMatch(n.id)}>
                    Find faculty
                  </button>
                </div>
              </article>
            ))}
            {needs.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">no needs synthesized yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- match view ----------------------------- */

function MatchView({
  need,
  company,
  facultyRow,
  deptRow,
  userId,
  draftsMap,
  refresh,
  onBack,
  onStudio,
}: {
  need: NobleInterest;
  company: NobleCompany | undefined;
  facultyRow?: Record<string, { name?: string; title?: string; departmentId?: string; profileUrl?: string }>;
  deptRow?: Record<string, { name?: string }>;
  userId: string;
  draftsMap: Record<string, NobleDraft> | undefined;
  refresh: () => void;
  onBack: () => void;
  onStudio: () => void;
}) {
  const { result, busy, err } = useMatch(need);
  return (
    <div className="mx-auto max-w-3xl px-6 py-5">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-xs text-muted-foreground hover:text-foreground"
      >
        ← back to {company?.name ?? "company"}
      </button>

      <div className="flex items-start gap-3">
        <Avatar name={company?.name ?? need.companyId} className="h-10 w-10 rounded-lg text-sm" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{need.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{company?.name}</span>
            <StatusChip label="Sponsored research" tone="blue" dotted={false} />
            {need.topics.slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {busy && (
        <div className="mt-5 space-y-2" role="status" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border border-border bg-muted/40"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      )}

      {err && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {err}
        </div>
      )}

      {result && (
        <div className="mt-5">
          <MatchResultsList
            result={result}
            facultyRow={facultyRow}
            deptRow={deptRow}
            intro={{
              ctx: {
                needTitle: need.title,
                needDescription: need.description || undefined,
                company: company ? { id: company.id, name: company.name } : undefined,
                interestId: need.id,
                whyLine: "direct research-concept coverage",
              },
              userId,
              draftsMap,
              refresh,
            }}
          />
          {result.results?.length === 0 && (
            <div className="mt-3 flex justify-center">
              <button type="button" className={btnOutline} onClick={onStudio}>
                Open Match Studio to refine the search →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------- shared match-results render --------------------- */

export interface IntroPanelProps {
  ctx: IntroCtx;
  userId: string;
  draftsMap: Record<string, NobleDraft> | undefined;
  refresh: () => void;
}

function whyLineFor(result: MatchResult, facultyId: string): {
  parts: MatchExplanation[];
  line: string;
} {
  const all = (result.results ?? []).find((r) => r.facultyId === facultyId)?.components ?? [];
  // the draft cites only positive evidence — "not assessed" blanks stay in the drawer
  const positive = all.filter((p) => p.score != null && p.score > 0 && p.explanation);
  const parts = positive.length ? positive : all;
  const line =
    parts
      .slice(0, 3)
      .map((p) => p.explanation.replace(/\s+/g, " ").trim())
      .join(", ")
      .replace(/[.;]+$/, "") || "direct research-concept coverage";
  return { parts, line };
}

function MatchResultsList({
  result,
  facultyRow,
  deptRow,
  intro,
}: {
  result: MatchResult;
  facultyRow?: Record<string, { name?: string; title?: string; departmentId?: string; profileUrl?: string }>;
  deptRow?: Record<string, { name?: string }>;
  intro?: IntroPanelProps;
}) {
  /* hooks (always run — the early return below comes after) */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean | null>(null);
  const [autoPrepping, setAutoPrepping] = useState<string[]>([]);
  const [introErr, setIntroErr] = useState<string | null>(null);
  const [localDrafts, setLocalDrafts] = useState<
    Record<string, { draftId: string; subject: string; body: string; st: "drafted" | "sent" }>
  >({});
  /* fresh reads inside async chains (doPrepare → doSend in one press) */
  const localDraftsRef = useRef(localDrafts);

  const stateStatuses = useMemo(() => draftStatuses(intro?.draftsMap), [intro?.draftsMap]);
  const statusFor = (facultyId: string): "drafted" | "sent" | undefined =>
    localDrafts[facultyId]?.st ?? stateStatuses[facultyId];

  /* auto-draft: opening the email drawer makes the draft if none exists */
  useEffect(() => {
    if (!intro || !drawerId) return;
    if (autoPrepping.includes(drawerId)) return;
    if (localDrafts[drawerId] || stateStatuses[drawerId]) return;
    setAutoPrepping((prev) => [...prev, drawerId]);
    (() => {
      const prep = doPrepareSingle(drawerId);
      prep.finally(() =>
        setAutoPrepping((prev) => prev.filter((x) => x !== drawerId)),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerId, intro?.draftsMap]);

  if (!result.results?.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-5 py-6 text-center">
        <div className="text-sm font-medium">
          {Object.keys(facultyRow ?? {}).length === 0
            ? "No faculty ingested yet"
            : "No faculty above the band cutoff"}
        </div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {Object.keys(facultyRow ?? {}).length === 0
            ? "Every need is match-ready — the real faculty list fills this instantly once ingested."
            : (result.inferredConcepts?.length ?? 0) === 0
              ? "The matcher found no research concept in this wording — rephrase it in Match Studio (e.g. add concrete research topics)."
              : "This need’s topics didn’t reach the possible-band cutoff with the current faculty file."}
        </p>
      </div>
    );
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function doPrepare(ids: string[]) {
    if (!intro) return;
    // don't duplicate drafts for faculty that already have one
    const fresh = ids.filter((id) => statusFor(id) === undefined);
    if (fresh.length === 0) return;
    setBusy(true);
    setIntroErr(null);
    try {
      const whyByFaculty = Object.fromEntries(fresh.map((id) => [id, whyLineFor(result, id).line]));
      const prepared = await prepareIntros({
        ctx: intro.ctx,
        faculty: fresh.map((id) => ({ facultyId: id, facultyName: facultyRow?.[id]?.name ?? id })),
        userId: intro.userId,
        whyByFaculty,
      });
      {
        const next = {
          ...localDraftsRef.current,
          ...Object.fromEntries(
            prepared.map((p) => [
              p.draft.facultyId,
              { draftId: p.draft.id, subject: p.draft.subject, body: p.draft.body, st: "drafted" as const },
            ]),
          ),
        };
        localDraftsRef.current = next;
        setLocalDrafts(next);
      }
      intro.refresh();
    } catch (e) {
      setIntroErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  /* single-faculty prepare, used by the email drawer's auto-draft */
  const doPrepareSingle = (id: string): Promise<void> => doPrepare([id]);

  /* one press: draft everything not drafted yet, then record all as sent */
  async function doDraftAndSend(ids: string[]) {
    const fresh = ids.filter((id) => statusFor(id) === undefined);
    if (fresh.length) await doPrepare(fresh);
    await doSend(ids);
  }

  async function doSend(ids: string[]) {
    if (!intro) return;
    setBusy(true);
    setIntroErr(null);
    try {
      const stateIds: string[] = [];
      for (const id of ids) {
        if (statusFor(id) === "sent") continue;
        const local = localDraftsRef.current[id];
        if (local) {
          // persist any composer edits before recording the send
          await saveDraftEdits(local.draftId, local.subject, local.body);
          stateIds.push(local.draftId);
        } else {
          const d = Object.values(intro.draftsMap ?? {}).find((x) => x.facultyId === id);
          if (d) stateIds.push(d.id);
        }
      }
      await recordIntrosSent(stateIds, intro.userId);
      {
        const next = { ...localDraftsRef.current };
        for (const id of ids) if (next[id]) next[id] = { ...next[id], st: "sent" as const };
        localDraftsRef.current = next;
        setLocalDrafts(next);
      }
      setSelected(new Set());
      intro.refresh();
    } catch (e) {
      setIntroErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  const drawerFaculty = drawerId ? (facultyRow?.[drawerId] ?? null) : null;
  /* subject/body come from the engine's own draft record when one already
     exists — otherwise the composer stays blank and auto-draft fills it */
  const stateDraftRec = drawerId
    ? Object.values(intro?.draftsMap ?? {}).find((d) => d.facultyId === drawerId)
    : undefined;
  const drawerDraft = drawerId
    ? (localDrafts[drawerId] ??
      (stateDraftRec
        ? {
            draftId: stateDraftRec.id,
            subject: stateDraftRec.subject,
            body: stateDraftRec.body,
            st: stateDraftRec.status === "recorded-sent" ? ("sent" as const) : ("drafted" as const),
          }
        : {
            subject: "",
            body: "",
            draftId: "",
            st: (stateStatuses[drawerId] ?? "drafted") as "drafted" | "sent",
          }))
    : null;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ranked Penn State matches · real faculty directory · baseline matcher
        </span>
        {result.inferredConcepts && result.inferredConcepts.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            topics read from the need: {result.inferredConcepts.join(", ")}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {result.results.slice(0, 8).map((c, i) => {
          const f = facultyRow?.[c.facultyId];
          const dept = f?.departmentId ? deptRow?.[String(f.departmentId)] : undefined;
          const bandTone =
            c.band === "strong" ? "green" : c.band === "good" ? "blue" : "amber";
          const st = statusFor(c.facultyId);
          const why = whyLineFor(result, c.facultyId);
          const open = expanded === c.facultyId;
          return (
            <div key={c.facultyId}>
              <div
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors",
                  selected.has(c.facultyId) ? "border-primary/50 bg-primary/[0.04]" : "border-border",
                )}
              >
                {intro && (
                  <input
                    type="checkbox"
                    checked={selected.has(c.facultyId)}
                    onChange={() => toggle(c.facultyId)}
                    aria-label={`Select ${f?.name ?? c.facultyId} for introduction`}
                    className="h-3.5 w-3.5 shrink-0 self-center accent-[var(--primary)]"
                  />
                )}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : c.facultyId)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 text-left active:scale-[0.99]"
                >
                  <div className="truncate text-sm font-medium hover:text-primary">
                    {f?.name ?? c.facultyId}
                    <span className="ml-1.5 text-[10px] text-muted-foreground">{open ? "▾" : "▸"}</span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {dept?.name ?? f?.title ?? ""}
                    {f?.profileUrl && (
                      <>
                        {" · "}
                        <a
                          href={f.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          profile ↗
                        </a>
                      </>
                    )}
                  </div>
                </button>
                <StatusChip label={c.band} tone={bandTone} dotted={false} />
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums">
                  {c.score}
                </span>
                {st && <IntroStatusChip status={st} />}
                {intro && (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.97]"
                    onClick={() => setDrawerId(c.facultyId)}
                  >
                    Draft
                  </button>
                )}
              </div>
              {open && (
                <RowExpansion
                  parts={why.parts}
                  whyLine={why.line}
                  facultyName={f?.name ?? ""}
                />
              )}
            </div>
          );
        })}
      </div>

      {introErr && (
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {introErr}
        </div>
      )}

      {intro && (
        <div className="mt-3">
          <BulkIntroBar
            selected={[...selected]}
            statuses={Object.fromEntries(
              [...selected].map((id) => [id, statusFor(id)]),
            )}
            onAction={() => doDraftAndSend([...selected])}
            busy={busy}
          />
        </div>
      )}

      {intro && drawerFaculty && drawerId && (
        <FacultyEmailDrawer
          facultyId={drawerId}
          facultyRow={facultyRow}
          deptRow={deptRow}
          draft={{
            subject: drawerDraft?.subject ?? "",
            body: drawerDraft?.body ?? "",
          }}
          status={statusFor(drawerId)}
          autoPrep={autoPrepping.includes(drawerId)}
          onSaveSubjectBody={(id, subject, body) => {
            const local = localDraftsRef.current[id];
            if (local) {
              const next = { ...localDraftsRef.current, [id]: { ...local, subject, body } };
              localDraftsRef.current = next;
              setLocalDrafts(next);
              saveDraftEdits(local.draftId, subject, body)
                .then(intro.refresh)
                .catch((e) => setIntroErr(String(e)));
            }
          }}
          onSend={(id) => doSend([id])}
          onClose={() => setDrawerId(null)}
        />
      )}
    </>
  );
}

/* ------------------------------ match studio ----------------------------- */

function useMatchText() {
  const [result, setResult] = useState<MatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    fetch("/api/w/live/match", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dev-user": "athar@nittany.ai" },
      body: JSON.stringify({
        request: {
          text,
          engagementType: "research",
          topics: [],
          disciplines: [],
          constraints: {},
        },
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setResult(d))
      .catch((e) => setErr(String(e)))
      .finally(() => setBusy(false));
  };
  return { result, busy, err, run };
}

function StudioView({
  initialText,
  companies,
  facultyRow,
  deptRow,
  userId,
  draftsMap,
  refresh,
}: {
  initialText: string | null;
  companies: NobleCompany[];
  facultyRow?: Record<string, { name?: string; title?: string; departmentId?: string; profileUrl?: string }>;
  deptRow?: Record<string, { name?: string }>;
  userId: string;
  draftsMap: Record<string, NobleDraft> | undefined;
  refresh: () => void;
}) {
  const [text, setText] = useState(initialText ?? "");
  const { result, busy, err, run } = useMatchText();

  useEffect(() => {
    if (initialText) run(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Match Studio</h1>
        <p className="text-xs text-muted-foreground">
          describe the research the company is looking for — ranked Penn State faculty, live · nothing is auto-sent
        </p>
      </header>

      <form
        className="rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(text);
        }}
      >
        <label
          htmlFor="studio-query"
          className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Research need
        </label>
        <textarea
          id="studio-query"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. autonomous underwater vehicles for mine countermeasures · post-quantum cryptography migration · biofuel combustion in gas turbines"
          className="mt-1.5 w-full resize-y rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:bg-card"
        />
        <div className="mt-2 flex items-center gap-2">
          <button type="submit" className={btnPrimary} disabled={busy || !text.trim()}>
            Match faculty
          </button>
          <span className="text-[10px] text-muted-foreground">
            {companies.length} companies under watch · the matcher reads research concepts from your text
          </span>
        </div>
      </form>

      {busy && (
        <div className="mt-5 space-y-2" role="status" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border border-border bg-muted/40"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      )}

      {err && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {err}
        </div>
      )}

      {result && (
        <div className="mt-5">
          <MatchResultsList
            result={result}
            facultyRow={facultyRow}
            deptRow={deptRow}
            intro={{
              ctx: {
                needTitle: text.trim().slice(0, 80),
                searchText: text.trim(),
                whyLine: "direct research-concept coverage",
              },
              userId,
              draftsMap,
              refresh,
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------ opportunities ---------------------------- */

function OpportunitiesView({
  state,
  onOpen,
}: {
  state: NobleState;
  onOpen: (id: string) => void;
}) {
  const opps = Object.values(state.db.opportunities ?? {}).sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Engagement pipeline</h1>
        <p className="text-xs text-muted-foreground">
          every opportunity by stage · moving a card never contacts anyone
        </p>
      </header>
      {opps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <div className="text-sm font-medium">Pipeline is empty</div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Save a signal in triage, then convert it into an opportunity here — conversions are a
            person’s decision, never automatic.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {opps.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onOpen(o.companyId)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40",
                "active:scale-[0.99]",
              )}
            >
              <Avatar name={o.title} />
              <span className="flex-1 truncate text-sm font-medium">{o.title}</span>
              <StatusChip label={o.stage} tone="blue" dotted={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- faculty ------------------------------- */

interface FacultyRowView {
  id: string;
  name: string;
  title: string;
  deptName: string;
  college: string;
  keywords: string[];
  email: string;
  profileUrl: string;
  labName: string;
  availability: string;
  summary: string;
}

function facultyRowsView(
  facultyRaw: Record<string, Record<string, unknown>>,
  departments: Record<string, { id: string; name: string; college?: string }> | undefined,
): FacultyRowView[] {
  const out: FacultyRowView[] = [];
  for (const [id, r] of Object.entries(facultyRaw)) {
    const name = typeof r.name === "string" ? r.name : "";
    if (!name) continue;
    const deptId = typeof r.departmentId === "string" ? r.departmentId : "";
    const dept = departments?.[deptId];
    out.push({
      id,
      name,
      title: typeof r.title === "string" ? r.title : "",
      deptName: dept?.name ?? "",
      college: dept?.college ?? "",
      keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
      email: typeof r.email === "string" ? r.email : "",
      profileUrl: typeof r.profileUrl === "string" ? r.profileUrl : "",
      labName: typeof r.labName === "string" ? r.labName : "",
      availability: typeof r.availability === "string" ? r.availability : "",
      summary: typeof r.summary === "string" ? r.summary : "",
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function FacultyView({
  facultyCount,
  facultyRaw,
  departments,
  needs,
  nameById,
  onMatch,
}: {
  facultyCount: number;
  facultyRaw: Record<string, Record<string, unknown>>;
  departments: Record<string, { id: string; name: string; college?: string }> | undefined;
  needs: NobleInterest[];
  nameById: Map<string, string>;
  onMatch: (needId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(
    () => facultyRowsView(facultyRaw, departments),
    [facultyRaw, departments],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.title.toLowerCase().includes(needle) ||
        r.deptName.toLowerCase().includes(needle) ||
        r.college.toLowerCase().includes(needle) ||
        r.keywords.some((k) => k.toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  return (
    <div className="px-6 py-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Faculty</h1>
        <p className="text-xs text-muted-foreground">
          University Park researchers, live from the PSU directory · searchable by name, department or expertise
        </p>
      </header>

      {facultyCount > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-card px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-lg font-semibold tabular-nums">{facultyCount.toLocaleString()}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                researchers · 32 open company needs can run “Find faculty” right now
              </span>
            </div>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(50);
              }}
              placeholder="Search name, title, department, expertise…"
              aria-label="Search faculty"
              className="w-full max-w-xs rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-card sm:w-72"
            />
          </div>
        </div>
      )}

      {facultyCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          No researchers on file yet — drop the faculty list and ingest to fill every “Find faculty” match.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Researcher</th>
                  <th className="px-3 py-2.5 font-medium">Department</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-4 py-2.5 font-medium">Availability</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.name} />
                          <div className="leading-tight">
                            <div className="font-medium">{r.name}</div>
                            <div className="max-w-[320px] truncate text-[11px] text-muted-foreground">
                              {r.title}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[260px] px-3 py-2">
                        <div className="truncate text-[13px]">{r.deptName || "—"}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{r.college}</div>
                      </td>
                      <td className="px-3 py-2">
                        {r.email ? (
                          <a
                            href={`mailto:${r.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary underline-offset-2 hover:underline"
                          >
                            {r.email}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <StatusChip
                          label={r.availability === "unknown" ? "not confirmed" : r.availability}
                          tone={r.availability === "unknown" ? "neutral" : "green"}
                        />
                      </td>
                    </tr>
                    {openId === r.id && (
                      <tr className="border-b border-border/40">
                        <td colSpan={4} className="bg-muted/20 px-5 py-3.5">
                          <div className="grid gap-4 text-xs md:grid-cols-2">
                            <div>
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Research areas / keywords
                              </div>
                              {r.keywords.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {r.keywords.slice(0, 12).map((k) => (
                                    <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">none listed</span>
                              )}
                              {r.summary && <p className="mt-2 text-muted-foreground">{r.summary}</p>}
                              {r.labName && (
                                <p className="mt-1.5">
                                  <span className="text-muted-foreground">Lab: </span>
                                  <a href={r.labName} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                    lab site ↗
                                  </a>
                                </p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Record
                              </div>
                              <div>
                                <span className="text-muted-foreground">Email: </span>
                                {r.email || "—"}
                                <span className="mx-1 text-muted-foreground">·</span>
                                <span className="text-muted-foreground">id: </span>
                                <span className="tabular-nums">{r.id}</span>
                              </div>
                              <div>
                                {r.profileUrl ? (
                                  <a href={r.profileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                    Full directory profile ↗
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">no profile URL</span>
                                )}
                              </div>
                              <div className="text-muted-foreground">
                                Source: PSU University Park Faculty directory (Nov 2026) · coverage note: directory row —
                                no project/publication coverage yet
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              showing {Math.min(limit, filtered.length)} of {filtered.length.toLocaleString()}
              {q && ` (filtered from ${rows.length.toLocaleString()})`}
            </span>
            {limit < filtered.length && (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setLimit(limit + 50)}>
                Load 50 more ↓
              </button>
            )}
          </div>
        </div>
      )}

      {needs.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Needs waiting on faculty · first 8
          </div>
          <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
            {needs.slice(0, 8).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onMatch(n.id)}
                className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-muted/40 active:scale-[0.98]"
              >
                <div className="text-[13px] font-medium">{n.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {nameById.get(n.companyId) ?? n.companyId} · {n.topics.slice(0, 4).join(", ")}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
