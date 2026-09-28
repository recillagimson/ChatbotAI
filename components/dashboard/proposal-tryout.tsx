"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { SectionColumn } from "@/lib/types";

/**
 * "Try it before it goes live": send a test message as a lead and see how the bot
 * would answer WITH a proposed change. Runs the same sandbox reply as the Training
 * tab (POST /api/chatbots/[id]/preview) with the proposed section texts swapped
 * in; nothing is saved and nothing reaches a real contact.
 */
export function ProposalTryout({
  chatbotId,
  overrides,
}: {
  chatbotId: string;
  overrides: Partial<Record<SectionColumn, string>>;
}) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text, history: [], sectionsOverride: overrides }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "The test reply didn't come through. Try again.");
        return;
      }
      setReply(typeof data?.text === "string" ? data.text : "");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Try it before it goes live
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Send a test message as a lead. The reply uses this change; nothing is saved or sent to anyone.
      </p>
      <form onSubmit={run} className="mt-2 flex flex-wrap gap-2">
        <label htmlFor={`tryout-${chatbotId}`} className="sr-only">
          Test message
        </label>
        <input
          id={`tryout-${chatbotId}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          placeholder="e.g. How much is it?"
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={busy || !message.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {busy ? "Asking..." : "Try it"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {reply !== null && (
        <div aria-live="polite" className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-sm">
          {reply || "(the bot sent an empty reply)"}
        </div>
      )}
    </div>
  );
}
