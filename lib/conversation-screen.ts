/**
 * Pre-reply "disqualify screen": a best-effort AI check on a DM lead's LATEST
 * message that decides whether the automated assistant should STOP replying to
 * this person entirely - because they are abusive, have clearly rejected the
 * service, or are themselves an automated bot. Runs BEFORE reply generation (see
 * the webhook pre-gate) so the offending message gets no reply at all.
 *
 * Fail-open by construction: parseScreen never throws and screenDisqualify
 * catches everything, both defaulting to { outcome: "none" } - an API error or
 * junk reply yields a NORMAL reply, never a wrongful silence. Multi-tenant: the
 * prompt is generic (no client keyword/persona/offer), so it screens for every bot.
 */
import { openaiChat } from "./openai";
import { MODELS } from "./model-tiers";

const SCREEN_MODEL = MODELS.classifier();

/** disqualified = abusive OR a clear rejection; bot = detected automation;
 *  spam = a promotional/scam ADVERTISEMENT blast (crypto/gambling/giveaway/promo
 *  push). `bot` and `spam` both persist as the `bot` conversation tag, but `spam`
 *  is NOT subject to the engaged-lead `bot` downgrade (a scam blast is spam even
 *  mid-conversation), so they are distinct screen verdicts. */
export type ScreenOutcome = "none" | "disqualified" | "bot" | "spam";
export interface ScreenResult {
  outcome: ScreenOutcome;
}

/**
 * Map the model's one-word reply to an outcome. Pure + defensive: any
 * malformed/junk input yields { outcome: "none" }. `spam` -> spam (promo/scam
 * advertisement); `abusive`/`not_interested` -> disqualified; whole-word `bot`
 * -> bot; everything else -> none. Order matters: a promo `spam` verdict is
 * checked first, then a rejection outranks a bare bot mention.
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
  if (/\bspam\b/.test(s)) return { outcome: "spam" };
  if (/\bnot[_\s]interested\b/.test(s)) return { outcome: "disqualified" };
  // "abusive" -> disqualify, UNLESS negated ("not abusive", "non-abusive").
  if (/\babusive\b/.test(s) && !/\b(?:not|non-?)\s*abusive\b/.test(s)) {
    return { outcome: "disqualified" };
  }
  if (/\bbot\b/.test(s)) return { outcome: "bot" };
  return { outcome: "none" };
}

/**
 * Benign short replies that must NEVER disqualify - a deterministic floor under
 * the model. These are engaged/neutral one-liners a real lead sends mid-funnel:
 * answering the assistant's "any questions?" with "none"/"no"/"nothing", plain
 * affirmations, acknowledgements, and thanks. A terse "none" was being read by the
 * model as `not_interested` → a TERMINAL disqualify that silenced a good lead, so
 * this list short-circuits to `none` before the model is ever asked.
 *
 * IMPORTANT: every entry must be unmistakably non-hostile AND not a service
 * rejection - so short-circuiting it can never hide real abuse or a real "stop
 * messaging me". Rejection/abuse phrases ("stop", "unsubscribe", "not interested",
 * "leave me alone", "no thanks", profanity) are deliberately NOT here - they still
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
  // safe English near-misses (soft defers / satisfied - NOT service rejections).
  // "no thanks" is still deliberately excluded (see note above) and reaches the model.
  "not right now", "not yet", "maybe later", "nothing right now", "nothing for now",
  "nothing at the moment", "no more for now", "im ok", "im okay", "no worries",
  // --- Spanish parity (matched AFTER diacritic folding, so entries carry no accents) ---
  // no-more-questions / satisfied
  "nada mas", "ninguna", "ninguno", "ninguna pregunta", "ninguna duda",
  "sin preguntas", "no tengo preguntas", "no tengo dudas", "todo bien", "todo claro",
  "todo perfecto", "esta bien", "estamos bien", "ya esta", "listo", "ok listo",
  // affirmations / acknowledgements
  "si", "sip", "claro", "claro que si", "dale", "vale", "bueno", "de acuerdo",
  "entendido", "entiendo", "correcto", "perfecto", "genial", "excelente", "buenisimo",
  "de una", "okey", "bien",
  // thanks (ES). "no gracias" (= "no thanks") is deliberately NOT here - it reaches the model.
  "gracias", "muchas gracias", "mil gracias", "ok gracias", "vale gracias",
  "gracias por la info",
]);

/** Normalize a reply for benign matching: lowercase, FOLD DIACRITICS (so the
 *  Spanish benigns match - "está" -> "esta", "más" -> "mas", "ñ" -> "n"), drop
 *  apostrophes, strip punctuation/emoji to spaces, collapse whitespace.
 *  "i'm good 👍" -> "im good", "Está bien!" -> "esta bien". The diacritic fold is
 *  load-bearing for bilingual matching: without it "[^a-z0-9\s]" turns an accented
 *  letter into a space and splits the word mid-token ("más" -> "ma s"), so an
 *  accented benign could never match and fell through to the model. */
