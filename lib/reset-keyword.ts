import { normalize } from "./keyword-triggers";

/**
 * Universal, admin-set reset control word (the RESET_KEYWORD env var). WHOLE-MESSAGE
 * match only: the message must BE the keyword — after normalize (lowercase + collapsed
 * whitespace) and stripping surrounding punctuation/emoji — not merely contain it. So
 * "resetnow99" / "RESETNOW99!" / "🔄 resetnow99 🔄" reset, but "can you reset my score"
 * does NOT. A blank/undefined keyword means the feature is OFF -> always false. Pure +
 * synchronous. Mirrors detectUserControl in lib/user-controls.ts. Covered by
 * scripts/test-reset-keyword.ts.
 */
export function matchesResetKeyword(text: string, keyword: string | null | undefined): boolean {
  // Strip leading/trailing non-alphanumerics (punctuation, emoji, spaces) so "reset!"
  // and "🔄 reset 🔄" still match, but keep internal words intact so an embedded
  // occurrence inside a sentence does not.
  const strip = (s: string) =>
    normalize(typeof s === "string" ? s : "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const k = strip(typeof keyword === "string" ? keyword : "");
  if (!k) return false; // feature off (no keyword configured)
  const phrase = strip(text);
  if (!phrase) return false;
  return phrase === k;
}
