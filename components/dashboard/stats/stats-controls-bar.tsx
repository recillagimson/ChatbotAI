"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RangeKey } from "@/lib/analytics";

type RangePill = { key: RangeKey; label: string };

const RANGE_PILLS: RangePill[] = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "month", label: "This Month" },
  { key: "lastmonth", label: "Last Month" },
  { key: "all", label: "All Time" },
];

const VIEW_TABS = [
  { key: "funnel", label: "Funnel" },
  { key: "events", label: "Events" },
];

function withParams(
  current: URLSearchParams,
  updates: Record<string, string | null>
): string {
  const p = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") {
      p.delete(k);
    } else {
      p.set(k, v);
    }
  }
  return p.toString();
}

export interface StatsControlsBarProps {
  rangeKey: RangeKey;
  customFrom?: string;
  customTo?: string;
  bot: string | null;
  tab: string;
  chatbots: { id: string; name: string }[];
}

export function StatsControlsBar({
  rangeKey,
  customFrom,
  customTo,
  bot,
  tab,
  chatbots,
}: StatsControlsBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function push(qs: string) {
    router.push(`${pathname}?${qs}`, { scroll: false });
  }

  // ── Date range pills ──────────────────────────────────────────────────────
  function handleRangePill(key: RangeKey) {
    push(withParams(searchParams, { range: key, from: null, to: null }));
  }

  // ── Custom date inputs ────────────────────────────────────────────────────
  function handleCustomDate(which: "from" | "to", val: string) {
    const from = which === "from" ? val : (customFrom ?? "");
    const to = which === "to" ? val : (customTo ?? "");
    if (from && to) {
      push(withParams(searchParams, { from, to, range: null }));
    }
  }

  // ── View tab ──────────────────────────────────────────────────────────────
  function handleTab(key: string) {
    push(withParams(searchParams, { tab: key }));
  }

  // ── Bot selector ──────────────────────────────────────────────────────────
  function handleBot(value: string) {
    push(withParams(searchParams, { bot: value || null }));
  }

  // ── Refresh ───────────────────────────────────────────────────────────────
  function handleRefresh() {
    router.refresh();
  }

  const pillBase =
    "inline-flex items-center justify-center min-h-[44px] px-3 py-2 rounded-md text-sm font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "motion-reduce:transition-none";

  const pillActive = "bg-primary text-primary-foreground shadow";
  const pillInactive =
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {/* ── Date range pills ── */}
      <div
        className="flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Date range"
      >
        {RANGE_PILLS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={rangeKey === key}
            onClick={() => handleRangePill(key)}
            className={cn(pillBase, rangeKey === key ? pillActive : pillInactive)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Custom date range ── */}
      <div className="flex items-center gap-1">
        <label className="sr-only" htmlFor="stats-from">
          From date
        </label>
        <input
          id="stats-from"
          type="date"
          value={customFrom ?? ""}
          onChange={(e) => handleCustomDate("from", e.target.value)}
          className={cn(
            "flex h-11 rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "tabular-nums"
          )}
          aria-label="From date"
        />
        <span className="text-muted-foreground text-sm select-none">–</span>
        <label className="sr-only" htmlFor="stats-to">
          To date
        </label>
        <input
          id="stats-to"
          type="date"
          value={customTo ?? ""}
          onChange={(e) => handleCustomDate("to", e.target.value)}
          className={cn(
            "flex h-11 rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "tabular-nums"
          )}
          aria-label="To date"
        />
      </div>

      {/* ── Divider ── */}
      <div className="hidden sm:block h-8 w-px bg-border" aria-hidden="true" />

      {/* ── View tabs ── */}
      <div
        className="flex items-center gap-1 rounded-lg bg-muted p-1"
        role="group"
        aria-label="View"
      >
        {VIEW_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => handleTab(key)}
            className={cn(
              "inline-flex items-center justify-center min-h-[44px] px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "motion-reduce:transition-none",
              tab === key
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Bot selector ── */}
      <div className="relative">
        <label className="sr-only" htmlFor="stats-bot">
          Filter by chatbot
        </label>
        <select
          id="stats-bot"
          value={bot ?? ""}
          onChange={(e) => handleBot(e.target.value)}
          className={cn(
            "flex h-11 min-w-[160px] appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm",
            "ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "cursor-pointer"
          )}
          aria-label="Filter by chatbot"
        >
          <option value="">All chatbots</option>
          {chatbots.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {/* Chevron decoration */}
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* ── Split Test stub ── */}
      <div
        className="flex items-center gap-1 rounded-lg bg-muted/60 p-1 opacity-60"
        title="Split testing coming soon"
        aria-label="Split test filter (coming soon)"
      >
        {(["All", "Control", "Variant 2"] as const).map((label, i) => (
          <button
            key={label}
            type="button"
            disabled
            aria-disabled="true"
            className={cn(
              "inline-flex items-center justify-center min-h-[44px] px-3 py-1.5 rounded-md text-sm",
              "cursor-not-allowed transition-none",
              i === 0
                ? "bg-muted-foreground/20 text-muted-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
        <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
          soon
        </span>
      </div>

      {/* ── Refresh ── */}
      <button
        type="button"
        onClick={handleRefresh}
        className={cn(
          "inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md border border-input bg-background px-3 py-2",
          "text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "motion-reduce:transition-none"
        )}
        aria-label="Refresh statistics"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Refresh</span>
      </button>
    </div>
  );
}
