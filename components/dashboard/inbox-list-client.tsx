"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Inbox, X } from "lucide-react";
import { cn, botNameOf } from "@/lib/utils";
import { contactDisplayName } from "@/lib/contact";
import { inboxStamp, num } from "@/lib/format";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import {
  TAG_LABEL,
  tagOf,
  type ConversationTag,
} from "@/lib/conversation-tags";
import { QUALITY_LABEL, qualityOf } from "@/lib/conversation-quality";
import {
  activeFilterCount,
  buildConversationsHref,
  type ConvFilterState,
} from "@/lib/conversation-filters";
import { readInboxFilters } from "@/lib/inbox-params";
import type { InboxData } from "@/lib/inbox-query";
import { SsAvatar, SsChip, SsCount, SsPill } from "@/components/ss/controls";
import { ChannelChip } from "@/components/ss/channel";
import { InboxSearch } from "@/components/dashboard/inbox-search";
import { InboxFilters } from "@/components/dashboard/inbox-filters";
import { SkInboxList } from "@/components/ss/skeleton";

/** Chip tone per tag - the inbox's colour language, in one place. */
const TAG_CHIP: Record<ConversationTag, Parameters<typeof SsChip>[0]["tone"]> =
  {
    lead: "indigo",
    wants_call: "indigo",
    starting_later: "amber",
    needs_human: "rose",
    subscribed: "green",
    disqualified: "neutral",
    bot: "neutral",
  };

/**
 * The inbox's left pane - the thread list with its filter bar.
 *
 * Rendered ONCE in the conversations layout (not per page), so it stays mounted
 * while the right pane swaps between "pick a thread" and an open conversation.
 * That is the whole point: opening a thread is a path change only, so this list
 * keeps its scroll and its data - it re-fetches ONLY when the filters/search/page
 * in the query string change, never when you click a thread.
 *
 * Selection and the current filters both come from the URL (usePathname /
 * useSearchParams), so the highlight moves the instant you navigate - no fetch.
 * On mobile the pane is the whole screen when no thread is open and hidden once
 * one is (a phone can't show two panes).
 */
