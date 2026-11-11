import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MOMENTUM_LABEL } from "@/lib/data";

/* ------------------------------------------------------------------ */
/* PressCard: instant press feedback (pointer-down scale), hover lift  */
/* gated behind fine pointers; transitions only transform+shadow.      */
/* ------------------------------------------------------------------ */
export function PressCard({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group text-left w-full rounded-xl border border-border bg-card px-4 py-3",
        "transition-[transform,box-shadow] duration-150 ease-out",
        "hover:-translate-y-px hover:shadow-[0_6px_16px_-8px_rgb(0_0_0/0.18)]",
        "active:scale-[0.97] active:duration-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------- badges ---------------------------- */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center rounded-full bg-emerald-800/10 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-700/20">
      verified
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-800/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-700/25">
      quarantined
    </span>
  );
}

export function UncertaintyBadge({ level }: { level: string }) {
  const tone =
    level === "low"
      ? "text-muted-foreground bg-muted ring-border"
      : level === "med"
        ? "text-amber-800 bg-amber-50 ring-amber-600/25"
        : "text-red-800 bg-red-50 ring-red-700/25";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", tone)}>
      uncertainty: {level}
    </span>
  );
}

export function MomentumChip({ direction }: { direction: string }) {
  const label = MOMENTUM_LABEL[direction] ?? direction;
  const tone =
    direction === "expanding"
      ? "text-emerald-800 bg-emerald-50 ring-emerald-600/20"
      : direction === "pulling_back"
        ? "text-red-800 bg-red-50 ring-red-700/25"
        : direction === "mixed"
          ? "text-amber-800 bg-amber-50 ring-amber-600/25"
          : "text-muted-foreground bg-muted ring-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        tone,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function LaneTag({ lane }: { lane: string }) {
  const map: Record<string, string> = {
    don: "bg-sky-50 text-sky-800 ring-sky-600/20",
    brian: "bg-violet-50 text-violet-800 ring-violet-600/20",
    unassigned: "bg-muted text-muted-foreground ring-border",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", map[lane] ?? map.unassigned)}>
      {lane === "don" ? "Don" : lane === "brian" ? "Brian" : "unassigned"}
    </span>
  );
}

/* ---------------------- lane switcher ------------------------------ */
/* Moving pill via layoutId — spatial consistency (same path in/out).  */
export type LaneValue = "all" | "don" | "brian";

export function LaneTabs({
  value,
  onChange,
}: {
  value: LaneValue;
  onChange: (v: LaneValue) => void;
}) {
  const reduce = useReducedMotion();
  const lanes: { id: LaneValue; label: string }[] = [
    { id: "all", label: "Demo lanes" },
    { id: "don", label: "Don — defense & materials" },
    { id: "brian", label: "Brian — enterprise & AI" },
  ];
  return (
    <div
      role="group"
      aria-label="Stakeholder lane"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1 max-w-full overflow-x-auto"
    >
      {lanes.map((l) => {
        const active = value === l.id;
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(l.id)}
            className={cn(
              "relative whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out",
              "active:scale-[0.97]",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active &&
              (reduce ? (
                <span className="absolute inset-0 rounded-full bg-primary" />
              ) : (
                <motion.span
                  layoutId="lane-pill"
                  transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  className="absolute inset-0 rounded-full bg-primary"
                />
              ))}
            <span className="relative z-10">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------- stagger entrance ---------------------------- */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : "hidden"}
      animate="shown"
      variants={{
        hidden: { opacity: 1 },
        shown: { opacity: 1, transition: { staggerChildren: 0.045 } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={
        reduce
          ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
          : { hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0 } }
      }
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

/* --------------------- avatar tile + status chips --------------------- */
/* Stable per-name tint (hash), AA-contrast -800 text on -100 bg.        */
const AVATAR_TINTS = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const idx = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 select-none place-items-center rounded-lg text-xs font-bold",
        AVATAR_TINTS[idx % AVATAR_TINTS.length],
        className ?? "h-8 w-8",
      )}
    >
      {initial}
    </span>
  );
}

export type ChipTone = "neutral" | "green" | "amber" | "red" | "blue";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "text-muted-foreground bg-muted",
  green: "text-emerald-800 bg-emerald-50",
  amber: "text-amber-800 bg-amber-50",
  red: "text-red-800 bg-red-50",
  blue: "text-primary bg-primary/10",
};

export function StatusChip({
  label,
  tone = "neutral",
  dotted = true,
}: {
  label: ReactNode;
  tone?: ChipTone;
  dotted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        CHIP_TONES[tone],
      )}
    >
      {dotted && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}

/* ------------------------- button class helpers ------------------------- */
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const btnOutline =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.97]";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]";
