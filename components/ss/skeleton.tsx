import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Loading skeletons for the dashboard.
 *
 * The rule these follow: a skeleton is a picture of the page that is coming, at
 * the size it will actually be. The chrome (header strip, body padding, card
 * radii, grid columns) is not faked here - it's the same measurements the real
 * PageShell/PageHeader/PageBody use, so when the content lands nothing moves.
 * A skeleton that shifts the layout on resolve is worse than no skeleton: it
 * reads as the page breaking rather than the page arriving.
 *
 * Two things every one of these does:
 *  - Announces itself once. The outer region is `role="status"` with a single
 *    visually-hidden "Loading" label; every block inside is `aria-hidden`, so a
 *    screen reader hears one word instead of forty empty divs.
 *  - Animates only under `motion-safe`. A full page of pulsing blocks is exactly
 *    the kind of motion `prefers-reduced-motion` exists to suppress.
 */

/** One placeholder block. Tone matches the surface it sits on. */
export function Sk({
  className,
  tone = "on-card",
}: {
  className?: string;
  /** `on-card` for blocks on white, `on-page` for blocks on the page ground. */
  tone?: "on-card" | "on-page" | "on-navy";
}) {
  const tones = {
    "on-card": "bg-ss-hair",
    "on-page": "bg-ss-line",
    "on-navy": "bg-white/10",
  };
  return (
    <div
      aria-hidden="true"
      className={cn("motion-safe:animate-pulse rounded-md", tones[tone], className)}
    />
  );
}

