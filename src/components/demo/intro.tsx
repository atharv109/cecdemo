/** Intro drawer (email-only, auto-draft) + inline why-matched/papers expansion. */

import { useEffect, useState } from "react";
import { fetchFacultyPapers, type MatchExplanation, type Paper } from "@/lib/intro";
import { btnOutline, btnPrimary, StatusChip } from "./parts";

/* ------------------- inline why-matched + papers (on click) --------------- */

export function RowExpansion({
  parts,
  whyLine,
  facultyName,
}: {
  parts: MatchExplanation[];
  whyLine: string;
  facultyName: string;
}) {
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [papersErr, setPapersErr] = useState<string | null>(null);
  const [author, setAuthor] = useState<{ author?: string; affiliation?: string } | null>(null);

  useEffect(() => {
    let live = true;
    setPapers(null);
    setPapersErr(null);
    if (!facultyName) return;
    fetchFacultyPapers(facultyName)
      .then((r) => {
        if (!live) return;
        setPapers(r.papers);
        setAuthor({ author: r.author, affiliation: r.affiliation });
      })
      .catch((e) => live && setPapersErr(String(e)));
    return () => {
      live = false;
    };
  }, [facultyName]);

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Why matched
        </div>
        <ul className="mt-2 space-y-1.5">
          {parts.map((c) => (
            <li
              key={c.key}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <span className="text-[11px] font-semibold">{c.label}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">{c.explanation}</span>
              </div>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                {c.score == null ? "—" : Math.round(c.score)}
              </span>
            </li>
          ))}
          {parts.length === 0 && (
            <li className="text-[11px] text-muted-foreground">Fit reason: {whyLine}</li>
          )}
        </ul>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent papers · OpenAlex (live)
        </div>
        {author?.affiliation && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            OpenAlex match: {author.author} · {author.affiliation}
            {!/pennsylvania state|penn state/i.test(author.affiliation) && " — verify this is the right person"}
          </p>
        )}
        {papers === null && papersErr == null && (
          <p className="py-2 text-xs text-muted-foreground" role="status">
            Fetching papers…
          </p>
        )}
        {papersErr && <p className="py-2 text-xs text-amber-800">{papersErr}</p>}
        {papers && (
          <ul className="mt-1">
            {papers.map((p) => (
              <li key={p.title} className="border-b border-border/40 py-1.5 last:border-0">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-xs font-medium hover:text-primary">
                    {p.title}
                  </a>
                ) : (
                  <span className="text-xs font-medium">{p.title}</span>
                )}
                <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">
                  {p.year ?? "—"} · {p.cited} citations
                </span>
              </li>
            ))}
            {papers.length === 0 && (
              <li className="py-2 text-xs text-muted-foreground">No papers found on OpenAlex for this name.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/* --------------------- email-only drawer (auto-draft) -------------------- */

export function FacultyEmailDrawer({
  facultyId,
  facultyRow,
  deptRow,
  draft,
  status,
  autoPrep,
  localMode,
  onSaveSubjectBody,
  onSend,
  onClose,
}: {
  facultyId: string;
  facultyRow?: Record<string, { name?: string; title?: string; departmentId?: string; profileUrl?: string }>;
  deptRow?: Record<string, { name?: string }>;
  draft: { subject: string; body: string } | null;
  status?: "drafted" | "sent";
  /** auto-draft is being created server-side right now */
  autoPrep: boolean;
  /** static deploy: the draft/send live in this browser only */
  localMode?: boolean;
  onSaveSubjectBody: (facultyId: string, subject: string, body: string) => void;
  onSend: (facultyId: string) => void;
  onClose: () => void;
}) {
  const f = facultyRow?.[facultyId];
  const dept = f?.departmentId ? deptRow?.[String(f.departmentId)] : undefined;
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [touched, setTouched] = useState(false);

  // adopt the auto-created draft once it appears
  useEffect(() => {
    if (!touched && draft) {
      setSubject(draft.subject);
      setBody(draft.body);
    }
  }, [draft?.subject, draft?.body, touched, draft]);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-[rgb(28_32_51/0.45)] backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card shadow-2xl"
        role="dialog"
        aria-label={`Reply to ${f?.name ?? facultyId}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold tracking-tight">{f?.name ?? facultyId}</div>
            <div className="truncate text-xs text-muted-foreground">
              {dept?.name ?? f?.title ?? ""}
              {f?.profileUrl && (
                <>
                  {" · "}
                  <a href={f.profileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    profile ↗
                  </a>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          {status === "sent" && (
            <StatusChip
              label={
                localMode
                  ? "Sent — saved in this browser only · nothing was emailed (demo)"
                  : "Recorded sent — nothing was actually emailed (demo)"
              }
              tone="green"
            />
          )}
          {autoPrep && !draft && (
            <p className="text-xs text-muted-foreground" role="status">
              Preparing your draft…
            </p>
          )}
          {status === "sent" ? (
            /* after a send the draft stays viewable — read-only */
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Subject
                </div>
                <p className="mt-1 text-sm font-medium">{draft?.subject || "—"}</p>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Message
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{draft?.body || "—"}</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="drawer-subject" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Subject
                </label>
                <input
                  id="drawer-subject"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setTouched(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary/40 focus:bg-card"
                />
              </div>
              <div>
                <label htmlFor="drawer-body" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Message
                </label>
                <textarea
                  id="drawer-body"
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setTouched(true);
                  }}
                  rows={14}
                  className="mt-1 w-full resize-y rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary/40 focus:bg-card"
                />
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <button
              type="button"
              className={btnOutline}
              disabled={status === "sent" || autoPrep || !draft}
              onClick={() => onSaveSubjectBody(facultyId, subject, body)}
            >
              Save draft
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={status === "sent" || autoPrep || !draft || !body.trim() || !subject.trim()}
              onClick={() => onSend(facultyId)}
            >
              Send (records in demo — no real email)
            </button>
            <span className="text-[10px] text-muted-foreground">The platform never contacts anyone itself.</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------- bulk bar -------------------------------- */

export function BulkIntroBar({
  selected,
  statuses,
  onAction,
  busy,
}: {
  selected: string[];
  statuses: Record<string, "drafted" | "sent" | undefined>;
  onAction: () => void;
  busy: boolean | null;
}) {
  const n = selected.length;
  if (n === 0) return null;
  const alreadySent = selected.filter((id) => statuses[id] === "sent").length;
  const actionable = n - alreadySent;
  return (
    <div className="sticky bottom-3 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border border-primary/30 bg-card px-4 py-2 shadow-lg">
      <span className="text-xs tabular-nums text-muted-foreground">{n} selected</span>
      <button
        type="button"
        className={btnPrimary}
        disabled={busy === true || actionable === 0}
        onClick={onAction}
      >
        Draft &amp; send to {actionable} professor{actionable === 1 ? "" : "s"}
      </button>
      {alreadySent > 0 && (
        <span className="text-[10px] text-muted-foreground">{alreadySent} already recorded sent</span>
      )}
      <span className="text-[10px] text-muted-foreground">demo send — no real email goes out</span>
    </div>
  );
}

export function IntroStatusChip({ status, local }: { status: "drafted" | "sent"; local?: boolean }) {
  return status === "sent" ? (
    <StatusChip label={local ? "sent · browser only (demo)" : "sent (demo)"} tone="green" />
  ) : (
    <StatusChip label={local ? "draft · browser only" : "draft ready"} tone="blue" />
  );
}

/** Faculty-id → draft status from the noble state's drafts collection. */
export function draftStatuses(
  draftsMap: Record<string, { facultyId: string; status: string }> | undefined,
): Record<string, "drafted" | "sent"> {
  const m: Record<string, "drafted" | "sent"> = {};
  for (const d of Object.values(draftsMap ?? {})) {
    if (!d.facultyId) continue;
    m[d.facultyId] = d.status === "recorded-sent" ? "sent" : "drafted";
  }
  return m;
}
