/**
 * AI-triggered media directives.
 *
 * When a chatbot has `ai_media_enabled`, the reply model is told about its
 * follow-up asset library and may emit a directive naming an asset to send -
 * e.g. `[[SEND_ASSET: results_video]]` on its own line. This module parses those
 * directives out of the reply text and returns the cleaned text + the ordered,
 * de-duplicated asset keys. The webhook then resolves each key to a FollowupAsset
 * and sends it channel-aware. Pure + unit-tested (no I/O).
 */

// Matches [[SEND_ASSET: key]] with flexible whitespace. Keys are handles:
// letters, digits, underscore, hyphen.
const DIRECTIVE_RE = /\[\[\s*SEND_ASSET\s*:\s*([a-zA-Z0-9_-]+)\s*\]\]/gi;

export interface ParsedAssetDirectives {
  /** Reply text with all directives removed and whitespace tidied. */
  cleanText: string;
  /** Asset keys to send, lower-cased, in first-seen order, de-duplicated. */
  assetKeys: string[];
}

/** One `[[SEND_ASSET: key]]` directive with its character span in the original text. */
export interface AssetDirectiveMatch {
  /** Index of the `[[` in the original text. */
  start: number;
  /** Index just past the closing `]]`. */
  end: number;
  /** The asset key, lower-cased. */
  key: string;
}

/**
 * Every `[[SEND_ASSET: key]]` directive in `text`, in order, with character positions
 * and lower-cased keys. Positions let the caller interleave media at its authored spot
 * in the reply (same coordinate space as link-flow tokens) instead of appending it as a
 * trailing batch. Not de-duplicated - the caller decides dedup/cap. Pure.
 */
export function findAssetDirectives(text: string | null | undefined): AssetDirectiveMatch[] {
  if (!text) return [];
  const out: AssetDirectiveMatch[] = [];
  DIRECTIVE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIRECTIVE_RE.exec(text)) !== null) {
    if (m[0].length === 0) { DIRECTIVE_RE.lastIndex++; continue; } // defensive: never spin
    // Extend the span over trailing spaces/tabs and one newline - the same `[ \t]*\n?` a
    // link-flow token consumes - so a directive on its own line leaves no blank line behind.
    let end = m.index + m[0].length;
    while (end < text.length && (text[end] === " " || text[end] === "\t")) end++;
    if (text[end] === "\n") end++;
    out.push({ start: m.index, end, key: m[1].toLowerCase() });
  }
  return out;
}

export function parseAssetDirectives(text: string | null | undefined): ParsedAssetDirectives {
  if (!text) return { cleanText: "", assetKeys: [] };

  const keys: string[] = [];
  for (const { key } of findAssetDirectives(text)) {
    if (!keys.includes(key)) keys.push(key);
  }

  const cleanText = text
    .replace(DIRECTIVE_RE, "")
    .replace(/[ \t]{2,}/g, " ")   // collapse runs of spaces left by removal
    .replace(/[ \t]+\n/g, "\n")   // trailing spaces before newlines
    .replace(/\n{3,}/g, "\n\n")   // no more than one blank line
    .trim();

  return { cleanText, assetKeys: keys };
}
