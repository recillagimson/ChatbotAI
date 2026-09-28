// lib/kb-health.ts
// What the Knowledge section tells an owner about their bot's knowledge: how big
// it is, whether every reply reads all of it or searches it, and what needs a
// look. Pure - the caller fetches the rows and passes the flags.
//
// Size and mode come from the SAME functions the reply path uses
// (assembledSize + decideMode in lib/retrieval.ts), so the page can never
// describe a mode the bot is not actually in. An entry COUNT is deliberately not
// a health signal: in production every bot carries one uploaded document.

import { assembledSize, decideMode } from "./retrieval";
import { KB_CHAR_BUDGET } from "./kb-config";

export interface KbHealthEntry {
  title: string;
  content: string;
  indexed: boolean;
  needs_review: boolean;
}

export interface KbHealth {
  entries: number;
  /** Size of the assembled knowledge block (titles and separators included). */
  chars: number;
  /** chars / 4, the usual English rule of thumb. For display only. */
  approxTokens: number;
  indexed: number;
  unindexed: number;
  /** Uploads whose text extraction looked thin (likely a scanned PDF). */
  needsReview: number;
  /** "full" = every reply reads all of it; "search" = each reply pulls the
   *  closest passages; "none" = there is nothing to read. */
  mode: "none" | "full" | "search";
  /** Full mode over the per-reply budget, so part of it may never reach the bot. */
  overBudget: boolean;
}

export function kbHealth(input: {
  entries: KbHealthEntry[];
  embeddingsEnabled: boolean;
  retrievalActive: boolean;
  forceRetrieval: boolean;
}): KbHealth {
  const { entries } = input;
  const chars = assembledSize(entries);
  const unindexed = entries.filter((e) => !e.indexed).length;
  const mode: KbHealth["mode"] =
    entries.length === 0
      ? "none"
      : decideMode({
            size: chars,
            hasUnindexed: unindexed > 0,
            embeddingsEnabled: input.embeddingsEnabled,
            currentlyActive: input.retrievalActive,
            forceRetrieval: input.forceRetrieval,
          }) === "retrieval"
        ? "search"
        : "full";

  return {
    entries: entries.length,
    chars,
    approxTokens: Math.round(chars / 4),
    indexed: entries.length - unindexed,
    unindexed,
    needsReview: entries.filter((e) => e.needs_review).length,
    mode,
    overBudget: mode === "full" && chars > KB_CHAR_BUDGET,
  };
}
