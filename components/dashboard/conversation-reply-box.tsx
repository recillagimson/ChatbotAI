"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

const MAX_LEN = 1000;

/**
 * Manual reply composer for a conversation. Only active while the AI is paused
 * (human takeover) — otherwise it shows a hint pointing to the pause button.
 * Posts to /api/conversations/[id]/reply, which pushes the message to Instagram
 * via ManyChat and records it as a `human_agent` message.
 */
export function ConversationReplyBox({
  conversationId,
  paused,
}: {
  conversationId: string;
  paused: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!paused) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Pause the AI above to take over and reply to this person on Instagram
        yourself.
      </p>
    );
  }

  function send() {
    const message = text.trim();
    if (!message || isPending) return;
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

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        maxLength={MAX_LEN}
        placeholder="Reply as a human... (sent to Instagram via ManyChat)"
        disabled={isPending}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          You&apos;re replying manually. The AI stays paused until you resume it.
        </span>
        <Button onClick={send} disabled={isPending || !text.trim()} size="sm">
          <Send className="h-4 w-4 mr-2" />
          {isPending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
