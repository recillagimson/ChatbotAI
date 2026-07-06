/**
 * Self-service pause/resume control words.
 *
 * A lead silences the AI for their own conversation by texting "stopmessage"
 * and turns it back on with "resumemessage". The webhook (gate 6-mute) tracks
 * this on conversations.user_muted_at, independent of the owner's human-takeover
 * (status='ai_paused'). These are platform-wide control words (universal, like
 * SMS STOP/START) — NOT a tenant literal, so gotcha #12 is satisfied.
 *
 * Pure + synchronous. Covered by scripts/test-user-controls.ts.
 */
import { normalize, containsWord } from "./keyword-triggers";

export const STOP_KEYWORD = "stopmessage";
export const RESUME_KEYWORD = "resumemessage";

// Generic, platform-wide (no tenant literal). No em/en dashes — sanitize is
// outbound-only, so keeping the source clean avoids a needless rewrite on send.
export const STOP_CONFIRMATION =
  "Got it, I'll hold off on messages from here. Whenever you want them back on, just type resumemessage.";
export const RESUME_CONFIRMATION =
  "You're all set, I'll start replying again. What can I help you with?";

/** "stop" | "resume" | null. If both somehow appear, stop wins (respect the opt-out). */
export function detectUserControl(text: string): "stop" | "resume" | null {
  const n = typeof text === "string" ? normalize(text) : "";
  if (!n) return null;
  if (containsWord(n, STOP_KEYWORD)) return "stop";
  if (containsWord(n, RESUME_KEYWORD)) return "resume";
  return null;
}
