// lib/chatbot-tabs.ts
// Single source of truth for the manage-chatbot page's sub-tabs. Drives both the
// client segmented-control (components/dashboard/chatbot-tabs-bar.tsx) and the
// server page's ?tab= validation (app/(dashboard)/chatbots/[id]/page.tsx) — same
// pattern as lib/platforms.ts driving the inbox tabs. Pure data, no "use client".

export const CHATBOT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "prompt", label: "Prompt" },
  { key: "keywords", label: "Keywords" },
  { key: "followups", label: "Follow-ups" },
  { key: "media", label: "Media" },
  { key: "connection", label: "Connection" },
] as const;

export type ChatbotTabKey = (typeof CHATBOT_TABS)[number]["key"];

export const CHATBOT_TAB_KEYS = CHATBOT_TABS.map((t) => t.key) as readonly ChatbotTabKey[];

export const DEFAULT_CHATBOT_TAB: ChatbotTabKey = "overview";

/** Validate a raw ?tab= value, falling back to the default (Overview). */
export function resolveChatbotTab(raw: string | undefined | null): ChatbotTabKey {
  return (CHATBOT_TAB_KEYS as readonly string[]).includes(raw ?? "")
    ? (raw as ChatbotTabKey)
    : DEFAULT_CHATBOT_TAB;
}
