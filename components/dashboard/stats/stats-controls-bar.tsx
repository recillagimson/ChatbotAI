"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RangeKey } from "@/lib/analytics";

type RangePill = { key: RangeKey; label: string };

const RANGE_PILLS: RangePill[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "all", label: "All time" },
];

function withParams(
  current: URLSearchParams,
  updates: Record<string, string | null>
): string {
  const p = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") p.delete(k);
    else p.set(k, v);
  }
  return p.toString();
}

export interface StatsControlsBarProps {
  rangeKey: RangeKey;
  customFrom?: string;
  customTo?: string;
  /** The comparison note printed at the right of the bar. */
  comparison?: string;
}

/**
 * The Statistics date controls - a segmented preset row and a custom range,
 * matching the design's single filter line.
 *
 * The chatbot selector that used to live here is gone: scope is now a workspace
 * global in the top bar, so a second bot picker on this one page would be a
 * second source of truth. The split-test stub is gone too - the design's rule is
 * that a control which does nothing is worse than no control.
 */
export function StatsControlsBar({
  rangeKey,
  customFrom,
  customTo,
  comparison,
}: StatsControlsBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function push(qs: string) {
    router.push(`${pathname}?${qs}`, { scroll: false });
  }

  function handleRangePill(key: RangeKey) {
    push(withParams(searchParams, { range: key, from: null, to: null }));
  }

  function handleCustomDate(which: "from" | "to", val: string) {
    const from = which === "from" ? val : (customFrom ?? "");
    const to = which === "to" ? val : (customTo ?? "");
    if (from && to) push(withParams(searchParams, { from, to, range: null }));
    else push(withParams(searchParams, { from: null, to: null }));
  }

  const custom = !!(customFrom && customTo);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div
        className="flex flex-wrap items-center gap-0.5 rounded-[10px] border border-ss-line bg-white p-[3px]"
        role="group"
        aria-label="Date range"
      >
        {RANGE_PILLS.map(({ key, label }) => {
          const active = !custom && rangeKey === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => handleRangePill(key)}
              className={cn(
                "rounded-ctl px-3 py-2 text-[12px] leading-none transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo",
                "motion-reduce:transition-none",
                active
                  ? "bg-ss-indigo font-bold text-white"
                  : "font-medium text-ss-body hover:bg-ss-page hover:text-ss-ink"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "flex items-center gap-1.5 rounded-[10px] border bg-white px-3 py-2",
          custom ? "border-ss-indigo-200" : "border-ss-line"
        )}
      >
        <CalendarRange className="h-[15px] w-[15px] shrink-0 text-ss-muted" aria-hidden="true" />
        <label className="sr-only" htmlFor="stats-from">
          From date
        </label>
        <input
          id="stats-from"
          type="date"
          value={customFrom ?? ""}
          onChange={(e) => handleCustomDate("from", e.target.value)}
          className="bg-transparent text-[12px] leading-none tabular-nums text-ss-ink outline-none"
        />
        <span className="select-none text-ss-faint" aria-hidden="true">
          -
        </span>
        <label className="sr-only" htmlFor="stats-to">
          To date
        </label>
        <input
          id="stats-to"
          type="date"
          value={customTo ?? ""}
          onChange={(e) => handleCustomDate("to", e.target.value)}
          className="bg-transparent text-[12px] leading-none tabular-nums text-ss-ink outline-none"
        />
      </div>

      <button
        type="button"
        onClick={() => router.refresh()}
        aria-label="Refresh statistics"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-ss-line bg-white text-ss-body transition-colors hover:border-ss-dash hover:text-ss-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
      >
        <RefreshCw className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {comparison && (
        <span className="ml-auto text-[11.5px] leading-none text-ss-faint">
          {comparison}
        </span>
      )}
    </div>
  );
}
