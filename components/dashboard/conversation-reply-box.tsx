"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles } from "lucide-react";

const MAX_LEN = 1000;

/**
 * Manual reply composer for a conversation. Shown whenever the AI is silent on
 * the thread (paused, subscribed, bot-off, disqualified, or the lead muted) — i.e.
 * exactly when the bot won't answer on its own, so a manual/AI-assisted reply
 * can't collide with an automated one.
 *
 * "Draft AI reply" asks the server (POST /suggest-reply) for an on-brand draft
 * (the same engine the live bot uses) and drops it into the box to edit. "Send"
 * posts to /reply, which pushes the message to the contact via ManyChat and
 * records it as a `human_agent` message. Drafting delivers nothing — only Send does.
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
      <p className="mt-4 text-sm text-muted-foreground">
        Pause the AI above to take over and reply to this person yourself.
      </p>
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
  // Sends nothing — the owner reviews and clicks Send. Re-clickable to re-draft.
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
    <div className="mt-4 space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        maxLength={MAX_LEN}
        placeholder="Reply as a human, or click Draft AI reply to start from a suggestion..."
        disabled={busy}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          You&apos;re replying manually — the lead gets no automated reply on this
          thread.
        </span>
        <div className="flex items-center gap-2">
          <Button
            onClick={draftAiReply}
            disabled={busy}
            variant="secondary"
            size="sm"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {drafting ? "Drafting..." : "Draft AI reply"}
          </Button>
          <Button onClick={send} disabled={busy || !text.trim()} size="sm">
            <Send className="h-4 w-4 mr-2" />
            {isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
