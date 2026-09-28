"use client";

import { useMemo } from "react";
import { diffWords } from "@/lib/text-diff";
import type { TextEdit } from "@/lib/types";

/**
 * A change request's targeted edits, one small before/after per change, instead
 * of a diff of the whole section. On a 100k-character section a whole-text diff
 * falls back to line level and a one-word change is easy to miss; here each
 * change is shown on its own and everything else is stated to stay as it is.
 */
export function EditsView({
  label,
  edits,
  append,
}: {
  label: string;
  edits?: TextEdit[];
  append?: string;
}) {
  const items = [
    ...(edits ?? []).map((e) => ({ before: e.find, after: e.replace, kind: "edit" as const })),
    ...(append?.trim() ? [{ before: "", after: append, kind: "append" as const }] : []),
  ];

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} - {items.length} {items.length === 1 ? "change" : "changes"}
        </p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-ss-rose/25" aria-hidden="true" />
            removed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-ss-green/25" aria-hidden="true" />
            added
          </span>
        </div>
      </div>
      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={i}>
            <EditItem
              before={it.before}
              after={it.after}
              caption={
                it.kind === "append"
                  ? "Added at the end"
                  : it.after.trim()
                    ? `Change ${i + 1}`
                    : `Change ${i + 1}: removed`
              }
            />
          </li>
        ))}
      </ol>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Everything else stays exactly as it is.</p>
    </div>
  );
}

function EditItem({ before, after, caption }: { before: string; after: string; caption: string }) {
  const ops = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border px-3 py-2 text-xs leading-relaxed">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{caption}</span>
      {ops.map((op, i) =>
        op.type === "equal" ? (
          <span key={i}>{op.value}</span>
        ) : op.type === "add" ? (
          <ins key={i} className="rounded-sm bg-ss-green/25 no-underline">
            {op.value}
          </ins>
        ) : (
          <del key={i} className="rounded-sm bg-ss-rose/25 line-through">
            {op.value}
          </del>
        )
      )}
    </div>
  );
}
