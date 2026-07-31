import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The dashboard's metric tile: an uppercase eyebrow, one big Outfit number, an
 * optional delta beside it, and one line of context underneath.
 *
 * The design uses exactly this shape in five places (Statistics KPI row, the
 * follow-up queue counters, mobile stat pairs, billing usage, chatbot health),
 * so the variants here are the ones it actually shows - `tone="rose"` turns the
 * whole tile into the "delivery failures" alarm card, nothing more exotic.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaTone,
  foot,
  icon,
  tone = "plain",
  valueTone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** e.g. "+41%", "-5s". Rendered small and bold beside the number. */
  delta?: React.ReactNode;
  deltaTone?: "good" | "bad" | "neutral";
  foot?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "plain" | "rose";
  valueTone?: "ink" | "green" | "rose" | "amber" | "muted";
  className?: string;
}) {
  const values: Record<string, string> = {
    ink: "text-ss-ink",
    green: "text-ss-green",
    rose: "text-ss-rose",
    amber: "text-ss-amber",
    muted: "text-ss-muted",
  };
  const deltas: Record<string, string> = {
    good: "text-ss-green",
    bad: "text-ss-rose",
    neutral: "text-ss-muted",
  };
  return (
    <div
      className={cn(
        "rounded-card border px-5 py-[18px]",
        tone === "rose"
          ? "border-ss-rose-line bg-ss-rose-tint"
          : "border-ss-line bg-white",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {icon ? <span className="text-ss-muted">{icon}</span> : null}
        <span
          className={cn(
            "ss-eyebrow tracking-[0.06em]",
            tone === "rose" ? "text-ss-rose-ink" : "text-ss-muted"
          )}
        >
          {label}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={cn(
            "ss-num text-[30px] leading-none",
            values[valueTone ?? (tone === "rose" ? "rose" : "ink")]
          )}
        >
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "font-display text-[11.5px] font-bold leading-none",
              deltas[deltaTone ?? "neutral"]
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      {foot ? (
        <div
          className={cn(
            "mt-[7px] text-[11.5px] leading-none",
            tone === "rose"
              ? "font-semibold text-ss-rose-ink"
              : "text-ss-muted"
          )}
        >
          {foot}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The compact counter used inside dark hero panels and the follow-up queue -
 * same information hierarchy as [StatCard] with no surface of its own.
 */
export function StatBlock({
  label,
  value,
  suffix,
  dark = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={cn("ss-eyebrow", dark ? "text-ss-nav-meta" : "text-ss-muted")}
      >
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={cn(
            "ss-num text-2xl leading-none",
            dark ? "text-white" : "text-ss-ink"
          )}
        >
          {value}
        </span>
        {suffix ? (
          <span
            className={cn(
              "text-[11px] font-medium leading-none",
              dark ? "text-ss-nav-meta" : "text-ss-muted"
            )}
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Period-over-period delta, rendered the way the design does it: an arrow plus
 * a signed value, green when the metric moved the right way. `lowerIsBetter`
 * flips the colouring for response-time style metrics, where a drop is a win.
 */
export function Delta({
  value,
  suffix = "%",
  lowerIsBetter = false,
  className,
}: {
  value: number | null;
  suffix?: string;
  lowerIsBetter?: boolean;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded === 0) return null;
  const up = rounded > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-display text-[11.5px] font-bold leading-none",
        good ? "text-ss-green" : "text-ss-rose",
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {up ? "+" : "−"}
      {Math.abs(rounded)}
      {suffix}
    </span>
  );
}
