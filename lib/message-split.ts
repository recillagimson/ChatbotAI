// lib/message-split.ts
// Split a single AI reply into multiple short DM "bubbles" for delivery.
// The persona produces short bursts separated by line breaks; ManyChat's
// `content.messages` array renders each element as its own Instagram message.
// Pure + deterministic (no I/O) so it's trivially unit-testable.

/**
 * Max separate bubbles per reply. Beyond this, the overflow tail is merged into
 * the last bubble — keeps the reply intact while avoiding spam-flagging on IG.
 * Env-overridable (`MAX_BUBBLES`) so the owner can cap reply length — e.g. lower it
 * so every bubble of a paced 15–30s trickle fits a tighter function budget — without
 * a code change. Falls back to 6 when unset/invalid; a value < 1 is floored to 1.
 */
export const MAX_BUBBLES = (() => {
  const n = Number(process.env.MAX_BUBBLES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 6;
})();

/**
 * Hard cap per bubble. Instagram silently drops a DM over ~1000 chars, so any
 * longer segment is sub-split before sending.
 */
export const MAX_BUBBLE_CHARS = 900;

/**
 * Split an over-length segment at the last sentence/space boundary before the
 * cap, falling back to a hard slice. Always makes progress (no infinite loop).
 */
function splitLongSegment(seg: string): string[] {
  const out: string[] = [];
  let rest = seg;
  while (rest.length > MAX_BUBBLE_CHARS) {
    const window = rest.slice(0, MAX_BUBBLE_CHARS);
    // Prefer a sentence end, then a newline, then a space, then a hard cut.
    let cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("\n")
    );
    if (cut > 0) cut += 1; // keep the boundary char with the first piece
    else cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = MAX_BUBBLE_CHARS; // no boundary at all -> hard slice
    const piece = rest.slice(0, cut).trim();
    if (piece) out.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Split a reply string into ordered DM bubbles.
 *  - Blank lines separate bubbles when present (preserves intentional 2-line
 *    bubbles); otherwise each non-empty line becomes its own bubble.
 *  - Over-length segments are sub-split; the total is capped at MAX_BUBBLES with
 *    any overflow merged into the final bubble.
 * Returns [] for empty / whitespace-only input.
 */
export function splitIntoMessages(text: string): string[] {
  const clean = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const hasBlankLine = /\n[ \t]*\n/.test(clean);
  const rawSegments = hasBlankLine
    ? clean.split(/\n[ \t]*\n+/)
    : clean.split(/\n+/);

  let bubbles: string[] = [];
  for (const seg of rawSegments) {
    const s = seg.trim();
    if (!s) continue;
    if (s.length > MAX_BUBBLE_CHARS) bubbles.push(...splitLongSegment(s));
    else bubbles.push(s);
  }

  if (bubbles.length === 0) return [];

  // Cap bubble count: merge the overflow tail into the last kept bubble so the
  // full reply is preserved while the number of sent messages stays bounded.
  if (bubbles.length > MAX_BUBBLES) {
    const head = bubbles.slice(0, MAX_BUBBLES - 1);
    const tail = bubbles.slice(MAX_BUBBLES - 1).join("\n\n");
    bubbles = [...head, tail];
  }

  return bubbles;
}
