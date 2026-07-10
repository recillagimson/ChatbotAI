"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Pause, Play, CheckCircle2, RotateCcw } from "lucide-react";
import {
  CONVERSATION_TAGS,
  TAG_LABEL,
  type ConversationTag,
} from "@/lib/conversation-tags";

export function ConversationActions({
  conversationId,
  currentStatus,
  currentTag,
  userMutedAt = null,
}: {
  conversationId: string;
  currentStatus: string;
  currentTag: ConversationTag;
  userMutedAt?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic: flip the control the instant it's clicked, before the server
  // round-trip. Revert if the update fails.
  const [paused, setPaused] = useState(currentStatus === "ai_paused");
  const [tag, setTag] = useState<ConversationTag>(currentTag);
  // The lead self-muted the AI ("stopmessage"). Owner escape hatch to re-enable
  // auto replies without waiting for the lead to text "resumemessage".
  const [muted, setMuted] = useState(!!userMutedAt);

  // subscribed ⇔ confirmed_at set: the tag and the conversion state move together.
  const confirmed = tag === "subscribed";

  function toggle() {
    const next = !paused;
    setPaused(next);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ status: next ? "ai_paused" : "active" })
        .eq("id", conversationId);
      if (error) {
        setPaused(!next); // revert on failure
        return;
      }
      router.refresh();
    });
  }

  // Change the inbox tag. "subscribed" is coupled to confirmed_at (stops the drip
  // and silences the bot); leaving "subscribed" reopens the thread. Everything
  // else is a plain tag write.
  function changeTag(next: ConversationTag) {
    if (next === tag) return;
    const prev = tag;
    setTag(next);
    startTransition(async () => {
      const supabase = createClient();
      const patch =
        next === "subscribed"
          ? { tag: next, confirmed_at: new Date().toISOString(), confirmed_by: "manual" }
          : prev === "subscribed"
            ? { tag: next, confirmed_at: null, confirmed_by: null } // reopen
            : { tag: next };
      const { error } = await supabase.from("conversations").update(patch).eq("id", conversationId);
      if (error) {
        setTag(prev); // revert on failure
        return;
      }
      router.refresh();
    });
  }

  // Clear a lead's self-mute (re-enable auto AI replies). Owner-only escape hatch.
  function unmute() {
    setMuted(false);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        // Also clear any stale debounce claim (mirrors the resume branch in the
        // webhook) so the next inbound isn't skipped by the trivial-ack guard.
        .update({ user_muted_at: null, reply_claimed_for: null })
        .eq("id", conversationId);
      if (error) {
        setMuted(true); // revert on failure
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Tag</span>
        <select
          value={tag}
          disabled={isPending}
          onChange={(e) => changeTag(e.target.value as ConversationTag)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {CONVERSATION_TAGS.map((t) => (
            <option key={t} value={t}>
              {TAG_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      {muted && (
        <Button onClick={unmute} disabled={isPending} variant="outline" size="sm">
          <Play className="h-4 w-4 mr-2" /> Un-mute (re-enable AI)
        </Button>
      )}
      <Button onClick={toggle} disabled={isPending} variant="outline" size="sm">
        {paused ? (
          <>
            <Play className="h-4 w-4 mr-2" /> Resume AI replies
          </>
        ) : (
          <>
            <Pause className="h-4 w-4 mr-2" /> Pause AI (take over)
          </>
        )}
      </Button>
      <Button
        onClick={() => changeTag(confirmed ? "lead" : "subscribed")}
        disabled={isPending}
        variant={confirmed ? "outline" : "default"}
        size="sm"
      >
        {confirmed ? (
          <>
            <RotateCcw className="h-4 w-4 mr-2" /> Reopen (resume messages)
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Mark subscribed
          </>
        )}
      </Button>
    </div>
  );
}
