"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  buildConversationsHref,
  CONV_DATE_PRESETS,
  type ConvFilterState,
} from "@/lib/conversation-filters";

/**
 * Date filter for the Conversations inbox: quick presets (All / Last day / 7 / 30)
 * plus a custom from–to range. URL-driven like the platform tabs — a preset clears
 * any custom dates and vice-versa, other filters are preserved, and any change
 * resets to page 1 (all handled by buildConversationsHref).
 */
export function ConversationDateFilter({ current }: { current: ConvFilterState }) {
  const router = useRouter();
  const go = (patch: Partial<ConvFilterState>) =>
    router.push(buildConversationsHref(current, patch), { scroll: false });

  const customActive = !!(current.from || current.to);
  const dateInputCls =
    "flex h-9 rounded-md border border-input bg-background px-2.5 py-1 text-sm ring-offset-background " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 tabular-nums";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {CONV_DATE_PRESETS.map((p) => {
        const active = !customActive && (current.range ?? null) === p.value;
        return (
          <button
            key={p.value ?? "all"}
            type="button"
            onClick={() => go({ range: p.value, from: null, to: null })}
            aria-pressed={active}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active
                ? "bg-primary text-primary-foreground"
                : "border border-input bg-background hover:bg-accent"
            )}
          >
            {p.label}
          </button>
        );
      })}
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor="conv-date-from">
          From date
        </label>
        <input
          id="conv-date-from"
          type="date"
          value={current.from ?? ""}
          max={current.to ?? undefined}
          onChange={(e) => go({ from: e.target.value || null, range: null })}
          className={dateInputCls}
          aria-label="From date"
        />
        <span className="text-sm text-muted-foreground">–</span>
        <label className="sr-only" htmlFor="conv-date-to">
          To date
        </label>
        <input
          id="conv-date-to"
          type="date"
          value={current.to ?? ""}
          min={current.from ?? undefined}
          onChange={(e) => go({ to: e.target.value || null, range: null })}
          className={dateInputCls}
          aria-label="To date"
        />
        {customActive && (
          <button
            type="button"
            onClick={() => go({ from: null, to: null, range: null })}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
