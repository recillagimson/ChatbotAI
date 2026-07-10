/**
 * Conversation tag taxonomy — the single source of truth for the four buckets a
 * DM thread can fall into, their display, and the write-precedence rule. Pure and
 * dependency-free so it's safe in both server (webhook, pages) and client
 * (inbox actions) bundles.
 *
 * `subscribed` is coupled to conversations.confirmed_at (the conversion state that
 * makes the bot go silent); the other three are set each AI turn by the background
 * classifier in lib/conversation-classify.ts. See resolveTagWrite for stickiness.
 */
export const CONVERSATION_TAGS = ["lead", "wants_call", "needs_human", "subscribed"] as const;
export type ConversationTag = (typeof CONVERSATION_TAGS)[number];

/** Human-facing label. "Subscribed" is deliberately generic (multi-tenant — no client-specific "Skool"). */
export const TAG_LABEL: Record<ConversationTag, string> = {
  lead: "Lead",
  wants_call: "Wants a call",
  needs_human: "Needs attention",
  subscribed: "Subscribed",
};

/** Badge variant per tag (from components/ui/badge.tsx). */
export const TAG_VARIANT: Record<ConversationTag, "outline" | "default" | "destructive" | "success"> = {
  lead: "outline",
  wants_call: "default",
  needs_human: "destructive",
  subscribed: "success",
};

export function isTag(v: unknown): v is ConversationTag {
  return typeof v === "string" && (CONVERSATION_TAGS as readonly string[]).includes(v);
}

/** Coerce an unknown DB value to a valid tag, defaulting to 'lead' (handles a
 *  missing column pre-migration and keeps the loosely-typed Supabase row narrow). */
export function tagOf(v: unknown): ConversationTag {
  return isTag(v) ? v : "lead";
}

/**
 * Precedence/stickiness for an AUTO-classified tag write. `subscribed` is handled
 * separately (set together with confirmed_at), but is honored here defensively so
 * a stray classification never downgrades a customer. `needs_human` is sticky —
 * once a thread needs attention it stays flagged until the owner changes it by
 * hand or the contact converts. `lead` ↔ `wants_call` move freely turn-to-turn.
 */
export function resolveTagWrite(
  current: ConversationTag | null | undefined,
  incoming: ConversationTag
): ConversationTag {
  if (current === "subscribed") return "subscribed"; // never auto-downgrade a customer
  if (current === "needs_human" && incoming !== "needs_human") return "needs_human"; // sticky until manual/convert
  return incoming;
}
