"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import {
  CONVERSATION_QUALITY,
  QUALITY_LABEL,
} from "@/lib/conversation-quality";
import {
  CONV_DATE_PRESETS,
  activeFilterCount,
  buildConversationsHref,
  type ConvFilterState,
} from "@/lib/conversation-filters";

/**
 * The one filter control.
 *
 * The design's third call: four stacked rows of pills (channel, tag, quality,
 * date) collapse into a single bar - one popover holding channel · quality ·
 * date, with only the *active* filters staying visible as removable chips
 * outside it. Tag keeps its own tabs because it's the one you switch constantly.
 *
 * Each option is a plain link, so filtering works without JS and every state is
 * a URL.
 */
export function InboxFilters({
  current,
  channels,
  basePath,
}: {
  current: ConvFilterState;
  /** Only the channels this workspace actually has threads on. */
  channels: Platform[];
  basePath?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = activeFilterCount(current);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-[11px] py-[7px] text-[12px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo",
          count > 0
            ? "border-ss-indigo-200 bg-ss-indigo-50 text-ss-indigo-700"
            : "border-ss-line bg-white text-ss-body hover:border-ss-dash"
        )}
      >
        <SlidersHorizontal className="h-[15px] w-[15px]" aria-hidden="true" />
        Filters
        {count > 0 && (
          <span className="rounded-[5px] bg-white px-1.5 py-px font-display text-[10px] font-bold leading-[1.5] text-ss-indigo-600">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filter conversations"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-[19rem] max-w-[calc(100vw-2rem)] rounded-card border border-ss-rule bg-white p-4 shadow-ss-pop"
        >
          <Group label="Channel">
            <Option
              href={buildConversationsHref(current, { platform: null }, basePath)}
              active={!current.platform}
            >
              Any
            </Option>
            {channels.map((p) => (
              <Option
                key={p}
                href={buildConversationsHref(current, { platform: p }, basePath)}
                active={current.platform === p}
              >
                {PLATFORM_META[p].label}
              </Option>
            ))}
          </Group>

          <Group label="Quality" className="mt-4">
            <Option
              href={buildConversationsHref(current, { quality: null }, basePath)}
              active={!current.quality}
            >
              Any
            </Option>
            {CONVERSATION_QUALITY.map((q) => (
              <Option
                key={q}
                href={buildConversationsHref(current, { quality: q }, basePath)}
                active={current.quality === q}
              >
                {QUALITY_LABEL[q]}
              </Option>
            ))}
          </Group>

          <Group label="Last message" className="mt-4">
            {CONV_DATE_PRESETS.map((d) => (
              <Option
                key={d.label}
                href={buildConversationsHref(
                  current,
                  { range: d.value, from: null, to: null },
                  basePath
                )}
                active={
                  !current.from && !current.to && (current.range ?? null) === d.value
                }
              >
                {d.label}
              </Option>
            ))}
          </Group>

          {count > 0 && (
            <Link
              href={buildConversationsHref(
                current,
                { platform: null, quality: null, range: null, from: null, to: null, q: null },
                basePath
              )}
              onClick={() => setOpen(false)}
              className="mt-4 block rounded-ctl-lg border border-ss-line py-2 text-center text-[12px] font-semibold leading-none text-ss-body transition-colors hover:bg-ss-page"
            >
              Clear all filters
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="ss-eyebrow mb-2 text-ss-faint">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Option({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full px-2.5 py-1.5 text-[11.5px] leading-none transition-colors",
        active
          ? "bg-ss-indigo font-bold text-white"
          : "border border-ss-line font-medium text-ss-body hover:border-ss-dash"
      )}
    >
      {children}
    </Link>
  );
}
