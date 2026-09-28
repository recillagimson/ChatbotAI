"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, PencilLine } from "lucide-react";
import { MAX_SCENARIO_CHARS, MAX_TRAINED_REPLY_CHARS } from "@/lib/training";

/**
 * "Correct this reply", under an AI reply in a real conversation: tell the bot
 * what it should have said, right where the mistake happened, in one step. The
 * situation is pre-filled with a short description of the lead's message (never
 * the raw DM) and the rejected reply is kept, so the bot also knows what not to
 * say. Saved straight to the bot's corrections; the Training tab lists them all.
 */
export function CorrectReplyButton({
  chatbotId,
  leadMessage,
  botReply,
}: {
  chatbotId: string;
  leadMessage: string;
  botReply: string;
}) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState("");
  const [reply, setReply] = useState("");
  const [exact, setExact] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function openPanel() {
    setOpen(true);
    setError(null);
    setSaved(false);
    if (scenario || !leadMessage.trim()) return;
    setSuggesting(true);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/training/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadMessage }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && typeof data?.scenario === "string" && data.scenario) {
        setScenario((s) => s || data.scenario);
      }
    } catch {
      // No suggestion: the owner writes the situation themselves.
    } finally {
      setSuggesting(false);
    }
  }

  async function save() {
    if (!scenario.trim() || !reply.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/training-pairs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: { scenario, reply, bad_reply: botReply, exact, enabled: true },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Could not save the correction.");
        return;
      }
      setSaved(true);
      setOpen(false);
      setReply("");
      setExact(false);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex max-w-[min(36rem,80%)] flex-col items-end gap-1 self-end">
        {saved && (
          <p role="status" className="text-[11px] leading-snug text-ss-green-ink">
            Saved. From its next reply, the bot answers this your way.{" "}
            <Link href={`/chatbots/${chatbotId}?tab=training`} className="font-semibold underline underline-offset-2">
              See all corrections
            </Link>
          </p>
        )}
        <button
          type="button"
          onClick={openPanel}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-ss-indigo-600 transition-colors hover:text-ss-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
        >
          <PencilLine className="h-3 w-3" aria-hidden="true" />
          {saved ? "Correct it again" : "Correct this reply"}
        </button>
      </div>
    );
  }

  const idBase = `correct-${chatbotId}-${botReply.length}-${leadMessage.length}`;
  return (
    <div className="w-full max-w-[min(36rem,80%)] self-end rounded-ctl-lg border border-ss-line bg-ss-surface p-3">
      <label htmlFor={`${idBase}-s`} className="block text-[11.5px] font-semibold text-ss-ink">
        When a lead says something like
      </label>
      <input
        id={`${idBase}-s`}
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
        maxLength={MAX_SCENARIO_CHARS}
        placeholder={suggesting ? "Describing their message..." : "e.g. Lead asks how much coaching costs"}
        className="mt-1 w-full rounded-ctl border border-ss-line bg-ss-page px-2.5 py-1.5 text-[12.5px] text-ss-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
      />
      <p className="mt-1 text-[10.5px] leading-snug text-ss-muted">
        Describe the situation, not one exact message, so the fix also covers leads who say it differently.
      </p>

      <label htmlFor={`${idBase}-r`} className="mt-3 block text-[11.5px] font-semibold text-ss-ink">
        The bot should reply
      </label>
      <textarea
        id={`${idBase}-r`}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        maxLength={MAX_TRAINED_REPLY_CHARS}
        rows={3}
        placeholder="What it should have said"
        className="mt-1 w-full resize-y rounded-ctl border border-ss-line bg-ss-page px-2.5 py-1.5 text-[12.5px] text-ss-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo"
      />

      <label className="mt-2 flex items-center gap-2 text-[11.5px] text-ss-body">
        <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} />
        Say it word for word (otherwise it keeps your facts in its own voice)
      </label>

      {error && (
        <p role="alert" className="mt-2 text-[11.5px] text-ss-rose-ink">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="rounded-ctl px-2.5 py-1.5 text-[12px] font-semibold text-ss-body hover:text-ss-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !scenario.trim() || !reply.trim()}
          className="inline-flex items-center gap-1.5 rounded-ctl bg-ss-indigo px-3 py-1.5 text-[12px] font-semibold text-ss-on-accent disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {saving ? "Saving..." : "Save correction"}
        </button>
      </div>
    </div>
  );
}
