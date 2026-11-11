import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Gauge } from "@/components/charts/gauge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  allSignals,
  fmtDate,
  signalBucket,
  SOURCE_LABELS,
  type SignalRow,
} from "@/lib/data";
import type {
  Company,
  MatchesJson,
  TriageState,
} from "@/lib/types";
import { LaneTag, MomentumChip, UncertaintyBadge } from "@/components/demo/parts";
import { AreaSparkline } from "@/components/charts/sparkline";

/** Weekly signal counts (last 12 weeks) for a company, oldest first. */
export function weeklyActivity(rows: { date: string }[], weeks = 12): { week: string; value: number }[] {
  const now = new Date();
  const out: { week: string; value: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 86_400_000);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    const n = rows.filter((r) => {
      const d = new Date(r.date + "T00:00:00");
      return d > start && d <= end;
    }).length;
    out.push({ week: `w${weeks - i}`, value: n });
  }
  return out;
}

/* ------------------------------ panels/kpis ---------------------------- */

export function Panel({
  title,
  count,
  action,
  children,
  className,
}: {
  title?: string;
  count?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {count && (
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function BandChip({ band }: { band: string }) {
  const tone: Record<string, string> = {
    strong: "text-emerald-800 bg-emerald-50 ring-emerald-600/20",
    moderate: "text-primary bg-primary/10 ring-primary/25",
    weak: "text-amber-800 bg-amber-50 ring-amber-600/25",
    insufficient: "text-muted-foreground bg-muted ring-border",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        tone[band] ?? tone.insufficient,
      )}
    >
      {band}
    </span>
  );
}

const KIND_GLOSS: Record<string, string> = {
  /* matchengine evidence-source kinds */
  filings: "SEC filing",
  news_rss: "News story",
  careers: "Job posting",
  patents: "Patent",
  openalex: "Co-authored publication",
  psu: "PSU engagement",
  psu_engaged: "Already engaged with Penn State",
  week_move: "Stock move (7d)",
  momentum_6mo: "Momentum (6mo)",
  fresh_high: "52-week high",
  fresh_low: "52-week low",
  earnings_soon: "Earnings window",
  hire: "New hire",
  reshuffle: "Team reshuffle",
  possibly_departed: "Possible departure",
  post: "Social post",
  signal: "Signal",
  /* noble ingested signal kinds (matchengine export) */
  "company-announcement": "Company announcement",
  "company-focus-change": "Focus / market move",
  "funding-announcement": "PSU engagement",
  "new-project": "New project",
  "new-publication": "Publication",
  "new-ip": "IP filed",
};

export function SectionNav({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              "active:scale-[0.97]",
              on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {on && !reduce && (
              <motion.span
                layoutId="section-nav-pill"
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className="absolute inset-0 rounded-full bg-primary"
              />
            )}
            {on && reduce && <span className="absolute inset-0 rounded-full bg-primary" />}
            <span className="relative z-10">
              {t.label}
              {t.count ? ` · ${t.count}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------- signal rows ------------------------------ */

export function SignalLine({
  row,
  onOpenCompany,
  triage,
  onTriage,
  compact,
}: {
  row: SignalRow;
  onOpenCompany: (id: string) => void;
  triage?: TriageState;
  onTriage?: (id: string, status: "saved" | "dismissed" | "new") => void;
  compact?: boolean;
}) {
  const isTiming = row.section === "timing";
  const status = triage?.[row.id];
  const isLinkable = row.source_url.startsWith("http");
  return (
    <article
      className={cn(
        "group rounded-xl border bg-card transition-colors",
        status === "dismissed" && "opacity-45",
        status === "saved" && "border-primary/40 bg-primary/[0.04]",
        compact ? "px-4 py-2.5" : "px-4 py-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => onOpenCompany(row.company_id)}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {row.company_name}
        </button>
        <span>·</span>
        <span>{KIND_GLOSS[row.kind] ?? row.kind}</span>
        <span>·</span>
        <time dateTime={row.date} className="tabular-nums">
          {fmtDate(row.date)}
        </time>
        {row.psu_engaged && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            already engaged
          </span>
        )}
        {status === "saved" && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            saved
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-1 text-sm leading-snug",
          status === "dismissed" && "text-muted-foreground line-through",
        )}
      >
        {row.title}
      </p>
      {!isTiming && row.detail && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">Why it matters: </span>
          {row.detail}
        </p>
      )}
      {isTiming && (
        <p className="text-[11px] text-muted-foreground">
          Timing signal — when to engage, not what the company needs.
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {isLinkable && (
          <a
            href={row.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-primary underline-offset-2 hover:underline"
          >
            View source ↗
          </a>
        )}
        {onTriage && (
          <span className="flex gap-2 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onTriage(row.id, "saved")}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 active:scale-[0.97]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => onTriage(row.id, "dismissed")}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted active:scale-[0.97]"
            >
              Dismiss
            </button>
          </span>
        )}
      </div>
    </article>
  );
}

/* -------------------------- faculty match list ------------------------- */

export function FieldMatchList({ cm }: { cm: NonNullable<MatchesJson["companies"][string]> }) {
  return (
    <div className="space-y-4">
      {cm.fields.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">
          No investment fields yet — the fields-synthesis stage hasn't run for this company.
        </p>
      )}
      {cm.fields.map((f) => (
        <div key={f.field}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {f.field}
            </h3>
            {f.latest_date && (
              <span className="text-xs text-muted-foreground">
                · as of {fmtDate(f.latest_date)}
              </span>
            )}
            {f.synthetic_data && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-600/25">
                matches from the synthetic faculty list
              </span>
            )}
          </div>
          {f.results.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
              no faculty above the weak-band cutoff — load the real faculty list, then re-run match_faculty.py
            </p>
          ) : (
            <ul className="space-y-2">
              {f.results.map((r) => (
                <li key={r.candidate.name} className="rounded-xl border border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="tabular-nums text-xs text-muted-foreground">#{r.rank}</span>
                    <span className="font-medium">{r.candidate.name}</span>
                    <BandChip band={r.band} />
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {r.score}/100
                    </span>
                    {r.candidate.url && (
                      <a
                        href={r.candidate.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-primary underline-offset-2 hover:underline">
                        profile ↗
                      </a>
                    )}
                  </div>
                  {r.candidate.unit && (
                    <div className="text-xs text-muted-foreground">{r.candidate.unit}</div>
                  )}
                  <ul className="mt-1 text-[11px] text-muted-foreground">
                    {r.reasons.map((reason) => (
                      <li key={reason}>· {reason}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- company page ----------------------------- */

export function CompanyPage({
  company,
  matches,
  onHome,
}: {
  company: Company;
  matches: MatchesJson | null;
  onHome: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const reduce = useReducedMotion();
  const signals = useMemo(() => allSignals([company]), [company]);
  const now = signals.filter((r) => signalBucket(r.date) === "now");
  const past = signals.filter((r) => signalBucket(r.date) !== "now");
  const cm = matches?.companies[company.company_id] ?? null;

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onHome}
            className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground active:scale-[0.97]"
          >
            ← back
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{company.name}</h1>
              <LaneTag lane={company.lane} />
              {company.cross_lane && (
                <Badge variant="outline" className="text-[11px]">
                  cross-lane · owner unconfirmed
                </Badge>
              )}
              <MomentumChip direction={company.momentum.direction} />
            </div>
            {company.ticker_note && (
              <div className="text-xs text-muted-foreground">
                filings via {company.ticker_note}
              </div>
            )}
          </div>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {company.evidence.verified.toLocaleString()} verified evidence rows
        </div>
      </header>

      <nav className="flex items-center gap-1 border-b border-border/70 px-6 py-3">
        <SectionNav
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "signals", label: "Signals", count: String(signals.length) },
            {
              id: "faculty",
              label: "Faculty matches",
              count: cm ? String(cm.fields_matched) : undefined,
            },
            { id: "evidence", label: "Evidence", count: String(company.evidence.verified) },
          ]}
          active={tab}
          onChange={setTab}
        />
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {tab === "overview" && (
          <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
            <div className="space-y-5">
              <Panel title="Signal activity · 12 weeks">
                <div className="px-5 pb-5">
                  <AreaSparkline data={weeklyActivity(signals)} dataKey="value" fill="gradient" height={44} />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>12 wks ago</span>
                    <span className="tabular-nums">
                      {signals.length} signals · {now.length} in last 30 days
                    </span>
                    <span>this week</span>
                  </div>
                </div>
              </Panel>
              <Panel title="Opportunity score">
                <div className="px-5 pb-5">
                  <div className="mx-auto w-40">
                    <Gauge
                      value={(company.score?.final ?? 0) * 10}
                      spacing={18}
                      totalNotches={24}
                      arcStyle="notches"
                      inactiveFillOpacity={0.3}
                      activeFill={company.score?.capped ? "var(--muted-foreground)" : "var(--chart-1)"}
                      centerValue={company.score?.final ?? 0}
                      formatOptions={{ maximumFractionDigits: 1 }}
                      defaultLabel={company.score ? "" : "no score yet"}
                      useGradient={false}
                      enterTransition={
                        reduce ? { duration: 0 } : { type: "spring", visualDuration: 0.9, bounce: 0 }
                      }
                    />
                  </div>
                  <div className="mt-1 text-center text-[11px] text-muted-foreground">
                    {company.score?.capped && (
                      <>capped ≤6.0 — no uncapped external-partner evidence · </>
                    )}
                    1–10 opportunity ranking — never a funding probability
                  </div>
                  {company.score && (
                    <div className="mt-4 space-y-2">
                      {company.score.dims.map((d) => (
                        <div key={d.dim}>
                          <div className="flex justify-between text-xs">
                            <span>{d.dim}</span>
                            <span className="tabular-nums text-muted-foreground">{d.score}/5</span>
                          </div>
                          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <motion.div
                              initial={reduce ? { scaleX: d.score / 5 } : { scaleX: 0 }}
                              animate={{ scaleX: d.score / 5 }}
                              transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.45 }}
                              className="h-full origin-left rounded-full"
                              style={{ background: "var(--chart-scale-05)" }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            </div>
            <div className="space-y-5">
              <Panel title="Investing in right now">
                <div className="space-y-1.5 px-5 py-4">
                  {company.investment_fields.map((f) => (
                    <div key={f.field} className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <span className="font-medium">{f.field}</span>
                      {f.spend_note && (
                        <span className="text-muted-foreground"> · {f.spend_note}</span>
                      )}
                      {f.latest_date && (
                        <span className="text-muted-foreground"> · as of {fmtDate(f.latest_date)}</span>
                      )}
                    </div>
                  ))}
                  {company.investment_fields.length === 0 && (
                    <p className="text-xs text-muted-foreground">no synthesis yet — collecting</p>
                  )}
                </div>
              </Panel>
              <Panel title="PSU alumni routes">
                <div className="space-y-2 px-5 py-4 text-xs">
                  {company.alumni.length === 0 && (
                    <p className="text-muted-foreground">
                      none on file — the alumni agent runs with the Corporate Engagement notes file
                    </p>
                  )}
                  {company.alumni.map((a) => (
                    <div key={a.name} className="rounded-lg border border-border px-3 py-2">
                      <div className="font-medium">
                        {a.name}{" "}
                        {a.route !== "none" && (
                          <span className="text-muted-foreground">· route: {a.route}</span>
                        )}
                      </div>
                      <div className="text-muted-foreground">{a.role}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {tab === "signals" && (
          <div className="space-y-6">
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
                    no signals in the last 30 days
                  </p>
                )}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Past · {past.length}
              </h2>
              <div className="space-y-2">
                {past.map((row) => (
                  <SignalLine key={row.id} row={row} compact onOpenCompany={() => {}} />
                ))}
                {past.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                    nothing on record yet — collection still running
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "faculty" && cm && <FieldMatchList cm={cm} />}

        {tab === "faculty" && !cm && (
          <p className="p-4 text-sm text-muted-foreground">
            no matched fields yet — run scripts/match_faculty.py after loading the real faculty list
          </p>
        )}

        {tab === "evidence" && (
          <div className="space-y-2">
            {company.top_evidence.map((ev, i) => (
              <div key={i} className="rounded-xl border border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {SOURCE_LABELS[ev.source] ?? ev.source}
                  </span>
                  {ev.event_date && <span className="tabular-nums">{fmtDate(ev.event_date)}</span>}
                  <UncertaintyBadge level={ev.uncertainty} />
                </div>
                <p className="mt-1 text-xs leading-snug">{ev.excerpt}</p>
                {ev.implication && (
                  <p className="text-[11px] text-muted-foreground">→ {ev.implication}</p>
                )}
                <a
                  href={ev.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary underline-offset-2 hover:underline"
                >
                  View source ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
