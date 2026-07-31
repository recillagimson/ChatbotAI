/**
 * Conversation QUALITY tag - an owner-set rating of how a DM thread went, kept
 * SEPARATE from and ORTHOGONAL to the funnel `tag` (lib/conversation-tags.ts). A
 * thread can be both e.g. `subscribed` AND `good`. Manual only - the AI classifier
 * never sets it. Null = unrated (the default). Pure and dependency-free so it's safe
 * in both server (pages) and client (inbox actions) bundles.
 */
export const CONVERSATION_QUALITY = ["good", "bad"] as const;
export type QualityTag = (typeof CONVERSATION_QUALITY)[number];

/** Human-facing label shown on the badge and the inbox dropdown. */
export const QUALITY_LABEL: Record<QualityTag, string> = {
  good: "Good Conversation",
  bad: "Bad Conversation",
};

/** Badge variant per quality (from components/ui/badge.tsx). */
export const QUALITY_VARIANT: Record<QualityTag, "success" | "destructive"> = {
  good: "success",
  bad: "destructive",
};

export function isQualityTag(v: unknown): v is QualityTag {
  return typeof v === "string" && (CONVERSATION_QUALITY as readonly string[]).includes(v);
}

/** Coerce an unknown DB value to a QualityTag, or null when unrated/invalid
 *  (handles a missing column pre-migration and the loosely-typed Supabase row). */
export function qualityOf(v: unknown): QualityTag | null {
  return isQualityTag(v) ? v : null;
}
