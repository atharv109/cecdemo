/** Apple-activity-ring style progress meters for the demo dashboard.
 *
 *  Ring hues were validated for CVD separation / lightness band with the
 *  dataviz palette validator on the light surface (all checks pass; the gold
 *  ring's 2.46:1 contrast warn is relieved by each metric's direct count
 *  text, part of the layout). Numbers live in ink tokens, never the ring hue.
 */

const RING = {
  blue: "#3257a3",
  green: "#009c68",
  gold: "#d59800",
} as const;

const TRACK = "#e5e5e5"; // --chart-scale-01

function Ring({ pct, color, size, stroke, ariaLabel }: {
  pct: number; color: string; size: number; stroke: number; ariaLabel: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * Math.max(0, Math.min(1, pct))} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.23, 1, 0.32, 1)" }}
      />
    </svg>
  );
}

export interface RingMetric {
  label: string;
  done: number;
  total: number;
  color: keyof typeof RING;
}

/** Three nested Apple-style rings + "you did X · Y left" legend rows. */
export function PipelineRings({
  metrics,
  caption,
}: {
  metrics: [RingMetric, RingMetric, RingMetric];
  caption?: string;
}) {
  const [outer, mid, inner] = metrics;
  const size = 128;
  const overall =
    metrics.reduce((sum, m) => sum + (m.total > 0 ? m.done / m.total : 1), 0) / metrics.length;
  const dial = (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 grid place-items-center">
        <Ring pct={inner.total > 0 ? inner.done / inner.total : 1} color={RING[inner.color]} size={52} stroke={10} ariaLabel={`${inner.label}: ${inner.done} of ${inner.total}`} />
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <Ring pct={mid.total > 0 ? mid.done / mid.total : 1} color={RING[mid.color]} size={82} stroke={10} ariaLabel={`${mid.label}: ${mid.done} of ${mid.total}`} />
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <Ring pct={outer.total > 0 ? outer.done / outer.total : 1} color={RING[outer.color]} size={116} stroke={10} ariaLabel={`${outer.label}: ${outer.done} of ${outer.total}`} />
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-[15px] font-semibold tabular-nums" aria-label={`Overall pipeline ${Math.round(overall * 100)}% complete`}>
          {Math.round(overall * 100)}%
        </span>
      </div>
    </div>
  );
  return (
    <div className="flex items-center gap-5">
      {dial}
      <div className="min-w-0 flex-1 space-y-2">
        {metrics.map((m) => {
          const left = Math.max(0, m.total - m.done);
          return (
            <div key={m.label} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: RING[m.color] }}
              />
              <div className="min-w-0">
                <div className="text-[13px] font-medium leading-tight">{m.label}</div>
                <div className="text-[11px] leading-tight text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground">{m.done}</span> / {m.total}
                  {left > 0 ? ` · ${left} left` : " · all done"}
                </div>
              </div>
            </div>
          );
        })}
        {caption && <p className="pt-0.5 text-[10px] text-muted-foreground">{caption}</p>}
      </div>
    </div>
  );
}

/** Small ring around a score, colored by band (defaults to a 0–100 match score). */
export function ScoreRing({ score, band, max = 100 }: { score: number | null; band?: string; max?: number }) {
  if (score == null || !Number.isFinite(score)) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const color = band === "strong" ? RING.green : band === "good" ? RING.blue : RING.gold;
  const pct = Math.max(0, Math.min(1, score / max));
  const size = 36;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score} of ${max}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.23, 1, 0.32, 1)" }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill="currentColor"
        className="tabular-nums"
      >
        {max === 100 ? Math.round(score) : score.toFixed(1)}
      </text>
    </svg>
  );
}

/** Thin rounded progress bar for table rows / cards (4px data-end). */
export function MiniBar({ done, total, color = RING.blue, width = 88, label }: {
  done: number; total: number; color?: string; width?: number; label: string;
}) {
  const pct = total > 0 ? Math.max(0.04, Math.min(1, done / total)) : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className="flex items-center gap-2"
      style={{ minWidth: width + 44 }}
    >
      <span
        className="overflow-hidden rounded-full"
        style={{ width, height: 4, background: TRACK, display: "block" }}
      >
        <span
          style={{
            display: "block",
            height: 4,
            width: `${pct * 100}%`,
            background: color,
            borderRadius: 999,
            transition: "width 600ms cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        />
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
}
