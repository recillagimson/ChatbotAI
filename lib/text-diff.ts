// lib/text-diff.ts
// Tiny, dependency-free text diff for the change-request before/after view.
// Produces a flat list of {equal|add|remove} runs so the UI can render a
// GitHub-style highlight (removed words red + struck, added words green).
//
// Word-level by default (clearest for prose/list edits like adding one keyword);
// falls back to line-level for very large inputs so the O(n*m) table stays bounded.
// Pure + deterministic (no I/O) → unit-testable.

export type DiffOp = { type: "equal" | "add" | "remove"; value: string };

// Above this many DP cells (~2800×2800 tokens) we diff by lines instead of words
// to keep the table small. Real prompt sections are well under this at word level.
const MAX_CELLS = 8_000_000;

/** Split into alternating word / whitespace runs (whitespace, incl. newlines, kept). */
function tokenizeWords(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? [];
}

/** Split into lines, each keeping its trailing newline so a join reconstructs the text. */
function tokenizeLines(s: string): string[] {
  return s.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Append a run, coalescing with the previous one when the type matches. */
function pushOp(ops: DiffOp[], type: DiffOp["type"], value: string): void {
  if (!value) return;
  const last = ops[ops.length - 1];
  if (last && last.type === type) last.value += value;
  else ops.push({ type, value });
}

/**
 * LCS diff over a token array. dp[i][j] = length of the longest common
 * subsequence of a[i:] and b[j:]; we then walk forward so ops come out in order.
 */
function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pushOp(ops, "equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushOp(ops, "remove", a[i]);
      i++;
    } else {
      pushOp(ops, "add", b[j]);
      j++;
    }
  }
  while (i < n) pushOp(ops, "remove", a[i++]);
  while (j < m) pushOp(ops, "add", b[j++]);
  return ops;
}

/**
 * Diff `before` → `after`. Invariants (relied on by tests + the UI):
 *  - concatenating equal+remove runs reproduces `before`
 *  - concatenating equal+add runs reproduces `after`
 */
export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenizeWords(before);
  const b = tokenizeWords(after);
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) {
    // Too big for a word-level table — diff by lines (far fewer tokens).
    return lcsDiff(tokenizeLines(before), tokenizeLines(after));
  }
  return lcsDiff(a, b);
}

/** True if the diff contains any added or removed text. */
export function hasChanges(ops: DiffOp[]): boolean {
  return ops.some((o) => o.type !== "equal");
}
