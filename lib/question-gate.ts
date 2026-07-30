/**
 * "Answer opener questions" — the softening for a keyword-gated bot (webhook 6-gate).
 *
 * When keyword_gate_answer_questions is ON, a never-engaged stranger who opens with a
 * GENUINE business question is answered by the AI (and the conversation starts) instead
 * of being silenced. Two stages, both fail-CLOSED (any miss/error keeps the gate shut —
 * silence is the current behavior, the safe direction for a privacy gate):
 *
 *   Stage 1  isSubstantiveInquiry(text)      — free, deterministic, pure. Rejects bare
 *            greetings, trivial acks, control words, and prompt-extraction probes, and
 *            requires real substance. Reuses the same guards as the gates it sits beside.
 *   Stage 2  screenInquiryRelevance(...)     — a cheap-model YES/NO: is this a real
 *            inquiry from a prospective customer of THIS business (vs a friend / spam /
 *            collab)? Only runs when Stage 1 passes, and is capped per contact by the
 *            caller (question_screen_count < MAX_QUESTION_SCREENS).
 *
 * No per-chatbot literals live here (gotcha #12): the business context is passed in.
 * Stage 1 is covered by scripts/test-question-gate.ts.
 */
import { isWelcomeOpener } from "./welcome";
import { getTrivialReply } from "./limits";
import { detectUserControl } from "./user-controls";
import { detectExtractionAttempt } from "./extraction-detect";
import { openaiChat } from "./openai";
import { MODELS } from "./model-tiers";

/** Max paid relevance screens per contact before we stop screening them (cost bound). */
export const MAX_QUESTION_SCREENS = 3;

const SCREEN_MODEL = MODELS.questionGate();

/**
 * Whole-word inquiry/interrogative signals (already lowercased tokens). A message that
 * contains any of these reads as a question/inquiry even without a "?" ("how much is
 * credit repair", "i need help with my score", "interested in funding").
 */
const INQUIRY_WORDS = new Set([
  "how", "what", "when", "where", "why", "who", "which", "whom", "whose",
  "can", "could", "do", "does", "did", "is", "are", "am", "will", "would", "should", "may",
  "need", "want", "looking", "interested", "help", "info", "information", "question",
  "price", "prices", "pricing", "cost", "costs", "quote", "available", "offer",
]);

/**
 * Stage 1 — free, deterministic. Is this inbound a SUBSTANTIVE inquiry worth the paid
 * relevance screen (vs a bare greeting / ack / control word / extraction probe / one-off
 * noise)? Pure + synchronous, so it's unit-testable and adds no latency.
 */
export function isSubstantiveInquiry(text: string): boolean {
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) return false;
  // Bare greeting ("hey", "hello there") — pass [] so ONLY greetings match, not keywords.
  if (isWelcomeOpener(raw, [])) return false;
  // Trivial ack ("thanks", "ok", 👍) and self-pause/resume control words.
  if (getTrivialReply(raw)) return false;
  if (detectUserControl(raw)) return false;
  // Keep prompt-extraction probes silenced — they are "questions" too. Fail-open on a
  // throwing detector: fall through to the substance check rather than mis-gating.
  try {
    if (detectExtractionAttempt(raw).level !== "none") return false;
  } catch {
    /* fall through */
  }
  // Substance: an explicit question mark, an interrogative/inquiry word, or enough words.
  if (raw.includes("?")) return true;
  const tokens = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((t) => INQUIRY_WORDS.has(t))) return true;
  return tokens.length >= 4;
}

/**
 * Parse the relevance model's reply into a boolean. Fail-CLOSED: only an affirmative
 * "yes" (leading, case-insensitive, tolerating a wrapping quote) counts; anything else —
 * "no", empty, junk — is false. Pure, unit-testable.
 */
export function parseRelevance(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /^\s*["'`]?\s*yes\b/i.test(raw);
}

/**
 * Stage 2 — cheap-AI relevance screen. YES iff the message is a genuine inquiry from a
 * prospective customer of this business. Never throws; returns false on any error or
 * timeout (fail-CLOSED → stays gated → silent, the pre-feature behavior).
 */
export async function screenInquiryRelevance(opts: {
  text: string;
  botName: string;
  businessContext: string;
}): Promise<boolean> {
  const text = (opts.text ?? "").trim();
  if (!text) return false;
  try {
    const { text: out } = await openaiChat({
      model: SCREEN_MODEL,
      system:
        "You screen inbound Instagram/Facebook DMs for a business and decide if a message " +
        "is a GENUINE INQUIRY from a PROSPECTIVE CUSTOMER about that business — its products, " +
        "services, pricing, results, or how to get started.\n" +
        "Answer NO for: greetings or small talk, personal or unrelated messages, messages that " +
        "read like they are from a friend, spam, self-promotion, or collab/shoutout/partnership " +
        "requests. When unsure, answer NO.\n" +
        `Business name: ${opts.botName || "(unknown)"}.\n` +
        `What the business does: ${opts.businessContext?.trim() || "(not specified)"}.\n` +
        "Reply with ONLY one word: YES or NO.",
      messages: [{ role: "user", content: `Message: ${text}\n\nYES or NO:` }],
      maxTokens: 3,
      timeoutMs: 6_000,
    });
    return parseRelevance(out);
  } catch {
    return false;
  }
}
