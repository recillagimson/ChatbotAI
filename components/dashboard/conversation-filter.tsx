"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Chatbot filter for the Conversations inbox. URL-driven (like the platform tabs
 * on the same page): navigates to ?chatbot=<id> while preserving the active
 * platform, so the two filters compose. "All chatbots" clears the filter.
 */
export function ConversationFilter({
  chatbots,
  chatbotId,
  platform,
}: {
  chatbots: { id: string; name: string }[];
  chatbotId: string | null;
  platform: string | null;
}) {
  const router = useRouter();

  function handleChange(value: string) {
    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    if (value) params.set("chatbot", value);
    const qs = params.toString();
    router.push(qs ? `/conversations?${qs}` : "/conversations", { scroll: false });
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="conversations-bot">
        Filter by chatbot
      </label>
      <select
        id="conversations-bot"
        value={chatbotId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          "flex h-10 min-w-[160px] appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm",
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
  );
}
