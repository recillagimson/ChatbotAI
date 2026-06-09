// lib/sanitize.ts
// Deterministic outbound-text cleanup applied to every reply before it is
// delivered to the user. The model (and a few hardcoded canned replies) like
// to emit em/en dashes; a system-prompt instruction reduces but never fully
// eliminates them, so we strip them here as a guaranteed backstop.
// Pure + side-effect free so it's trivially unit-testable.

// em dash (—), en dash (–), figure dash (‒), horizontal bar (―), minus sign (−)
const DASHES = /[‒–—―−]/;

/**
 * Replace Unicode dashes with plain ASCII so no reply ever ships an em dash.
 *  - A dash between two digits becomes a hyphen, keeping ranges readable
 *    ("12–18" -> "12-18", "600—700" -> "600-700").
 *  - Any other dash (clause separator) becomes a comma + space
 *    ("welcome — happy" -> "welcome, happy", "that—give" -> "that, give").
 * Normal hyphens ("no-brainer") are left untouched.
 */
export function sanitizeReply(text: string): string {
  if (!text) return text;
  return text
    .replace(/(\d)\s*[‒–—―−]\s*(\d)/g, "$1-$2")
    .replace(/\s*[‒–—―−]\s*/g, ", ")
    .replace(/ {2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();
}

/** True if the text still contains any Unicode dash (for tests / assertions). */
export function hasUnicodeDash(text: string): boolean {
  return DASHES.test(text);
}
