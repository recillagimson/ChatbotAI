"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Chip/pill multi-input for keywords. Type a word (or short phrase) and press
 * Enter or comma to add it as a removable pill; Backspace on an empty field
 * removes the last pill; blur commits a pending draft. De-dupe is
 * case-insensitive (keyword matching is case-insensitive anyway). Controlled —
 * it owns no source of truth, just edits the `value` string array.
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

  function add(raw: string) {
    const k = raw.trim();
    if (!k) return;
    if (!value.some((v) => v.toLowerCase() === k.toLowerCase())) onChange([...value, k]);
    setDraft("");
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      removeAt(value.length - 1);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-[2.5rem] w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm",
        "ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      )}
    >
      {value.map((kw, i) => (
        <Badge key={`${kw}-${i}`} variant={variant} className="gap-1">
          {kw}
          <button
            type="button"
            aria-label={`Remove ${kw}`}
            onClick={() => removeAt(i)}
            className="ml-0.5 opacity-70 hover:opacity-100 focus:outline-none"
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
        onBlur={() => add(draft)}
        placeholder={value.length ? "" : placeholder}
        className="h-7 min-w-[6rem] flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
