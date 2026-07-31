/**
 * Conversation tag taxonomy - the single source of truth for the buckets a DM
 * thread can fall into, their display, and the write-precedence rule. Pure and
 * dependency-free so it's safe in both server (webhook, pages) and client
 * (inbox actions) bundles.
 *
 * `subscribed` is coupled to conversations.confirmed_at (the conversion state that
 * makes the bot go silent); `starting_later` pauses the follow-up drip (AI replies
 * stay on) and carries a start date. The others are set each AI turn by the
 * background classifier in lib/conversation-classify.ts. See resolveTagWrite.
 */
export const CONVERSATION_TAGS = [
  "lead",
  "wants_call",
  "starting_later",
  "needs_human",
  "subscribed",
  "disqualified",
  "bot",
] as const;
export type ConversationTag = (typeof CONVERSATION_TAGS)[number];

/** Human-facing label. "Subscribed" is deliberately generic (multi-tenant - no client-specific "Skool"). */
export const TAG_LABEL: Record<ConversationTag, string> = {
  lead: "Lead",
  wants_call: "Wants a call",
  starting_later: "Starting later",
  needs_human: "Needs attention",
  subscribed: "Subscribed",
  disqualified: "Disqualified",
  bot: "Bot / Spam",
};

/** Badge variant per tag (from components/ui/badge.tsx). `secondary` is the muted
 *  gray used for the "dead" buckets (disqualified/bot) - distinct from the red
 *  needs_human "urgent" and green subscribed. */
export const TAG_VARIANT: Record<
  ConversationTag,
  "outline" | "default" | "destructive" | "success" | "warning" | "secondary"
> = {
  lead: "outline",
  wants_call: "default",
  starting_later: "warning",
  needs_human: "destructive",
  subscribed: "success",
  disqualified: "secondary",
  bot: "secondary",
};

/**
 * Precedence rank. Higher = stickier: a lower-ranked classification never
 * overwrites a higher-ranked current tag. `lead` and `wants_call` share rank 0 so
 * they move freely turn-to-turn. `starting_later` (a paused, dated lead) sticks
 * above them but yields to `needs_human` and `subscribed`.
 */
export const TAG_RANK: Record<ConversationTag, number> = {
  lead: 0,
  wants_call: 0,
  starting_later: 2,
  needs_human: 3,
  subscribed: 4,
  disqualified: 4,
  bot: 4,
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
 * Precedence/stickiness for an AUTO-classified tag write. `subscribed`,
 * `disqualified`, and `bot` are TERMINAL - auto-classification never moves a
 * thread off them (owner-only reopen via the inbox dropdown). Otherwise a
 * lower-ranked incoming tag can't clobber a stickier current one: `needs_human`
 * and `starting_later` persist until the owner changes them, the contact
 * converts, or a higher signal fires. `lead` ↔ `wants_call` still move freely.
 */
export function resolveTagWrite(
  current: ConversationTag | null | undefined,
  incoming: ConversationTag
): ConversationTag {
  if (current === "subscribed" || current === "disqualified" || current === "bot") return current;
  if (current && TAG_RANK[current] > TAG_RANK[incoming]) return current;
  return incoming;
}
