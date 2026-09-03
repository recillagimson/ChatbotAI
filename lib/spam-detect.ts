/**
 * Deterministic promotional / referral SPAM detection - a backstop UNDER the
 * AI disqualify screen (lib/conversation-screen.ts screenDisqualify).
 *
 * Why this exists: spam detection was 100% AI-guesswork. A real incident - a
 * Temu "Accept my invitation to win free items 🎁 https://temu.com/s/..." DM
 * arriving AFTER the bot had already replied - got a normal reply, because that
 * mainstream-shopping referral blast is not the crypto / casino "claim your
 * bonus" archetype the screener's prompt enumerates, so the one-word classifier
 * answered `none` (or `bot`, which is then downgraded to `none` for an engaged
 * lead at route.ts step 7b). The AI screen has no deterministic floor to catch it.
 *
 * This module is that floor. A confident hit (a promo/referral phrase OR a known
 * referral-blast host) forces the webhook's `spam` verdict, which decideDisqualify
 * silences IMMEDIATELY (tag `bot`) and which is exempt from the engaged-lead `bot`
 * downgrade - so a scam blast is silenced even mid-conversation. It also lets the
 * webhook skip the model call on obvious spam.
 *
 * Pure + synchronous - no I/O, fail-open (any error -> not spam -> the AI screen
 * still runs, so this can never wrongly silence a lead by throwing). Multi-tenant:
 * the lists MUST stay promo/referral-generic (gotcha #12: never add a client
 * keyword/persona/offer). A wrongful silence is TERMINAL, so every entry must have
 * ~zero benign use in a real lead's DM - the same list-hygiene bar as the
 * extraction shield (lib/extraction-detect.ts). Covered by tests/spam-detect.spec.ts.
 */
import { normalize, containsWord } from "./keyword-triggers";

export interface SpamResult {
  isSpam: boolean;
  patterns: string[]; // which signals matched (telemetry/debugging): phrases + `host:<h>`
}

/**
 * Hosts that, appearing in a DM, are essentially always a third-party referral /
 * giveaway blast rather than a lead's own business. Suffix-matched (host === h OR
 * host endsWith "." + h) so subdomains and share paths can't dodge it. Keep this
 * TIGHT - only hosts that are near-always DM referral spam for a lead-gen bot; a
 * normal shopping site a lead might legitimately mention does NOT belong here.
 * This signal is language-agnostic, so it catches the Temu blast in any language.
 */
export const SPAM_HOSTS = [
  "temu.com",
  "temu.to",
];

/**
 * Promo / referral / giveaway blast phrases. A SINGLE hit = spam (like the
 * extraction shield's HARD tier), so every entry must be promo-anchored with
 * ~zero benign use in a real prospect's message. Bare business English that a
 * lead could plausibly type ("claim your free consultation", "gift card",
 * "referral code", "investment opportunity") is deliberately EXCLUDED - it lives
 * in a comment below, never in the list. Matched whole-word (containsWord) after
 * normalize + a detector-local diacritic fold, so the Spanish entries (written
 * WITHOUT accents) match accented text too. List hygiene: keep each entry
 * promo-anchored; no entry should be a needless duplicate of another.
 */
export const SPAM_PHRASES = [
  // referral / invite-to-win blasts (Temu / Shein / viral referral DMs)
  "accept my invitation",
  "accept my invite",
  "win free items",
  "free items together",
  "invite friends to earn",
  "invite friends and earn",
  "use my referral",
  "my referral link",
  "sign up with my link",
  "sign up using my link",
  "sign up through my link",
  "join with my link",
  // giveaway / prize scam
  "exclusive gift",
  "free gift card",
  "claim your prize",
  "claim your reward",
  "claim your gift",
  "claim your bonus",
  "you have won",
  "you won a",
  "congratulations you won",
  // crypto / forex / casino promo blasts (the clearest, promo-anchored ones -
  // the AI screener already covers the broader archetype; these add a floor)
  "guaranteed profit",
  "double your money",
  "double your investment",
  "trading signals",
  "forex signals",
  "crypto investment",
  "binary options",
  "investment platform",
  "casino bonus",
  "free spins",
  "sports betting",
  // Spanish parity (accent-free: the detector-local fold strips accents from the
  // text before matching, so "invitación" -> "invitacion" etc.)
  "acepta mi invitacion",
  "gana articulos gratis",
  "regalo gratis",
  "premio gratis",
  "reclama tu premio",
  "reclama tu regalo",
  "has ganado",
  "usa mi enlace",
  "registrate con mi enlace",
];
// DELIBERATELY NOT phrases (plausible in a real lead DM -> would be a terminal
// false silence): "claim your free ..." (a lead-magnet ask), bare "gift card",
// bare "referral code", "investment opportunity", "invite your friends", bare
// "free gift". These are left to the AI screener's judgment, not this floor.

/** Matches bare http(s) URLs (up to the next whitespace). */
const URL_RE = /https?:\/\/[^\s]+/gi;

function hostOf(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Referral-blast hosts present in the text (suffix-matched). */
export function spamHostsInText(text: string): string[] {
  const urls = (typeof text === "string" ? text : "").match(URL_RE) ?? [];
  const hits: string[] = [];
  for (const raw of urls) {
    const host = hostOf(raw);
    if (!host) continue;
    for (const h of SPAM_HOSTS) {
      if (host === h || host.endsWith("." + h)) {
        if (!hits.includes(h)) hits.push(h);
        break;
      }
    }
  }
  return hits;
}

/**
 * True when the message is a promo/referral SPAM blast. isSpam iff ANY spam
 * phrase OR ANY referral-blast host matches. Pure + fail-open: any error, or
 * empty/non-string input, returns { isSpam: false } so the AI screen still runs.
 */
export function detectSpam(text: string): SpamResult {
  try {
    if (typeof text !== "string" || !text.trim()) return { isSpam: false, patterns: [] };
    // normalize() lowercases/collapses; the local NFD fold strips accents so the
    // accent-free Spanish entries match accented text (detector-local, like the
    // extraction shield's smart-quote fold - the shared normalize() stays untouched).
    const n = normalize(text)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    const phraseHits = SPAM_PHRASES.filter((p) => containsWord(n, p));
    const hostHits = spamHostsInText(text);
    const patterns = [...phraseHits, ...hostHits.map((h) => `host:${h}`)];
    return { isSpam: patterns.length > 0, patterns };
  } catch {
    return { isSpam: false, patterns: [] };
  }
}
