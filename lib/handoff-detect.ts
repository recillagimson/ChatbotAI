/**
 * Deterministic GRACEFUL-DISENGAGE detector - Fix E for the long-thread sales loop.
 *
 * The AI disqualify screen (lib/conversation-screen.ts) deliberately answers `none`
 * for a lead who is merely hesitant, deferring, or venting - so a lead who explicitly
 * asks for a human, or who is clearly distressed, gets no stand-down and the bot keeps
 * re-pitching in a loop. This module is the floor that catches the two UNMISTAKABLE
 * cases the screen lets through:
 *   - human_request : the lead explicitly asks to reach a person, not the bot.
 *   - distress      : the lead sounds genuinely distressed / discouraged.
 *
 * On a hit the webhook (route.ts) does two SOFT things - it never silences the bot, so
 * a false positive is non-terminal (worst case: one gentle reply):
 *   1. injects renderHandoffBlock() into the volatile prompt tail via the flow/sent
 *      slot (so buildSystemPrompt / lib/anthropic.ts need no change), steering the
 *      model to STOP pitching and defer warmly to a person; and
 *   2. tags the thread `needs_human` (the red "Needs attention" inbox badge).
 *
 * Pure + fail-open, mirroring lib/spam-detect.ts. Multi-tenant (gotcha #12): every
 * phrase is intent-generic ("talk to a real person", "this is hopeless") - never a
 * client keyword/persona/offer. List hygiene: each entry must be unmistakable, with
 * ~near-zero benign use in a real lead's DM. Covered by tests/handoff-detect.spec.ts.
 */
import { normalize, containsWord } from "./keyword-triggers";

export type HandoffReason = "human_request" | "distress";

export interface HandoffResult {
  handoff: boolean;
  /** The matched reason; human_request outranks distress when both appear. */
  reason: HandoffReason | null;
  /** Which phrases matched (telemetry/debugging). */
  patterns: string[];
}

/**
 * Explicit "put me through to a person" asks. A lead types these only when they
 * genuinely want a human rather than the assistant. Bare "person" / "human" /
 * "someone" / "agent" are deliberately EXCLUDED (far too common in a normal DM); only
 * the "talk/speak/chat/connect ... a person/human/someone" constructions and the
 * unmistakable "real person" / "human agent" / "live agent" forms are here. EN + ES
 * (accent-free - the detector folds diacritics before matching). Whole-word matched,
 * so "real person" also matches "a real person" without a separate entry.
 */
export const HUMAN_REQUEST_PHRASES = [
  "real person",
  "real human",
  "actual person",
  "actual human",
  "talk to a person",
  "talk to a human",
  "talk to someone",
  "speak to a person",
  "speak to a human",
  "speak to someone",
  "speak with a person",
  "speak with a human",
  "speak with someone",
  "chat with a person",
  "chat with a human",
  "connect me with someone",
  "connect me to a person",
  "connect me with a person",
  "get me a human",
  "i want a human",
  "human agent",
  "live agent",
  "talk to a rep",
  "speak to a rep",
  "customer service rep",
  // Spanish parity (accent-free; the NFD fold strips accents from the text)
  "persona real",
  "un humano",
  "hablar con una persona",
  "hablar con alguien",
  "hablar con un humano",
  "hablar con un agente",
  "quiero hablar con alguien",
  "agente real",
  "atencion al cliente",
];

/**
 * Genuine distress / discouragement about their situation - the duty-of-care signal.
 * Kept TIGHT and unmistakable so an ordinarily frustrated-but-engaged lead is not
 * flagged: mild frustration and profanity stay OUT (the disqualify screen already
 * treats those as engagement). The action is soft (back off + show care + flag), so a
 * rare over-trigger is a gentle reply, never a silence.
 */
export const DISTRESS_PHRASES = [
  "hopeless",
  "i cant do this anymore",
  "cant do this anymore",
  "cant take it anymore",
  "i cant go on",
  "i feel worthless",
  "i am overwhelmed",
  "im overwhelmed",
  "so overwhelmed",
  "at my breaking point",
  // Spanish parity (accent-free)
  "sin esperanza",
  "no hay esperanza",
  "me rindo",
  "estoy abrumado",
  "no puedo mas",
  "ya no puedo mas",
];

/**
 * Lowercase/collapse (normalize), strip accents so the accent-free Spanish entries
 * match accented text, and drop apostrophes so "can't" matches "cant". Same NFD fold
 * as lib/spam-detect.ts, plus the apostrophe drop lib/conversation-screen.ts uses.
 */
function fold(text: string): string {
  return normalize(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "");
}

/**
 * True when the message unmistakably calls for a human hand-off or shows distress.
 * human_request outranks distress when both match. Pure + fail-open: any error or
 * empty/non-string input returns { handoff: false } so the normal reply path runs.
 */
export function detectHandoff(text: string): HandoffResult {
  try {
    if (typeof text !== "string" || !text.trim()) {
      return { handoff: false, reason: null, patterns: [] };
    }
    const n = fold(text);
    const humanHits = HUMAN_REQUEST_PHRASES.filter((p) => containsWord(n, p));
    if (humanHits.length > 0) {
      return { handoff: true, reason: "human_request", patterns: humanHits };
    }
    const distressHits = DISTRESS_PHRASES.filter((p) => containsWord(n, p));
    if (distressHits.length > 0) {
      return { handoff: true, reason: "distress", patterns: distressHits };
    }
    return { handoff: false, reason: null, patterns: [] };
  } catch {
    return { handoff: false, reason: null, patterns: [] };
  }
}

/**
 * The DISENGAGE directive appended to the volatile prompt tail on a hit, or "" when
 * there is no reason (so a normal turn's prompt is byte-identical). It steers TONE +
 * NEXT MOVE only; it never silences the bot. Generic/multi-tenant - no client copy.
 */
export function renderHandoffBlock(reason: HandoffReason | null): string {
  if (!reason) return "";
  const shared =
    " Reply briefly and warmly. Do NOT pitch, sell, ask qualifying questions, push to " +
    "close, or send any link or asset, and do not repeat earlier questions or offers.";
  if (reason === "human_request") {
    return (
      "HAND OFF TO A PERSON: this person has asked to speak with a human. Acknowledge " +
      "that warmly, let them know a team member will personally follow up with them, and " +
      "invite them to add anything else in the meantime." +
      shared
    );
  }
  return (
    "DISENGAGE - SHOW CARE: this person sounds distressed or discouraged. Lead with " +
    "genuine empathy, take the pressure off completely, and reassure them that a team " +
    "member will personally reach out and there is no rush." +
    shared
  );
}
