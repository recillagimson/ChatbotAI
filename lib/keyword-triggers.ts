/**
 * Keyword-trigger matching for the ManyChat webhook.
 *
 * A group matches an inbound message when the message contains ANY of the
 * group's include `keywords` as a whole word/phrase AND NONE of its `exclude`
 * keywords. Matching is case-insensitive and whitespace-tolerant, and uses
 * word boundaries so "credit" does not match "discredit" and "63" does not
 * match "163". An empty include list never matches (a half-filled group can't
 * swallow every message).
 *
 * Pure + synchronous — no I/O, no per-chatbot literals (gotcha #12: the words
 * live in the chatbot's own `keyword_triggers` data, never hardcoded here).
 * Covered by scripts/test-keyword-match.ts.
 */
import type { KeywordGroup } from "./types";

/** Lowercase, trim, collapse internal whitespace. Mirrors getTrivialReply's normalize. */
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if `keyword` appears as a whole word/phrase in the already-normalized text. */
export function containsWord(normalizedText: string, keyword: string): boolean {
  const k = normalize(keyword);
  if (!k) return false;
  // Whole-word/phrase boundaries: the keyword must not be flanked by another
  // letter or digit (Unicode-aware via the `u` flag + \p{L}\p{N}), so substrings
  // inside a larger word don't match ("credit" ∌ "discredit", "63" ∌ "163") and an
  // accented neighbour isn't mistaken for a boundary ("el" ∌ "eléctrico"). Inputs
  // are pre-lowercased by normalize(), so no `i` flag is needed.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(k)}(?![\\p{L}\\p{N}])`, "u");
  return re.test(normalizedText);
}

/**
 * Strip surrounding non-alphanumerics (punctuation, emoji, spaces) after normalize,
 * keeping internal words intact. Same edge-strip the reset keyword uses
 * (lib/reset-keyword.ts) — kept local so this module stays self-contained.
 */
function stripEdges(s: string): string {
  return normalize(typeof s === "string" ? s : "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Strict whole-message match: the message must BE the keyword (after normalize +
 * stripping surrounding punctuation/emoji), not merely contain it. So keyword
 * "credit" matches "Credit!" / "🔥 credit" but NOT "i have a problem with my credit"
 * or "credit repair". Empty text or empty keyword -> false. Pure + synchronous.
 * Mirrors matchesResetKeyword in lib/reset-keyword.ts.
 */
export function equalsWholeMessage(text: string, keyword: string): boolean {
  const k = stripEdges(keyword);
  if (!k) return false;
  const phrase = stripEdges(text);
  if (!phrase) return false;
  return phrase === k;
}

/**
 * True if `text` matches this group (ANY include keyword present, NO exclude keyword
 * present). When `strict`, matching is whole-message "equals" (equalsWholeMessage);
 * otherwise whole-word "contains" (containsWord). Default non-strict = legacy behavior.
 */
export function messageMatchesGroup(text: string, group: KeywordGroup, strict = false): boolean {
  const includes = Array.isArray(group?.keywords) ? group.keywords : [];
  const excludes = Array.isArray(group?.exclude) ? group.exclude : [];
  if (strict) {
    if (!includes.some((k) => equalsWholeMessage(text, k))) return false;
    return !excludes.some((k) => equalsWholeMessage(text, k));
  }
  const normalized = normalize(text);
  if (!normalized) return false;
  if (!includes.some((k) => containsWord(normalized, k))) return false;
  return !excludes.some((k) => containsWord(normalized, k));
}

/** First ENABLED group (top-down) that matches `text`, or null. `strict` picks the matcher. */
export function firstMatchingGroup(
  text: string,
  groups: KeywordGroup[] | null | undefined,
  strict = false
): KeywordGroup | null {
  const list = Array.isArray(groups) ? groups : [];
  for (const g of list) {
    if (!g?.enabled) continue;
    if (messageMatchesGroup(text, g, strict)) return g;
  }
  return null;
}

/**
 * Keyword-only reply mode gate (chatbots.keyword_gate_enabled). A keyword is an
 * ENTRY qualifier, not a per-message filter: a contact "unlocks" the bot by
 * matching a keyword once (becoming a possible lead), and from then on the bot
 * replies to ALL their messages — keyword or not — so it can actually carry the
 * conversation it started. A contact who has never matched a keyword stays
 * silent. Returns true when the inbound should be silently gated (no AI, no ack).
 *
 *   gate off                                 → false (feature disabled)
 *   matched a keyword on THIS message         → false (qualifies now)
 *   already engaged (matched a keyword before)→ false (converse with the lead)
 *   gate on, no match, never engaged          → true  (silent for strangers)
 *
 * `alreadyEngaged` is derived from conversations.keyword_fired (non-empty), the
 * same "has this contact shown intent" proxy the follow-up cron uses, so the
 * reactive gate and the proactive drip qualify contacts identically.
 */
export function keywordGateBlocks(
  gateEnabled: boolean,
  matchedKeyword: boolean,
  alreadyEngaged: boolean
): boolean {
  if (!gateEnabled) return false;
  return !matchedKeyword && !alreadyEngaged;
}
