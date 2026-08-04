/**
 * Self-service pause/resume control words.
 *
 * A lead silences the AI for their own conversation by texting a stop word
 * (e.g. "stop", "stopmessage", "unsubscribe") and turns it back on with a
 * resume word ("resume", "resumemessage", "unmute"). The webhook (gate 6-mute)
 * tracks this on conversations.user_muted_at, independent of the owner's
 * human-takeover (status='ai_paused'). These are platform-wide control words
 * (universal, like SMS STOP/START) - NOT a tenant literal, so gotcha #12 is
 * satisfied.
 *
 * Matching is WHOLE-MESSAGE ONLY (after lowercasing + stripping surrounding
 * punctuation/emoji): "stop", "STOP!", "🛑 stop 🛑" mute; but an embedded word
 * ("I can't stop thinking about it", "stopmessage please") does NOT - this
 * avoids false opt-outs mid-conversation while accepting the natural phrasings
 * real contacts type.
 *
 * Pure + synchronous. Covered by scripts/test-user-controls.ts.
 */
import { normalize } from "./keyword-triggers";

export const STOP_KEYWORD = "stopmessage";
export const RESUME_KEYWORD = "resumemessage";

// Whole-message opt-out / opt-in phrases (platform-wide, no tenant literal).
const STOP_PHRASES = new Set([
  "stopmessage",
  "stop",
  "stop message",
  "stop messages",
  "stop messaging",
  "stop messaging me",
  "stop texting",
  "stop texting me",
  "message stop",     // reversed word order (leads guess it; separators normalized below)
  "unsubscribe",
]);
const RESUME_PHRASES = new Set([
  "resumemessage",
  "resume",
  "resume message",
  "resume messages",
  "unmute",
]);

// Generic, platform-wide (no tenant literal). No em/en dashes - sanitize is
// outbound-only, so keeping the source clean avoids a needless rewrite on send.
export const STOP_CONFIRMATION =
  "Got it, I'll hold off on messages from here. Whenever you want them back on, just reply resume.";
export const RESUME_CONFIRMATION =
  "You're all set, I'll start replying again. What can I help you with?";

/**
 * "stop" | "resume" | null. WHOLE-MESSAGE match only: the message must BE a
 * control phrase (after normalize + stripping surrounding punctuation/emoji),
 * not merely contain one. Stop is checked first so it wins if a phrase were
 * ever in both sets.
 */
export function detectUserControl(text: string): "stop" | "resume" | null {
  const n = typeof text === "string" ? normalize(text) : "";
  // 1) Strip leading/trailing non-alphanumerics (punctuation, emoji, spaces) so
  //    "stop!", "🛑 stop 🛑" still match, but keep internal words intact so an
  //    embedded control word inside a sentence does not.
  // 2) Treat internal underscores/hyphens as word separators, so a keyword-style
  //    "stop_message" / "stop-message" matches the same phrase as "stop message".
  //    Leads copy the ManyChat keyword name verbatim (separators and all), and a
  //    consent opt-out must not fail on a separator mismatch. Whole-message match
  //    is preserved: "stop_message please" still normalizes to a 3-word non-phrase.
  const phrase = n
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!phrase) return null;
  if (STOP_PHRASES.has(phrase)) return "stop";
  if (RESUME_PHRASES.has(phrase)) return "resume";
  return null;
}
