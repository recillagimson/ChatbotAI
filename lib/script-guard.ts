// lib/script-guard.ts
// Catch a generated message that slips into a writing system the conversation never used
// (live: an English AI follow-up ended "i can resend the link هنا"). Pure + unit-tested.
// Latin covers English, Spanish and every accented Latin language, so only a genuinely
// different script trips it; emoji, digits and punctuation belong to no script here.

const SCRIPTS: RegExp[] = [
  /\p{Script=Arabic}/u,
  /\p{Script=Hebrew}/u,
  /\p{Script=Cyrillic}/u,
  /\p{Script=Greek}/u,
  /\p{Script=Devanagari}/u,
  /\p{Script=Thai}/u,
  /\p{Script=Han}/u,
  /\p{Script=Hiragana}/u,
  /\p{Script=Katakana}/u,
  /\p{Script=Hangul}/u,
];

/**
 * True when `reply` contains a script that appears in none of `context` (the
 * conversation's own messages). Fail-open: empty or missing input is never a leak.
 */
export function foreignScriptLeak(reply: string, context: (string | null | undefined)[]): boolean {
  if (typeof reply !== "string" || !reply) return false;
  const seen = (Array.isArray(context) ? context : [])
    .filter((t): t is string => typeof t === "string")
    .join("\n");
  if (!seen) return false;
  return SCRIPTS.some((re) => re.test(reply) && !re.test(seen));
}
