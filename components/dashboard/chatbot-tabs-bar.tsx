"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { CHATBOT_TABS, type ChatbotTabKey } from "@/lib/chatbot-tabs";

/**
 * The chatbot page's section tabs - the design's underline strip, flush with the
 * bottom edge of the white header so the active tab's rule and the header's own
 * hairline read as one line.
 *
 * Writes to `?tab=` (deep-linkable, survives refresh) with `scroll: false` so
 * switching sections doesn't throw you back to the top of a long form. The
 * server page reads and validates the param.
 */
export function ChatbotTabsBar({
  active,
  tabs = CHATBOT_TABS,
}: {
  active: ChatbotTabKey;
  /** The tab set to render. Defaults to all; the admin per-bot route passes the
   *  editing subset (EDITING_CHATBOT_TABS) so Overview isn't offered there. */
  tabs?: readonly { key: ChatbotTabKey; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectTab(key: ChatbotTabKey) {
    if (key === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key); // preserve any other params (e.g. ?bot=)
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div
      className="ss-rail -mb-px mt-4 flex gap-0.5"
      role="tablist"
      aria-label="Chatbot settings sections"
    >
      {tabs.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => selectTab(key)}
            className={cn(
              "shrink-0 whitespace-nowrap px-[15px] py-3 text-[13px] leading-none transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo",
              "motion-reduce:transition-none",
              isActive
                ? "font-bold text-ss-ink shadow-[inset_0_-2px_0_#6366f1]"
                : "font-medium text-ss-muted hover:text-ss-body"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
