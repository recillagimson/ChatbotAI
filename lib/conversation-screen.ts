/**
 * Pre-reply "disqualify screen": a best-effort AI check on a DM lead's LATEST
 * message that decides whether the automated assistant should STOP replying to
 * this person entirely — because they are abusive, have clearly rejected the
 * service, or are themselves an automated bot. Runs BEFORE reply generation (see
 * the webhook pre-gate) so the offending message gets no reply at all.
 *
 * Fail-open by construction: parseScreen never throws and screenDisqualify
 * catches everything, both defaulting to { outcome: "none" } — an API error or
 * junk reply yields a NORMAL reply, never a wrongful silence. Multi-tenant: the
 * prompt is generic (no client keyword/persona/offer), so it screens for every bot.
 */
import { openaiChat } from "./openai";

const SCREEN_MODEL = process.env.CONFIRM_DETECT_MODEL || "gpt-4.1-mini";

/** disqualified = abusive OR a clear rejection; bot = detected automation/spam. */
export type ScreenOutcome = "none" | "disqualified" | "bot";
export interface ScreenResult {
  outcome: ScreenOutcome;
}

/**
 * Map the model's one-word reply to an outcome. Pure + defensive: any
 * malformed/junk input yields { outcome: "none" }. `abusive`/`not_interested`
 * map to `disqualified`; a whole-word `bot` maps to `bot`; everything else to
 * `none`. Order matters: a rejection outranks a bot mention.
 *
 * Whole-word matched and negation-aware so a hedged reply never inverts: the
 * model occasionally answers "not abusive" / "non-abusive" (meaning a NORMAL
 * lead), which a substring check would wrongly read as a disqualify. Because a
 * false `disqualified` is terminal + silences the bot, we bias hard toward
 * `none`. Unit-tested in scripts/test-screen-parse.ts.
 */
export function parseScreen(raw: string | null | undefined): ScreenResult {
  if (!raw) return { outcome: "none" };
  const s = raw.toLowerCase();
  if (/\bnot[_\s]interested\b/.test(s)) return { outcome: "disqualified" };
  // "abusive" -> disqualify, UNLESS negated ("not abusive", "non-abusive").
  if (/\babusive\b/.test(s) && !/\b(?:not|non-?)\s*abusive\b/.test(s)) {
    return { outcome: "disqualified" };
  }
  if (/\bbot\b/.test(s)) return { outcome: "bot" };
  return { outcome: "none" };
}

/**
 * Benign short replies that must NEVER disqualify — a deterministic floor under
 * the model. These are engaged/neutral one-liners a real lead sends mid-funnel:
 * answering the assistant's "any questions?" with "none"/"no"/"nothing", plain
 * affirmations, acknowledgements, and thanks. A terse "none" was being read by the
 * model as `not_interested` → a TERMINAL disqualify that silenced a good lead, so
 * this list short-circuits to `none` before the model is ever asked.
 *
 * IMPORTANT: every entry must be unmistakably non-hostile AND not a service
 * rejection — so short-circuiting it can never hide real abuse or a real "stop
 * messaging me". Rejection/abuse phrases ("stop", "unsubscribe", "not interested",
 * "leave me alone", "no thanks", profanity) are deliberately NOT here — they still
 * reach the model. Matched after normalization, so punctuation/emoji/case don't
 * matter ("None!", "i'm good 👍" → benign).
 */
const BENIGN_SHORT_REPLIES = new Set<string>([
  // no-more-questions / satisfied / done answering the assistant's question
  "none", "nope", "no", "nah", "naw", "nada", "nothing", "nothing else",
  "no more", "no more questions", "no questions", "thats it", "thats all",
  "im good", "all good", "we good", "were good", "good", "im fine", "fine",
  "all set", "im all set", "im all good",
  // satisfied combos (a lead often stacks a couple of benign words)
  "no im good", "nope im good", "no all good", "nope all good", "im good thanks",
  "all good thanks", "good thanks", "no more thanks", "no thats it", "thats it thanks",
  // affirmations / acknowledgements
  "yes", "yeah", "yep", "yup", "ya", "yah", "yes please", "sure",
  "ok", "okay", "k", "kk", "okie", "alright", "aight", "cool",
  "got it", "gotcha", "makes sense", "sounds good", "sounds great",
  "perfect", "great", "awesome", "nice", "bet", "word", "ok cool", "cool cool",
  "ok great", "ok perfect", "sounds perfect",
  // thanks
  "thanks", "thank you", "thankyou", "ty", "thx", "thank u", "tysm",
  "appreciate it", "appreciated", "much appreciated", "ok thanks", "okay thanks",
  "cool thanks", "great thanks", "thanks so much",
]);

/** Normalize a reply for benign matching: lowercase, drop apostrophes, strip
 *  punctuation/emoji to spaces, collapse whitespace. "i'm good 👍" -> "im good". */
