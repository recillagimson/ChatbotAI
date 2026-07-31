"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Split raw text into individual keywords on commas and newlines (phrases keep their spaces). */
export function splitKeywordTerms(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Chip/pill multi-input for keywords. Type a word (or short phrase) and press
 * Enter or comma to add it as a removable pill; PASTE a comma/newline separated
 * list to add them all at once; Backspace on an empty field removes the last pill;
 * blur commits a pending draft. De-dupe is case-insensitive (keyword matching is
 * case-insensitive anyway). A long list scrolls inside a fixed max height instead
 * of ballooning the page. Controlled - it just edits the `value` string array.
 */
export function KeywordInput({
  value,
  onChange,
  placeholder,
  id,
  variant = "secondary",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
  variant?: "secondary" | "outline";
}) {
  const [draft, setDraft] = React.useState("");

  function addTerms(raw: string) {
    const terms = splitKeywordTerms(raw);
    if (!terms.length) {
      setDraft("");
      return;
    }
    const next = [...value];
    for (const t of terms) {
      if (!next.some((v) => v.toLowerCase() === t.toLowerCase())) next.push(t);
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTerms(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      removeAt(value.length - 1);
    }
  }
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    // Only intercept a multi-term paste; a plain single token flows into the field.
    if (text && /[,\n]/.test(text)) {
      e.preventDefault();
      addTerms(draft ? `${draft},${text}` : text);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-[2.5rem] max-h-48 w-full flex-wrap content-start items-center gap-1.5 overflow-y-auto rounded-md border border-input bg-background px-2 py-1.5 text-sm",
        "ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      )}
    >
      {value.map((kw, i) => (
        <Badge key={`${kw}-${i}`} variant={variant} className="max-w-full gap-1">
          <span className="truncate">{kw}</span>
          <button
            type="button"
            aria-label={`Remove ${kw}`}
            onClick={() => removeAt(i)}
            className="ml-0.5 shrink-0 opacity-70 hover:opacity-100 focus:outline-none"
          >
            ×
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => addTerms(draft)}
        placeholder={value.length ? "" : placeholder}
        className="h-7 min-w-[6rem] flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