export function normalizeShortReply(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD") // decompose accents into base letter + combining mark
    .replace(/[̀-ͯ]/g, "") // strip the combining marks: á->a, é->e, ñ->n
    .replace(/['’]/g, "") // i'm -> im (straight + curly apostrophe)
    .replace(/[^a-z0-9\s]/g, " ") // punctuation/emoji -> space
    .replace(/\s+/g, " ")
    .trim();
}

// A benign WORD carrying a hostile emoji ("no 🖕", "ok 🤡", "nope 🤬") is NOT benign -
// since normalizeShortReply strips emoji, catch these before the fast-path so they
// still reach the model (which judges the hostility). ONLY emoji that unambiguously
// insult/mock the READER belong here: 🖕 middle finger, 🤬 cursing-at, 🤡 clown/mockery.
// Ambiguous negative-emotion emoji (😒 🤦 😡 🤮 👎 💩) are intentionally NOT here - for a
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
 * segment is individually benign - so a burst that mixes in any non-benign line
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
  // with "none", a plain "yes"/"ok"/"thanks") is engagement - never disqualify it,
  // and skip the model call entirely. Guards against a terminal false-positive.
  if (isBenignShortReply(text)) return { outcome: "none" };
  try {
    const { text: out } = await openaiChat({
      model: SCREEN_MODEL,
      system:
        "You screen a DM lead's LATEST message and decide whether the automated " +
        "assistant should STOP replying to this person entirely. Read the lead's reply IN CONTEXT of what the assistant just asked. Answer with ONE word:\n" +
        "- abusive        = the person is HOSTILE TOWARD the assistant/company or is mocking/trolling the bot with NO genuine interest: direct insults ('you're useless', 'dumb bot', 'stupid AI', 'f*** you'), telling the assistant off, slurs, or harassment. Requires hostility aimed AT the assistant - not merely strong language.\n" +
        "- not_interested = the person EXPLICITLY rejects the SERVICE or tells you to stop messaging them ('not interested', 'stop messaging me', 'unsubscribe', 'remove me', 'leave me alone', 'don't want it'). This is a rejection of the OFFER - NOT a lead who simply has no more questions, gives a short/one-word answer, or shows mild hesitation or price pushback. CRUCIAL: 'not interested in [a specific OUTCOME] while wanting a DIFFERENT service you offer' is the lead CHOOSING their goal, not a rejection → none. E.g. 'not interested in getting credit, just clean up my file', 'don't want funding, just repair', 'not looking to build credit, just remove the negatives' - they still want help → none. Only 'not_interested' when they reject working with you ENTIRELY or tell you to stop.\n" +
        "- bot            = the sender is itself an automated bot: word-salad/gibberish or canned non-sequiturs that do NOT track the conversation. A real person is NOT a bot just because they paste a link (e.g. sharing their OWN website or company site) or re-send the same message after getting no reply - a relevant URL or a repeat ALONE is never 'bot'. For a promotional/scam ADVERTISEMENT, use 'spam' (below), not 'bot'.\n" +
        "- spam           = the message ADVERTISES or PROMOTES a third-party money-making offer unrelated to what you help with: a crypto / forex / gambling / casino / betting platform, a giveaway or 'claim your $X free / bonus', a promo or referral code, a fake celebrity or brand endorsement, or 'proof' screenshots of winnings/withdrawals meant to push people to sign up. This is a promotional SCAM BLAST - answer 'spam' even mid-conversation and even from someone you have already replied to. Do NOT confuse this with a lead sharing their OWN website/business in a relevant chat, or their OWN financial/credit situation - that is engagement → none.\n" +
        "- none           = anything else. A real person with ANY genuine interest, questions, negotiation, venting, or frustration - EVEN with heavy profanity, EVEN if they paste a relevant link or re-send the same message, EVEN if they show you their own money/credit screenshots about THEIR situation - who still wants help is 'none'.\n" +
        "CRITICAL: A lead ANSWERING the assistant's question is engagement, not rejection. When the assistant asked something like 'any other questions?' or 'what questions do you have?', a reply of 'none' / 'no' / 'nope' / 'nothing' / 'no more questions' / 'I'm good' / 'all set' means they are SATISFIED and ready - that is 'none', the OPPOSITE of not_interested. A short 'no' answering a yes/no question is likewise just an answer → none.\n" +
        "Swearing is NOT abusive by itself. Profanity used to vent or describe their OWN situation ('this s*** is stressing me out', 'a lot of old s*** to deal with', 'my situation is f***ed') is a normal frustrated lead → none. Only count cursing as abusive when it is aimed AT the assistant as an insult.\n" +
        "Describing their OWN situation or PAST attempts is ENGAGEMENT, not rejection. A lead who says they tried before and it did not work ('I've tried before', 'no success', 'nothing worked', 'I did it myself and failed', 'been struggling with this') is giving you CONTEXT and still wants help → none. NEVER read 'not_interested' from a lead reporting their own past failure, difficulty, or frustration - not_interested requires rejecting the OFFER or telling you to stop.\n" +
        "The lead may write in Spanish or English (or mix them) - apply all of these rules identically to both languages.\n" +
        "Be conservative on 'bot' the same way: sharing a website or their credentials, or repeating a message after being ignored, are NORMAL human behaviors - a coherent, on-topic message from a real prospect is 'none', never 'bot'.\n" +
        "Be very conservative - answer 'abusive', 'not_interested', 'bot', or 'spam' ONLY when it is UNMISTAKABLE; when in doubt, none. Reply with ONLY the one word.",
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

/**
 * What the webhook should DO with a screen outcome, given the two-strike backstop.
 * - none    : nothing to persist.
 * - clear   : the lead re-engaged after an earlier lone strike - reset the counter.
 * - soft    : an ENGAGED lead's FIRST `disqualified` signal - record the strike but
 *             do NOT tag and do NOT stand down (keep replying). `strikes` is the new count.
 * - silence : write the terminal tag and stand down (subject to keep_replies_when_tagged).
 */
export type DisqualifyAction =
  | { kind: "none" }
  | { kind: "clear" }
  | { kind: "soft"; strikes: number }
  | { kind: "silence"; tag: "disqualified" | "bot" };

/**
 * Two-strike backstop for the TERMINAL `disqualified` verdict. A false disqualify
 * silences a good lead forever, and the one-word screen model can misfire on an
 * ENGAGED lead who is merely venting or describing a past failure ("I've tried
 * before, no success"). So for a lead the assistant has already replied to, the
 * FIRST `disqualified` signal is a soft strike (no tag, keep replying); only a
 * SECOND consecutive signal silences. A non-disqualify turn clears the strike
 * (they must be consecutive). First-contact abuse/rejection (no prior assistant
 * reply → not engaged) and every `bot` verdict still disqualify immediately.
 *
 * `strikes` is conversations.disqualify_strikes, or null/undefined when that column
 * is absent (pre-migration): with no counter there is NO soft path and behaviour is
 * identical to before (immediate silence), so the webhook is safe to deploy before
 * the migration lands. Pure + unit-tested.
 */
export function decideDisqualify(input: {
  outcome: ScreenOutcome;
  engaged: boolean;
  strikes: number | null | undefined;
}): DisqualifyAction {
  const { outcome, engaged } = input;
  const strikes = typeof input.strikes === "number" ? input.strikes : null;
  if (outcome === "none") {
    return strikes !== null && strikes > 0 ? { kind: "clear" } : { kind: "none" };
  }
  // `bot` (automation) and `spam` (promo/scam blast) both silence immediately and
  // persist the `bot` tag. Neither gets the disqualified two-strike grace: a scam
  // blast is unmistakable, and the engaged-lead `bot` downgrade already ran upstream.
  if (outcome === "bot" || outcome === "spam") return { kind: "silence", tag: "bot" };
  // outcome === "disqualified": soft-strike an engaged lead's FIRST signal, but only
  // when the counter is available (post-migration); otherwise silence as before.
  if (engaged && strikes !== null && strikes < 1) {
    return { kind: "soft", strikes: strikes + 1 };
  }
  return { kind: "silence", tag: "disqualified" };
}
