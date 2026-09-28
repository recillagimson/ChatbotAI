// lib/section-edits.ts
// Targeted edits for Request Changes, applied by code instead of trusting the AI
// to reproduce a whole prompt section.
//
// Why: live prompt sections run to ~100k characters, well past what one AI reply
// can hold (the proposal budget is 8,000 output tokens, roughly 32k characters),
// so asking for "the complete revised section" came back cut off or silently
// shortened. The AI now names exact passages to replace (or text to append), and
// this module applies them to the section it was shown.
//
// Every applied proposal also carries a fingerprint of the section it was drafted
// against. At Apply / Publish time rebaseOnLive() compares that with the live
// text: unchanged -> write the drafted text; changed -> re-apply the same edits on
// top of the newer text, or stop, so one change can never silently undo another.
//
// Pure except sectionFingerprint (node:crypto). Server-side only.

import { createHash } from "node:crypto";
import type { TextEdit } from "./types";
// Largest section text we store or publish; defined with the other client-safe
// constants in lib/change-categories.ts and re-exported here for the server side.
import { MAX_SECTION_CHARS } from "./change-categories";

export type { TextEdit };
export { MAX_SECTION_CHARS };

/** A section this short (or empty) may be replaced whole instead of edited. */
export const FULL_REWRITE_MAX_CHARS = 4_000;

export type ApplyResult = { ok: true; text: string } | { ok: false; problems: string[] };

/** Straighten the characters a model tends to normalize when it copies text. */
function normChar(c: string): string {
  switch (c) {
    case "‘":
    case "’":
    case "‛":
    case "ʼ":
      return "'";
    case "“":
    case "”":
    case "„":
      return '"';
    case "‐":
    case "‑":
    case "‒":
    case "–":
    case "—":
    case "−":
      return "-";
    default:
      return c;
  }
}

/**
 * `text` with every whitespace run collapsed to one space and quotes/dashes
 * straightened, plus a map from each normalized character back to the span of
 * original text it came from - so a match found in the normalized text edits the
 * ORIGINAL characters.
 */
function normalizeWithMap(text: string): { norm: string; start: number[]; end: number[] } {
  let norm = "";
  const start: number[] = [];
  const end: number[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      let j = i;
      while (j < text.length && /\s/.test(text[j])) j++;
      norm += " ";
      start.push(i);
      end.push(j);
      i = j;
    } else {
      norm += normChar(text[i]);
      start.push(i);
      end.push(i + 1);
      i++;
    }
  }
  return { norm, start, end };
}

function normalizeNeedle(s: string): string {
  return normalizeWithMap(s.trim()).norm;
}

/** Every start index of `needle` in `hay` (overlapping occurrences included). */
function allIndexes(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i === -1) return out;
    out.push(i);
    from = i + 1;
  }
}

function quote(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return `"${t.length > 80 ? `${t.slice(0, 77)}...` : t}"`;
}

/**
 * Locate one edit's passage in `base`. Exact (as given) first, then tolerant of
 * whitespace, curly quotes and long dashes. Case always matters. The passage must
 * appear exactly once: guessing between two copies could edit the wrong one.
 */
function locate(
  base: string,
  normBase: ReturnType<typeof normalizeWithMap>,
  find: string
): { ok: true; from: number; to: number } | { ok: false; problem: string } {
  if (!find.trim()) return { ok: false, problem: "An edit has an empty passage to find." };

  const exact = allIndexes(base, find);
  if (exact.length === 1) return { ok: true, from: exact[0], to: exact[0] + find.length };
  if (exact.length > 1) {
    return {
      ok: false,
      problem: `The passage ${quote(find)} appears ${exact.length} times; include more of the surrounding words so it is unique.`,
    };
  }

  const needle = normalizeNeedle(find);
  const hits = allIndexes(normBase.norm, needle);
  if (hits.length === 1) {
    const s = hits[0];
    const e = s + needle.length - 1;
    return { ok: true, from: normBase.start[s], to: normBase.end[e] };
  }
  if (hits.length > 1) {
    return {
      ok: false,
      problem: `The passage ${quote(find)} appears ${hits.length} times; include more of the surrounding words so it is unique.`,
    };
  }
  return {
    ok: false,
    problem: `The passage ${quote(find)} was not found in the current text; copy it word for word.`,
  };
}