/** The screen-reader announcement, once per skeleton screen. */
function LoadingLabel({ children = "Loading" }: { children?: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/**
 * The page frame: a header strip over a scrolling body, measured to match
 * [components/ss/page.tsx] exactly.
 */
export function SkPage({
  label,
  title = "w-40",
  description = true,
  actions = 1,
  below,
  children,
}: {
  /** What's loading, for screen readers - "Loading statistics". */
  label?: string;
  /** Width class for the title block, so it's about as wide as the real title. */
  title?: string;
  description?: boolean;
  /** How many action buttons the real header has. */
  actions?: number;
  /** Tab strip or filter row flush with the header's bottom edge. */
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex h-full min-w-0 flex-col bg-ss-page"
    >
      <LoadingLabel>{label ?? "Loading"}</LoadingLabel>

      <header
        className={cn(
          "flex-none border-b border-ss-line bg-white px-5 pt-[18px] sm:px-[30px]",
          below ? "pb-0" : "pb-[18px]"
        )}
      >
        <div className="flex flex-wrap items-start gap-x-3.5 gap-y-3">
          <div className="min-w-0">
            <Sk className={cn("h-[22px]", title)} tone="on-page" />
            {description && <Sk className="mt-2 h-[13px] w-64" tone="on-page" />}
          </div>
          {actions > 0 && (
            <div className="ml-auto flex items-center gap-2.5">
              {Array.from({ length: actions }, (_, i) => (
                <Sk key={i} className="h-[38px] w-[120px] rounded-ctl-lg" tone="on-page" />
              ))}
            </div>
          )}
        </div>
        {below}
      </header>

      <div className="ss-scroll flex-1 overflow-auto px-5 pb-8 pt-6 sm:px-[30px]">
        <div className="flex w-full flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

/** A card-shaped container matching SsCard's radius, border and background. */
export function SkCard({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-card border border-ss-line bg-white p-[22px]", className)}>
      {children}
    </div>
  );
}

/** A card's title + one line of description. */
export function SkCardHead({ width = "w-44" }: { width?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <Sk className={cn("h-[15px]", width)} />
        <Sk className="mt-2.5 h-[12px] w-56" />
      </div>
    </div>
  );
}

/** The KPI row. `count` should match the real page so the grid doesn't reflow. */
export function SkStatCards({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2",
        count === 5 ? "lg:grid-cols-3 xl:grid-cols-5" : "xl:grid-cols-4",
        className
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-card border border-ss-line bg-white px-5 py-[18px]">
          <Sk className="h-[11px] w-24" />
          <Sk className="mt-3 h-[28px] w-20" />
          <Sk className="mt-2.5 h-[11px] w-28" />
        </div>
      ))}
    </div>
  );
}

/** A bar chart placeholder with a y-axis gutter, at the real chart's height. */
export function SkChart({ bars = 22 }: { bars?: number }) {
  // A fixed ramp, not random: a skeleton that differs between server and client
  // render would hydrate-mismatch, and one that differs per refresh looks like
  // data rather than a placeholder.
  const heights = ["35%", "58%", "44%", "72%", "50%", "66%", "39%", "80%"];
  return (
    <SkCard>
      <div className="flex items-center gap-3">
        <div>
          <Sk className="h-[16px] w-40" />
          <Sk className="mt-2.5 h-[12px] w-52" />
        </div>
        <div className="ml-auto flex gap-3.5">
          <Sk className="h-[11px] w-24" />
          <Sk className="h-[11px] w-20" />
        </div>
      </div>
      <div className="mt-[18px] flex gap-3.5">
        <div className="flex h-[170px] w-8 shrink-0 flex-col justify-between">
          {Array.from({ length: 5 }, (_, i) => (
            <Sk key={i} className="h-[9px] w-full" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-[170px] items-end gap-[9px] border-b border-ss-line">
            {Array.from({ length: bars }, (_, i) => (
              <div
                key={i}
                className="flex h-full flex-1 items-end gap-[2px]"
                style={{ height: heights[i % heights.length] }}
              >
                <Sk className="h-full flex-1 rounded-t-[3px] rounded-b-none" />
                <Sk className="h-full flex-1 rounded-t-[3px] rounded-b-none" />
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex justify-between">
            <Sk className="h-[10px] w-10" />
            <Sk className="h-[10px] w-10" />
            <Sk className="h-[10px] w-10" />
          </div>
        </div>
      </div>
    </SkCard>
  );
}

/** A stack of list rows - inbox entries, queue cards, table lines. */
export function SkRows({
  rows = 6,
  avatar = true,
  className,
}: {
  rows?: number;
  avatar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 px-[18px] py-[15px]",
            i > 0 && "border-t border-ss-hair"
          )}
        >
          {avatar && <Sk className="h-[38px] w-[38px] shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1">
            <Sk className="h-[13px] w-40" />
            <Sk className="mt-2.5 h-[11px] w-28" />
          </div>
          <Sk className="h-[11px] w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A row of pill filters, as the inbox and queue screens show. */
export function SkPills({ count = 4 }: { count?: number }) {
  const widths = ["w-28", "w-16", "w-20", "w-24", "w-20"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Sk
          key={i}
          className={cn("h-[34px] rounded-full", widths[i % widths.length])}
          tone="on-page"
        />
      ))}
    </div>
  );
}

/** The tab strip that sits flush with a page header's bottom edge. */
export function SkTabs({ count = 5 }: { count?: number }) {
  const widths = ["w-20", "w-16", "w-24", "w-20", "w-16", "w-24", "w-20"];
  return (
    <div className="mt-4 flex gap-0.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="px-[15px] py-3">
          <Sk className={cn("h-[13px]", widths[i % widths.length])} tone="on-page" />
        </div>
      ))}
    </div>
  );
}

/** The navy hero panel used on Overview, Follow-ups and Learn. */
export function SkNavyPanel({
  className,
  height = "h-[150px]",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <div className={cn("rounded-card bg-ss-navy px-[22px] py-5", height, className)}>
      <Sk className="h-[11px] w-40" tone="on-navy" />
      <Sk className="mt-4 h-[34px] w-64" tone="on-navy" />
      <Sk className="mt-3.5 h-[12px] w-full max-w-[36rem]" tone="on-navy" />
    </div>
  );
}

/** Paragraph placeholder - the last line is short, the way real text ends. */
export function SkText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Sk key={i} className={cn("h-[12px]", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/**
 * The inbox's left pane. Used by both Conversations routes so the list keeps its
 * exact width while a thread loads beside it - the two-pane promise is that
 * opening a thread never moves the list.
 */
export function SkInboxList({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-ss-line bg-white lg:w-[412px] lg:shrink-0 lg:border-r",
        className
      )}
    >
      <div className="flex-none border-b border-ss-line px-5 pt-[18px] pb-4">
        <div className="flex items-center gap-2.5">
          <Sk className="h-[20px] w-20" />
          <Sk className="h-[18px] w-8 rounded-full" />
        </div>
        <Sk className="mt-3.5 h-[38px] w-full rounded-ctl-lg" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Sk className="h-[30px] w-32 rounded-full" />
          <Sk className="h-[30px] w-14 rounded-full" />
          <Sk className="h-[30px] w-16 rounded-full" />
          <Sk className="h-[30px] w-16 rounded-full" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <SkRows rows={8} />
      </div>
    </div>
  );
}
