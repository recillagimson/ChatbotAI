"use client";

import { useMemo } from "react";
import { diffWords, hasChanges } from "@/lib/text-diff";

/**
 * GitHub-style change highlight for a text edit: one block showing the new text
 * with removed words struck through in red and added words highlighted in green.
 * Used in the change-request before/after so a non-technical client can see
 * exactly what changed at a glance.
 */
export function DiffView({
  before,
  after,
  label,
}: {
  before: string;
  after: string;
  label: string;
}) {
  const ops = useMemo(() => diffWords(before ?? "", after ?? ""), [before, after]);
  const changed = hasChanges(ops);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} — what changed
        </p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-200" aria-hidden="true" />
            removed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-200" aria-hidden="true" />
            added
          </span>
        </div>
      </div>

      <div className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border px-3 py-2 text-xs leading-relaxed">
        {!before?.trim() && (
          <span className="mb-1 block text-[11px] font-medium text-green-700">
            New — this is all new content.
          </span>
        )}
        {ops.map((op, i) =>
          op.type === "equal" ? (
            <span key={i}>{op.value}</span>
          ) : op.type === "add" ? (
            <ins
              key={i}
              className="rounded-sm bg-green-100 text-green-900 no-underline"
            >
              {op.value}
            </ins>
          ) : (
            <del key={i} className="rounded-sm bg-red-100 text-red-900 line-through">
              {op.value}
            </del>
          )
        )}
      </div>

      {!changed && (
        <p className="mt-1 text-[11px] text-muted-foreground">No text changes.</p>
      )}
    </div>
  );
}
