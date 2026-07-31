"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { buildConversationsHref, type ConvFilterState } from "@/lib/conversation-filters";

/**
 * Inbox search.
 *
 * Matches the contact's name or handle - not message bodies, which would need a
 * full-text index the schema doesn't have yet. The placeholder says so rather
 * than promising a search that silently misses.
 *
 * Debounced into the URL so the result is a shareable, back-button-able view
 * like every other filter, instead of client-only state that vanishes on reload.
 */
export function InboxSearch({
  current,
  basePath,
}: {
  current: ConvFilterState;
  basePath?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current.q ?? "");
  const committed = useRef(current.q ?? "");

  // Keep in step when the URL changes underneath us (back button, Clear).
  useEffect(() => {
    committed.current = current.q ?? "";
    setValue(current.q ?? "");
  }, [current.q]);

  useEffect(() => {
    const next = value.trim();
    if (next === committed.current) return;
    const t = window.setTimeout(() => {
      committed.current = next;
      router.push(
        buildConversationsHref(current, { q: next || null }, basePath)
      );
    }, 300);
    return () => window.clearTimeout(t);
    // `current`/`basePath` are stable per render of the server page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="mt-3.5 flex items-center gap-2 rounded-[10px] border border-ss-line bg-ss-page px-3 py-2.5 focus-within:border-ss-indigo-200 focus-within:bg-white">
      <Search className="h-[17px] w-[17px] shrink-0 text-ss-muted" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search name or handle…"
        aria-label="Search conversations by contact name or handle"
        className="min-w-0 flex-1 bg-transparent text-[12.5px] leading-none text-ss-ink outline-none placeholder:text-ss-faint"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="shrink-0 rounded-full p-0.5 text-ss-muted transition-colors hover:bg-ss-chip hover:text-ss-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
