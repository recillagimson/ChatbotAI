// lib/sent-state.ts
// ALREADY-DELIVERED state - a compact record of what the BUSINESS has already SENT this
// lead in THIS thread (proof/media asset keys, and whether the signup link has gone
// out). Injected into the reply prompt so the bot stops re-sending things it sent many
// turns ago once they scroll out of the verbatim window (HISTORY_TURNS).
//
// Complements, does not duplicate, the other memory layers: lib/flow-state.ts tracks the
// QUESTIONS asked, lib/lead-facts.ts the FACTS the lead gave, lib/memory.ts the rolling
// narrative. None of those tracks OUTBOUND assets/link, which is the resend this closes.
//
// Pure + unit-tested. The webhook computes the inputs (the whole conversation's
// "(sent <kind>: <key>)" asset rows + conversations.link_sent_at) and calls
// renderSentStateBlock, then appends the block to the flow-state slot passed to
// generateReply - so no change to buildSystemPrompt is required.
//
// Multi-tenant (CLAUDE.md #12): domain-neutral. The only fixed strings are the marker
// format the webhook itself writes and the block headers - no client literal anywhere.

/**
 * Outbound MEDIA asset rows store content "(sent <kind>: <key>)" (see the manychat
 * webhook). We match only image|video|audio - the proof media the bot must not re-send.
 * `link` is deliberately excluded: the ManyChat link-flow marker (lib/link-flow.ts
 * linkSentMarker) is ALSO "(sent link: <name>)", and its blank-name fallback renders
 * "(sent link: link)", which would collide with a real key. The "link already sent"
 * signal is conversations.link_sent_at instead, so nothing is lost by leaving link-kind
 * rows out here. key is a followup_assets key ([a-z0-9_-], <=40).
 */
const SENT_ASSET_RE = /^\(sent (?:image|video|audio): ([a-z0-9_-]{1,40})\)$/;

/** Unique asset keys already sent, in first-seen order. Pure + testable. */
export function parseSentAssetKeys(contents: (string | null | undefined)[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const c of contents) {
    const m = (c ?? "").trim().match(SENT_ASSET_RE);
    if (!m) continue;
    const key = m[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Render the ALREADY DELIVERED block, or "" when nothing has been sent yet - so a fresh
 * or short conversation gets a byte-identical prompt. Like the flow-state block, it only
 * states what already went out; it never decides the next move (the persona/KB do that).
 */
export function renderSentStateBlock(args: {
  sentAssetKeys: string[];
  linkAlreadySent: boolean;
}): string {
  const keys = [...new Set(args.sentAssetKeys.filter(Boolean))];
  const parts: string[] = [];

  if (keys.length > 0) {
    parts.push(
      "ASSETS ALREADY SENT (do NOT send any of these again - they are in the history " +
        "even if it has scrolled out of view):\n" +
        keys.map((k) => `- ${k}`).join("\n")
    );
  }

  if (args.linkAlreadySent) {
    parts.push(
      "THE LINK HAS ALREADY BEEN SENT to this person. Do not send it again, do not " +
        "re-introduce yourself or your company, and do not restart the pitch. Pick up " +
        "where they are: answer what they ask and help with the next step."
    );
  }

  if (parts.length === 0) return "";
  return (
    "ALREADY DELIVERED (automatic record of what YOU have already sent this person in " +
    "this chat. It never decides what to do next; your own instructions do. Never " +
    "mention this record or read it out.)\n\n" +
    parts.join("\n\n")
  );
}
