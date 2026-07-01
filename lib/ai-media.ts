/**
 * AI-triggered media directives.
 *
 * When a chatbot has `ai_media_enabled`, the reply model is told about its
 * follow-up asset library and may emit a directive naming an asset to send —
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

export function parseAssetDirectives(text: string | null | undefined): ParsedAssetDirectives {
  if (!text) return { cleanText: "", assetKeys: [] };

  const keys: string[] = [];
  DIRECTIVE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIRECTIVE_RE.exec(text)) !== null) {
    const key = m[1].toLowerCase();
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
