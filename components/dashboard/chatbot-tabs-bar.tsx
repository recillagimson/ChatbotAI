"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { CHATBOT_TABS, type ChatbotTabKey } from "@/lib/chatbot-tabs";

/**
 * Segmented-control tab bar for the manage-chatbot page. Writes the active tab to
 * the ?tab= query param (deep-linkable, survives refresh) with scroll:false so the
 * page doesn't jump — mirrors the Statistics page's stats-controls-bar. The server
 * page reads/validates the param (resolveChatbotTab) and renders the active panel.
 */
export function ChatbotTabsBar({ active }: { active: ChatbotTabKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectTab(key: ChatbotTabKey) {
    if (key === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key); // preserve any other params
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    // overflow-x-auto so the 6 tabs scroll horizontally on narrow screens instead
    // of forcing the whole page to scroll sideways.
    <div className="mb-6 overflow-x-auto">
      <div
        className="inline-flex w-max items-center gap-1 rounded-lg bg-muted p-1"
        role="group"
        aria-label="Chatbot settings sections"
      >
        {CHATBOT_TABS.map(({ key, label }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => selectTab(key)}
              className={cn(
                "inline-flex items-center justify-center min-h-[44px] px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "motion-reduce:transition-none",
                isActive
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