export function normalizeShortReply(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/['’]/g, "") // i'm -> im (straight + curly apostrophe)
    .replace(/[^a-z0-9\s]/g, " ") // punctuation/emoji -> space
    .replace(/\s+/g, " ")
    .trim();
}

// A benign WORD carrying a hostile emoji ("no 🖕", "ok 🤡", "nope 🤬") is NOT benign —
// since normalizeShortReply strips emoji, catch these before the fast-path so they
// still reach the model (which judges the hostility). ONLY emoji that unambiguously
// insult/mock the READER belong here: 🖕 middle finger, 🤬 cursing-at, 🤡 clown/mockery.
// Ambiguous negative-emotion emoji (😒 🤦 😡 🤮 👎 💩) are intentionally NOT here — for a
// venting lead they usually target their OWN situation, and the screen is deliberately
// biased toward NOT disqualifying (a false disqualify is terminal). Friendly emoji
// (🙏👍😊) are fine and stripped.
const HOSTILE_EMOJI = /[\u{1F595}\u{1F92C}\u{1F921}]/u; // 🖕 🤬 🤡

/**
 * True when the message is an unmistakably benign short reply (see
 * BENIGN_SHORT_REPLIES) that must never trigger a disqualify. Pure + unit-tested.
 *
 * Burst-aware: a debounced turn is several messages joined with "\n"
 * (combineBurstText). The whole turn counts as benign ONLY when EVERY non-empty
 * segment is individually benign — so a burst that mixes in any non-benign line
 * ("you're dumb\nnone") still reaches the model, which sees the full text.
 */
export function isBenignShortReply(message: string | null | undefined): boolean {
  if (message && HOSTILE_EMOJI.test(message)) return false; // hostile emoji → let the model judge
  // Split the burst BEFORE normalizing (normalize would fuse "\n" into a space and
  // turn two benign lines into one non-member string).
  const parts = String(message ?? "")
    .split("\n")
    .map(normalizeShortReply)
    .filter((s) => s.length > 0);
  if (parts.length === 0) return false;
  return parts.every((p) => BENIGN_SHORT_REPLIES.has(p));
}

export async function screenDisqualify(opts: {
  message: string;
  lastBotMessage: string;
}): Promise<ScreenResult> {
  const text = (opts.message ?? "").trim();
  if (!text) return { outcome: "none" };
  // Deterministic floor: an obviously benign one-liner (answering "any questions?"
  // with "none", a plain "yes"/"ok"/"thanks") is engagement — never disqualify it,
  // and skip the model call entirely. Guards against a terminal false-positive.
  if (isBenignShortReply(text)) return { outcome: "none" };
  try {
    const { text: out } = await openaiChat({
      model: SCREEN_MODEL,
      system:
        "You screen a DM lead's LATEST message and decide whether the automated " +
        "assistant should STOP replying to this person entirely. Read the lead's reply IN CONTEXT of what the assistant just asked. Answer with ONE word:\n" +
        "- abusive        = the person is HOSTILE TOWARD the assistant/company or is mocking/trolling the bot with NO genuine interest: direct insults ('you're useless', 'dumb bot', 'stupid AI', 'f*** you'), telling the assistant off, slurs, or harassment. Requires hostility aimed AT the assistant — not merely strong language.\n" +
        "- not_interested = the person EXPLICITLY rejects the SERVICE or tells you to stop messaging them ('not interested', 'stop messaging me', 'unsubscribe', 'remove me', 'leave me alone', 'don't want it'). This is a rejection of the OFFER — NOT a lead who simply has no more questions, gives a short/one-word answer, or shows mild hesitation or price pushback.\n" +
        "- bot            = the sender is itself an automated bot or spam: nonsensical, repetitive, link-spam, canned automation, or non-sequitur replies that don't track the conversation.\n" +
        "- none           = anything else. A real person with ANY genuine interest, questions, negotiation, venting, or frustration — EVEN with heavy profanity — who still wants help is 'none'.\n" +
        "CRITICAL: A lead ANSWERING the assistant's question is engagement, not rejection. When the assistant asked something like 'any other questions?' or 'what questions do you have?', a reply of 'none' / 'no' / 'nope' / 'nothing' / 'no more questions' / 'I'm good' / 'all set' means they are SATISFIED and ready — that is 'none', the OPPOSITE of not_interested. A short 'no' answering a yes/no question is likewise just an answer → none.\n" +
        "Swearing is NOT abusive by itself. Profanity used to vent or describe their OWN situation ('this s*** is stressing me out', 'a lot of old s*** to deal with', 'my situation is f***ed') is a normal frustrated lead → none. Only count cursing as abusive when it is aimed AT the assistant as an insult.\n" +
        "Be very conservative — answer 'abusive' or 'not_interested' ONLY when it is UNMISTAKABLE; when in doubt, none. Reply with ONLY the one word.",
      messages: [
        {
          role: "user",
          content: `Assistant said: ${opts.lastBotMessage}\n\nLead replied: ${text}\n\nOne word:`,
        },
      ],
      maxTokens: 6,
      timeoutMs: 8_000,
    });
    return parseScreen(out);
  } catch {
    return { outcome: "none" };
  }
}
