import * as React from "react";
import Link from "next/link";
import { ArrowDown, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The dashboard's chart vocabulary. Every mark here is CSS - no chart library -
 * because the design's forms are all proportion-of-a-row or bar-against-a-
 * baseline, and inlining them keeps the pages server-rendered with no client JS.
 *
 * Accessibility rule shared by all of them: the visual is decorative
 * (`aria-hidden`) and each caller prints the same numbers as text beside it, the
 * way the design lays them out. A screen reader gets the legend, never a
 * meaningless list of bars.
 */

/* ------------------------------------------------------------------ *
 * Sparkbars - the speed-to-lead strip
 * ------------------------------------------------------------------ */

export interface SparkPoint {
  /** 0–1 height of the bar. */
  v: number;
  /** Highlight this column in solid indigo (the design marks the peaks). */
  peak?: boolean;
}

export function Sparkbars({
  data,
  height = 96,
  dark = false,
  className,
}: {
  data: SparkPoint[];
  height?: number;
  /** On the navy hero the bars are translucent lilac with indigo peaks. */
  dark?: boolean;
  className?: string;
}) {
  if (!data.length) return null;
  return (
    <div
      aria-hidden="true"
      style={{ height }}
      className={cn("flex items-end gap-[7px]", className)}
    >
      {data.map((d, i) => (
        <div
          key={i}
          style={{ height: `${Math.max(3, Math.min(100, d.v * 100))}%` }}
          className={cn(
            "flex-1 rounded-t-[4px] rounded-b-[2px]",
            dark
              ? d.peak
                ? "bg-ss-indigo"
                : "bg-ss-indigo-300/30"
              : d.peak
                ? "bg-ss-indigo"
                : "bg-ss-indigo-200/60"
          )}
        />
      ))}
    </div>
  );
}

/** The date ticks the design prints under a sparkline. */
export function AxisTicks({
  labels,
  dark = false,
  className,
}: {
  labels: string[];
  dark?: boolean;
  className?: string;
}) {
  if (!labels.length) return null;
  return (
    <div
      className={cn(
        "mt-2 flex justify-between text-[10.5px] font-medium leading-none",
        dark ? "text-[#7d7eb0]" : "text-ss-faint",
        className
      )}
    >
      {labels.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Grouped bars - "Activity over time"
 * ------------------------------------------------------------------ */

export function GroupedBars({
  data,
  max,
  height = 170,
  gap = 9,
  className,
}: {
  /** One entry per column; `a` is the primary series, `b` the secondary. */
  data: { a: number; b: number }[];
  max?: number;
  height?: number;
  gap?: number;
  className?: string;
}) {
  const ceiling =
    max ?? Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <div
      aria-hidden="true"
      style={{ height, gap }}
      className={cn("flex items-end border-b border-ss-line", className)}
    >
      {data.map((d, i) => (
        <div key={i} className="flex h-full flex-1 items-end gap-[2px]">
          <div
            style={{ height: `${pct(d.a, ceiling)}%` }}
            className="flex-1 rounded-t-[3px] bg-ss-indigo"
          />
          <div
            style={{ height: `${pct(d.b, ceiling)}%` }}
            className="flex-1 rounded-t-[3px] bg-ss-indigo-200"
          />
        </div>
      ))}
    </div>
  );
}

/** The y-axis column beside [GroupedBars] - five evenly spaced gridline labels. */
export function YAxis({
  max,
  steps = 4,
  height = 170,
  className,
}: {
  max: number;
  steps?: number;
  height?: number;
  className?: string;
}) {
  const labels = Array.from({ length: steps + 1 }, (_, i) =>
    Math.round((max / steps) * (steps - i))
  );
  return (
    <div
      style={{ height }}
      className={cn(
        "flex w-9 shrink-0 flex-col items-end justify-between text-[10.5px] font-medium leading-none text-ss-faint",
        className
      )}
    >
      {labels.map((l, i) => (
        <span key={i}>{l.toLocaleString()}</span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Proportion bar - tag mix, thread status, KB coverage
 * ------------------------------------------------------------------ */

export interface Segment {
  label: string;
  value: number;
  /** Any Tailwind bg-* class. Defaults walk the indigo ramp. */
  color?: string;
}

const RAMP = [
  "bg-ss-indigo",
  "bg-ss-indigo-400",
  "bg-ss-indigo-250",
  "bg-ss-rose-soft",
  "bg-ss-rule",
];

/**
 * A single row split into proportional segments - the design's answer to a pie
 * chart. Zero-value segments are dropped entirely rather than rendered as
 * hairlines, and the whole bar collapses to a flat rule when the total is 0.
 */
export function ProportionBar({
  segments,
  height = 14,
  className,
}: {
  segments: Segment[];
  height?: number;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) {
    return (
      <div
        aria-hidden="true"
        style={{ height }}
        className={cn("rounded-full bg-ss-rule", className)}
      />
    );
  }
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div
      aria-hidden="true"
      style={{ height }}
      className={cn("flex gap-[3px] overflow-hidden", className)}
    >
      {shown.map((s, i) => (
        <div
          key={s.label}
          style={{ width: `${(s.value / total) * 100}%` }}
          className={cn(
            "min-w-[3px]",
            s.color ?? RAMP[i % RAMP.length],
            i === 0 && "rounded-l-[7px]",
            i === shown.length - 1 && "rounded-r-[7px]",
            shown.length > 1 && i > 0 && i < shown.length - 1 && "rounded-[3px]",
            shown.length === 1 && "rounded-[7px]"
          )}
        />
      ))}
    </div>
  );
}

/** Legend row under a [ProportionBar]: swatch, label, right-aligned count. */
export function LegendRow({
  color,
  label,
  value,
  dim = false,
}: {
  color: string;
  label: React.ReactNode;
  value: React.ReactNode;
  /** Greys the number - the design does this for the "Bot / spam" bucket. */
  dim?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn("h-[9px] w-[9px] shrink-0 rounded-[3px]", color)}
      />
      <span className="text-[12.5px] font-medium leading-none text-ss-body">
        {label}
      </span>
      <span
        className={cn(
          "ss-num ml-auto text-[13px] leading-none",
          dim ? "text-ss-muted" : "text-ss-ink"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Funnel
 * ------------------------------------------------------------------ */

/**
 * A funnel stage: a bar whose width is its share of the entry count, with the
 * step-over-step drop printed in the gutter. Rendering the width against the
 * FIRST stage (not the previous one) is what makes the collapse legible - the
 * design's "Link sent" bar is a third of the page for a reason.
 */
/* ------------------------------------------------------------------ *
 * Funnel - a tapering stack, not a bar chart
 * ------------------------------------------------------------------ */

/**
 * How far each stage is inset from the one above it. The design narrows the
 * stack asymmetrically (left inset grows faster than right), which is what makes
 * it read as a funnel rather than a stepped list - the rows stay wide enough to
 * hold a label at every depth, so the shape carries the meaning instead of the
 * width having to encode the count.
 */
const FUNNEL_INSET = [
  "",
  "pl-10 pr-[26px]",
  "pl-[74px] pr-[52px]",
  "pl-[108px] pr-[78px]",
] as const;

/** Deepest stages are the brightest - the eye lands on the end of the funnel. */
const FUNNEL_TONE = [
  "bg-ss-navy",
  "bg-ss-navy-500",
  "bg-ss-indigo-600",
  "bg-ss-indigo",
] as const;

/**
 * One stage of the funnel.
 *
 * `href` makes the whole row the toggle for its contact list, which is how the
 * design behaves - the row is the affordance, not a separate button. Server
 * components can't hold open/closed state, so "expanded" is a URL the row links
 * to; that also means an expanded stage survives a refresh and can be shared.
 */
export function FunnelStep({
  label,
  value,
  level = 0,
  href,
  expanded = false,
  children,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** 0-3 - depth in the funnel, which sets both inset and colour. */
  level?: 0 | 1 | 2 | 3;
  /** When set, the row toggles its drill-down. */
  href?: string;
  expanded?: boolean;
  /** The drill-down panel, rendered under the row when expanded. */
  children?: React.ReactNode;
}) {
  const row = (
    <div
      className={cn(
        "flex h-[52px] items-center gap-3 rounded-[12px] px-[18px]",
        FUNNEL_TONE[level],
        href && "transition-opacity hover:opacity-90"
      )}
    >
      <span className="truncate text-[13.5px] font-semibold leading-none text-white">
        {label}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2.5">
        <span className="ss-num text-[20px] leading-none text-white">{value}</span>
        {href ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-5 w-5 text-white/70 transition-transform",
              expanded && "rotate-180"
            )}
          />
        ) : null}
      </span>
    </div>
  );

  return (
    <div className={FUNNEL_INSET[level]}>
      {href ? (
        <Link
          href={href}
          aria-expanded={expanded}
          className="block rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo focus-visible:ring-offset-2"
        >
          {row}
        </Link>
      ) : (
        row
      )}
      {expanded ? children : null}
    </div>
  );
}

/**
 * The pass-through rate between two stages: how many carried on, not how many
 * were lost. The design states the surviving share, which is the number you
 * compare against a benchmark; the loss is stated once, in words, underneath the
 * whole funnel where there's room to say what to do about it.
 */
export function FunnelConnector({
  pct,
  tone = "plain",
}: {
  pct: React.ReactNode;
  tone?: "plain" | "amber";
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <ArrowDown className="h-4 w-4 text-ss-faint" aria-hidden="true" />
      <span
        className={cn(
          "ss-num rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-[1.4]",
          tone === "amber"
            ? "border-ss-amber-line bg-ss-amber-tint text-ss-amber-ink"
            : "border-ss-line bg-ss-page text-ss-body"
        )}
      >
        {pct}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

export function Progress({
  value,
  tone = "mint",
  height = 6,
  dark = false,
  className,
}: {
  /** 0–1. */
  value: number;
  tone?: "mint" | "indigo";
  height?: number;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ height }}
      className={cn(
        "overflow-hidden rounded-full",
        dark ? "bg-white/[.14]" : "bg-ss-rule",
        className
      )}
    >
      <div
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        className={cn(
          "h-full rounded-full",
          tone === "mint" ? "bg-ss-mint" : "bg-ss-indigo"
        )}
      />
    </div>
  );
}

function pct(v: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(1.5, Math.min(100, (v / max) * 100));
}
