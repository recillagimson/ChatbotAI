// lib/chatbot-tabs.ts
// Single source of truth for the manage-chatbot page's sub-tabs. Drives both the
// client segmented-control (components/dashboard/chatbot-tabs-bar.tsx) and the
// server page's ?tab= validation (app/(dashboard)/chatbots/[id]/page.tsx) - same
// pattern as lib/platforms.ts driving the inbox tabs. Pure data, no "use client".

export const CHATBOT_TABS = [
  { key: "overview", label: "Overview" },
  // The knowledge base lives at the bottom of this tab (it was a separate sidebar
  // page), so the label says so - that is how people find it now.
  { key: "prompt", label: "Prompt & Knowledge" },
  { key: "keywords", label: "Keywords" },
  { key: "training", label: "Training" },
  { key: "followups", label: "Follow-ups" },
  { key: "media", label: "Media" },
  { key: "connection", label: "Connection" },
] as const;

export type ChatbotTabKey = (typeof CHATBOT_TABS)[number]["key"];

export const CHATBOT_TAB_KEYS = CHATBOT_TABS.map((t) => t.key) as readonly ChatbotTabKey[];

export const DEFAULT_CHATBOT_TAB: ChatbotTabKey = "overview";

/** The per-bot EDITING tabs, shown in the superadmin admin panel. Overview is a
 *  client-only dashboard summary (health strip + user-global shortcuts like
 *  /follow-ups and /statistics), so it's excluded from the admin surface. */
export const EDITING_CHATBOT_TABS: readonly { key: ChatbotTabKey; label: string }[] =
  CHATBOT_TABS.filter((t) => t.key !== "overview");

/** Where a bot's knowledge lives: the Knowledge section of its Prompt tab. */
export function knowledgeHref(chatbotId: string): string {
  return `/chatbots/${chatbotId}?tab=prompt#knowledge`;
}

/**
 * Where the old /knowledge-base URL sends someone, now that knowledge is a
 * section of each bot's Prompt tab. `botIds` are the viewed account's own bots
 * (oldest first); `requested` is its ?bot=, honoured only when the account owns
 * it. One bot goes straight there; several go to the roster to pick one, since
 * guessing would drop someone into the wrong bot's knowledge.
 */
export function knowledgeRedirectTarget(
  botIds: readonly string[],
  requested: string | null | undefined
): string {
  if (botIds.length === 0) return "/chatbots/new";
  if (requested && botIds.includes(requested)) return knowledgeHref(requested);
  if (botIds.length === 1) return knowledgeHref(botIds[0]);
  return "/chatbots";
}

/**
 * Validate a raw ?tab= value against an allowed tab set, falling back to that set's
 * first tab. Defaults to the full CHATBOT_TABS (fallback Overview), so existing
 * callers are unchanged; the admin route passes EDITING_CHATBOT_TABS (fallback Prompt).
 */
export function resolveChatbotTab(
  raw: string | undefined | null,
  allowed: readonly { key: ChatbotTabKey }[] = CHATBOT_TABS
): ChatbotTabKey {
  const keys = allowed.map((t) => t.key);
  return keys.includes((raw ?? "") as ChatbotTabKey) ? (raw as ChatbotTabKey) : keys[0];
}