/**
 * Apply a proposal to `base`: targeted `edits` and/or an `append`, OR (only for an
 * empty or short section) a whole `replacement`. All passages are located in the
 * ORIGINAL text first, so the listed order never matters and two edits can't
 * interfere; overlapping edits are refused.
 */
export function applyTextEdits(
  base: string,
  ops: { edits?: TextEdit[]; append?: string; replacement?: string }
): ApplyResult {
  const edits = ops.edits ?? [];
  const append = ops.append?.trim() ?? "";
  const hasTargeted = edits.length > 0 || append.length > 0;

  if (ops.replacement !== undefined) {
    if (hasTargeted) {
      return { ok: false, problems: ["Send either a whole new section or targeted changes, not both."] };
    }
    const baseLen = base.trim().length;
    if (baseLen > FULL_REWRITE_MAX_CHARS) {
      return {
        ok: false,
        problems: [
          `This section is too long to replace whole (${baseLen.toLocaleString("en-US")} characters); propose targeted changes to the parts that need to change instead.`,
        ],
      };
    }
    const next = ops.replacement.trim();
    if (!next) return { ok: false, problems: ["The new section is empty."] };
    if (next === base) return { ok: false, problems: ["These changes leave the section exactly as it is."] };
    if (next.length > MAX_SECTION_CHARS) {
      return { ok: false, problems: [`The new section is over ${MAX_SECTION_CHARS.toLocaleString("en-US")} characters.`] };
    }
    return { ok: true, text: next };
  }

  if (!hasTargeted) return { ok: false, problems: ["No changes were proposed."] };

  const normBase = normalizeWithMap(base);
  const problems: string[] = [];
  const spans: { from: number; to: number; replace: string }[] = [];
  for (const edit of edits) {
    const hit = locate(base, normBase, edit.find);
    if (hit.ok) spans.push({ from: hit.from, to: hit.to, replace: edit.replace });
    else problems.push(hit.problem);
  }

  spans.sort((a, b) => a.from - b.from);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].from < spans[i - 1].to) {
      problems.push("Two of the changes overlap; merge them into one change.");
      break;
    }
  }
  if (problems.length) return { ok: false, problems };

  let text = base;
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i];
    text = text.slice(0, s.from) + s.replace + text.slice(s.to);
  }
  if (append) text = text.trim() ? `${text.trimEnd()}\n\n${append}` : append;

  if (text === base) return { ok: false, problems: ["These changes leave the section exactly as it is."] };
  if (text.length > MAX_SECTION_CHARS) {
    return { ok: false, problems: [`The result is over ${MAX_SECTION_CHARS.toLocaleString("en-US")} characters.`] };
  }
  return { ok: true, text };
}

/** Fingerprint of a section's exact text (sha256 hex). */
export function sectionFingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Decide what to write at Apply / Publish time, given the LIVE section text.
 *  - No fingerprint (a proposal saved before fingerprints existed): write as before.
 *  - Live text unchanged since drafting: write the drafted text.
 *  - Live text changed: re-apply the targeted edits on top of it, keeping the
 *    newer change; a whole-section rewrite, or an edit whose passage is gone,
 *    stops here instead of overwriting.
 */
export function rebaseOnLive(
  live: string,
  stored: { base_hash?: string; edits?: TextEdit[]; append?: string; text: string }
): { ok: true; text: string; rebased: boolean } | { ok: false; reason: string } {
  if (!stored.base_hash) return { ok: true, text: stored.text, rebased: false };
  // Already live (a retried publish, a double click): nothing left to apply.
  if (live === stored.text) return { ok: true, text: stored.text, rebased: false };
  if (sectionFingerprint(live) === stored.base_hash) {
    return { ok: true, text: stored.text, rebased: false };
  }
  if (!(stored.edits?.length || stored.append?.trim())) {
    return {
      ok: false,
      reason:
        "This section changed after the proposal was drafted, and a whole-section rewrite would undo that change. Draft it again from the current text.",
    };
  }
  const r = applyTextEdits(live, { edits: stored.edits, append: stored.append });
  if (!r.ok) {
    return {
      ok: false,
      reason: `This section changed after the proposal was drafted. ${r.problems.join(" ")}`,
    };
  }
  return { ok: true, text: r.text, rebased: true };
}
