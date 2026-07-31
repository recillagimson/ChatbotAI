"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Send, Sparkles } from "lucide-react";
import { SsButton } from "@/components/ss/controls";

const MAX_LEN = 1000;

/**
 * Manual reply composer for a conversation. Shown whenever the AI is silent on
 * the thread (paused, subscribed, bot-off, disqualified, or the lead muted) - i.e.
 * exactly when the bot won't answer on its own, so a manual/AI-assisted reply
 * can't collide with an automated one.
 *
 * "Draft AI reply" asks the server (POST /suggest-reply) for an on-brand draft
 * (the same engine the live bot uses) and drops it into the box to edit. "Send"
 * posts to /reply, which pushes the message to the contact via ManyChat and
 * records it as a `human_agent` message. Drafting delivers nothing - only Send does.
 */
export function ConversationReplyBox({
  conversationId,
  botSilent,
}: {
  conversationId: string;
  botSilent: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [drafting, setDrafting] = useState(false);

  if (!botSilent) {
    return (
      <div className="flex-none border-t border-ss-line bg-white px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5 rounded-chip border border-ss-line bg-ss-page px-3.5 py-3">
          <Lock className="h-4 w-4 shrink-0 text-ss-muted" aria-hidden="true" />
          <p className="text-[12.5px] leading-snug text-ss-body">
            The AI is handling this thread. Pause it above to take over and reply
            yourself - that way your message and an automated one can never
            arrive at the same time.
          </p>
        </div>
      </div>
    );
  }

  function send() {
    const message = text.trim();
    if (!message || isPending || drafting) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(data?.error ?? "Couldn't send. Please try again.");
          return;
        }
        setText("");
        router.refresh();
      } catch {
        setError("Couldn't send. Please check your connection and try again.");
      }
    });
  }

  // Ask the server for an on-brand AI draft and drop it into the box (editable).
  // Sends nothing - the owner reviews and clicks Send. Re-clickable to re-draft.
  function draftAiReply() {
    if (drafting || isPending) return;
    setError(null);
    setDrafting(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/suggest-reply`,
          { method: "POST" }
        );
        const data = (await res.json().catch(() => null)) as {
          draft?: string;
          error?: string;
        } | null;
        if (!res.ok || !data?.draft) {
          setError(data?.error ?? "Couldn't draft a reply. Please try again.");
          return;
        }
        setText(data.draft.slice(0, MAX_LEN));
      } catch {
        setError("Couldn't draft a reply. Please check your connection and try again.");
      } finally {
        setDrafting(false);
      }
    })();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const busy = isPending || drafting;

  return (
    <div className="flex-none border-t border-ss-line bg-white px-5 py-4 sm:px-6">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        maxLength={MAX_LEN}
        placeholder="Reply as a human - the AI stays paused on this thread until you resume it…"
        disabled={busy}
        aria-label="Your reply"
        className="w-full resize-none rounded-[13px] border border-ss-line bg-ss-page-alt px-[15px] py-3 text-[13px] leading-relaxed text-ss-ink outline-none transition-colors placeholder:text-ss-faint focus:border-ss-indigo-200 focus:bg-white focus:ring-2 focus:ring-ss-indigo/15 disabled:opacity-60"
      />

      {error && (
        <p role="alert" className="mt-2 text-[12px] font-medium text-ss-rose-ink">
          {error}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[11.5px] leading-none text-ss-muted">
          Enter to send · Shift+Enter for a new line
        </span>
        <div className="ml-auto flex items-center gap-2">
          <SsButton
            onClick={draftAiReply}
            disabled={busy}
            variant="soft"
            size="md"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {drafting ? "Drafting…" : "Draft AI reply"}
          </SsButton>
          <SsButton
            onClick={send}
            disabled={busy || !text.trim()}
            variant="primary"
            size="md"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Sending…" : "Send"}
          </SsButton>
        </div>
      </div>
    </div>
  );
}