export function InboxListClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The open thread is read from the path, never fetched - so switching threads
  // moves the highlight instantly and leaves the list data untouched.
  const selectedId = useMemo(() => {
    const m = /^\/conversations\/([^/]+)$/.exec(pathname);
    return m ? decodeURIComponent(m[1]) : undefined;
  }, [pathname]);

  // Depend on the query STRING, not the searchParams object (new each render),
  // so the fetch effect fires on filter changes and nothing else.
  const qs = searchParams.toString();
  const current: ConvFilterState = useMemo(() => {
    const sp: Record<string, string> = {};
    new URLSearchParams(qs).forEach((v, k) => (sp[k] = v));
    return readInboxFilters(sp);
  }, [qs]);

  // Filter links keep the open thread attached (/conversations/<id>?…), so
  // filtering while a thread is open never closes it.
  const basePath = selectedId
    ? `/conversations/${selectedId}`
    : "/conversations";

  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState(false);

  // Opening a thread clears its unread in the DB, but the list no longer
  // re-renders per navigation, so mirror that here: threads opened this session
  // read as read, so their badge doesn't linger until the next filter refetch.
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!selectedId) return;
    setReadIds((prev) =>
      prev.has(selectedId) ? prev : new Set(prev).add(selectedId),
    );
  }, [selectedId]);

  // Re-fetch ONLY when the query string changes. selectedId/pathname are NOT
  // dependencies, which is exactly why clicking a thread doesn't reload the list.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetch(`/api/conversations/list?${qs}`, { cache: "no-store" })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d: InboxData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [qs]);

  // Mobile: hide the list once a thread is open; show it full-width otherwise.
  const mobile = selectedId ? "hidden lg:flex" : "flex";

  // First load (before any data arrives): a skeleton in the list's slot. On a
  // filter change we keep the previous list until the new data lands, so the
  // pane never flashes empty.
  if (!data) {
    return <SkInboxList className={mobile} />;
  }

  const {
    conversations,
    total,
    totalPages,
    page,
    allCount,
    needsCount,
    channels,
  } = data;
  const chips = activeChips(current, basePath);

  return (
    <div
      className={cn(
        "h-full min-h-0 w-full flex-col border-ss-line bg-white lg:w-[412px] lg:shrink-0 lg:border-r",
        mobile,
      )}
    >
      {/* ---- Filter bar ------------------------------------------------- */}
      <div className="flex-none border-b border-ss-hair px-5 pb-3.5 pt-5">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-[19px] font-bold leading-[1.1] text-ss-ink">
            Inbox
          </h1>
          <span className="rounded-full bg-ss-page px-2.5 py-1 text-[11px] font-semibold leading-none text-ss-body">
            {num(allCount)}
          </span>
        </div>

        <InboxSearch current={current} basePath={basePath} />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <SsPill
            href={buildConversationsHref(
              current,
              { tag: "needs_human" },
              basePath,
            )}
            tone="alert"
            active={current.tag === "needs_human"}
            count={needsCount}
          >
            Needs attention
          </SsPill>
          <SsPill
            href={buildConversationsHref(current, { tag: null }, basePath)}
            active={!current.tag}
          >
            All
          </SsPill>
          <SsPill
            href={buildConversationsHref(current, { tag: "lead" }, basePath)}
            active={current.tag === "lead"}
          >
            Leads
          </SsPill>
          <SsPill
            href={buildConversationsHref(
              current,
              { tag: "wants_call" },
              basePath,
            )}
            active={current.tag === "wants_call"}
          >
            Calls
          </SsPill>
          <InboxFilters
            current={current}
            channels={channels}
            basePath={basePath}
          />
        </div>

        {chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <Link
                key={c.label}
                href={c.clearHref}
                className="flex items-center gap-1.5 rounded-[7px] bg-ss-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-ss-indigo-700 transition-colors hover:bg-ss-indigo-100"
              >
                {c.label}
                <X className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">Remove this filter</span>
              </Link>
            ))}
            <Link
              href={buildConversationsHref(
                current,
                {
                  platform: null,
                  quality: null,
                  range: null,
                  from: null,
                  to: null,
                  q: null,
                },
                basePath,
              )}
              className="px-1 text-[11px] font-medium leading-none text-ss-muted transition-colors hover:text-ss-ink"
            >
              Clear
            </Link>
          </div>
        )}
      </div>

      {/* ---- Threads ---------------------------------------------------- */}
      <div className="ss-scroll min-h-0 flex-1 overflow-auto">
        {error && conversations.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Inbox
              className="mx-auto mb-3 h-8 w-8 text-ss-fainter"
              aria-hidden="true"
            />
            <p className="text-[13px] font-semibold text-ss-ink">
              Couldn&apos;t load the inbox
            </p>
            <p className="mx-auto mt-1.5 max-w-[16rem] text-[12px] leading-relaxed text-ss-muted">
              Check your connection, then change a filter to try again.
            </p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Inbox
              className="mx-auto mb-3 h-8 w-8 text-ss-fainter"
              aria-hidden="true"
            />
            <p className="text-[13px] font-semibold text-ss-ink">
              {total === 0 && activeFilterCount(current) === 0 && !current.tag
                ? "No conversations yet"
                : "Nothing matches these filters"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[16rem] text-[12px] leading-relaxed text-ss-muted">
              {total === 0 && activeFilterCount(current) === 0 && !current.tag
                ? "Once a real customer DMs you, the thread shows up here."
                : "Try clearing a filter, or widen the date range."}
            </p>
          </div>
        ) : (
          conversations.map((c, i) => {
            const name = contactDisplayName(c.contact_name, c.contact_username);
            const tag = tagOf(c.tag);
            const quality = qualityOf(c.quality_tag);
            const selected = c.id === selectedId;
            const urgent = tag === "needs_human";
            // A thread opened this session reads as read (see readIds above).
            const unread = readIds.has(c.id) ? 0 : c.unread_count;
            return (
              <Link
                key={c.id}
                // Carry the page through explicitly: buildConversationsHref resets
                // to page 1 for anything that isn't a pager click, and opening a
                // thread from page 3 must not send you back to page 1.
                href={buildConversationsHref(
                  current,
                  { page: current.page },
                  `/conversations/${c.id}`,
                )}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex gap-3 px-5 py-3.5 transition-colors",
                  i > 0 && "border-t border-ss-hair-2",
                  selected
                    ? "border-l-[3px] border-l-ss-indigo bg-[#f4f5ff] pl-[17px]"
                    : urgent
                      ? "border-l-[3px] border-l-ss-rose pl-[17px] hover:bg-ss-page"
                      : "hover:bg-ss-page",
                )}
              >
                <SsAvatar
                  name={name}
                  size={38}
                  tone={
                    urgent
                      ? "rose"
                      : name === "Unknown contact"
                        ? "flat"
                        : "indigo"
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate text-[13.5px] leading-none text-ss-ink",
                        unread > 0 ? "font-bold" : "font-semibold",
                      )}
                    >
                      {name}
                    </span>
                    <ChannelChip platform={c.platform} />
                    <span className="ml-auto shrink-0 text-[10.5px] font-medium leading-none text-ss-muted">
                      {inboxStamp(c.last_message_at)}
                    </span>
                  </div>

                  <p className="mt-1.5 truncate text-[12.5px] leading-snug text-ss-body">
                    {botNameOf(c.chatbots) ?? "-"}
                    {c.status === "ai_paused" ? " · you took over" : ""}
                  </p>

                  <div className="mt-1.5 flex items-center gap-1.5">
                    <SsChip tone={TAG_CHIP[tag]}>{TAG_LABEL[tag]}</SsChip>
                    {quality && (
                      <SsChip tone={quality === "good" ? "green" : "rose-soft"}>
                        {QUALITY_LABEL[quality]}
                      </SsChip>
                    )}
                    {(c.extraction_attempts ?? 0) > 0 && (
                      <SsChip tone="rose">Flagged</SsChip>
                    )}
                    {unread > 0 && (
                      <SsCount className="ml-auto">{unread}</SsCount>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* ---- Pager ------------------------------------------------------ */}
      {totalPages > 1 && (
        <div className="flex flex-none items-center justify-between gap-2 border-t border-ss-hair px-5 py-3">
          <span className="text-[11.5px] leading-none text-ss-muted">
            {num(total)} thread{total === 1 ? "" : "s"} · page {page} of{" "}
            {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <PagerLink
              href={buildConversationsHref(
                current,
                { page: page - 1 },
                basePath,
              )}
              disabled={page <= 1}
              rel="prev"
            >
              ‹
            </PagerLink>
            <PagerLink
              href={buildConversationsHref(
                current,
                { page: page + 1 },
                basePath,
              )}
              disabled={page >= totalPages}
              rel="next"
            >
              ›
            </PagerLink>
          </div>
        </div>
      )}
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled: boolean;
  rel: string;
  children: React.ReactNode;
}) {
  const cls =
    "flex h-7 w-7 items-center justify-center rounded-ctl border border-ss-line text-[13px] font-semibold leading-none text-ss-body";
  if (disabled) {
    return (
      <span aria-disabled className={cn(cls, "opacity-40")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      rel={rel}
      className={cn(cls, "hover:bg-ss-page hover:text-ss-ink")}
    >
      {children}
    </Link>
  );
}

/** The removable chips for whatever is currently narrowing the list. */
function activeChips(current: ConvFilterState, basePath: string) {
  const out: { label: string; clearHref: string }[] = [];
  if (current.platform) {
    out.push({
      label:
        PLATFORM_META[current.platform as Platform]?.label ?? current.platform,
      clearHref: buildConversationsHref(current, { platform: null }, basePath),
    });
  }
  if (current.quality) {
    out.push({
      label:
        QUALITY_LABEL[current.quality as "good" | "bad"] ?? current.quality,
      clearHref: buildConversationsHref(current, { quality: null }, basePath),
    });
  }
  if (current.range) {
    const label =
      current.range === "1d"
        ? "Last day"
        : current.range === "7d"
          ? "Last 7 days"
          : "Last 30 days";
    out.push({
      label,
      clearHref: buildConversationsHref(current, { range: null }, basePath),
    });
  }
  if (current.from || current.to) {
    out.push({
      label: `${current.from ?? "…"} → ${current.to ?? "…"}`,
      clearHref: buildConversationsHref(
        current,
        { from: null, to: null },
        basePath,
      ),
    });
  }
  if (current.q) {
    out.push({
      label: `“${current.q}”`,
      clearHref: buildConversationsHref(current, { q: null }, basePath),
    });
  }
  return out;
}
