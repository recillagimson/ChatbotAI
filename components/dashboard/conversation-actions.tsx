"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Pause, Play, CheckCircle2, RotateCcw, Send, RefreshCw, Voicemail } from "lucide-react";
import {
  CONVERSATION_TAGS,
  TAG_LABEL,
  type ConversationTag,
} from "@/lib/conversation-tags";

export function ConversationActions({
  conversationId,
  currentStatus,
  currentTag,
  currentStartOn = null,
  userMutedAt = null,
  isAdmin = false,
}: {
  conversationId: string;
  currentStatus: string;
  currentTag: ConversationTag;
  currentStartOn?: string | null;
  userMutedAt?: string | null;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic: flip the control the instant it's clicked, before the server
  // round-trip. Revert if the update fails.
  const [paused, setPaused] = useState(currentStatus === "ai_paused");
  const [tag, setTag] = useState<ConversationTag>(currentTag);
  // Start date for a "starting_later" thread (YYYY-MM-DD, from the date input).
  const [startOn, setStartOn] = useState(currentStartOn ?? "");
  // The lead self-muted the AI ("stopmessage"). Owner escape hatch to re-enable
  // auto replies without waiting for the lead to text "resumemessage".
  const [muted, setMuted] = useState(!!userMutedAt);

  // ADMIN-ONLY test button result (e.g. "Follow-up sent."). Null = idle/hidden.
  const [testResult, setTestResult] = useState<string | null>(null);
  // ADMIN-ONLY reset button result. Null = idle/hidden.
  const [resetResult, setResetResult] = useState<string | null>(null);
  // ADMIN-ONLY "send welcome" button result. Null = idle/hidden.
  const [welcomeResult, setWelcomeResult] = useState<string | null>(null);

  // subscribed ⇔ confirmed_at set: the tag and the conversion state move together.
  const confirmed = tag === "subscribed";

  // Best-effort: mirror the new stop-follow-up state to ManyChat (server-only key,
  // so we POST to a thin route). Fire-and-forget — a failure never affects the UI.
  function fireFollowupFlagSync() {
    fetch(`/api/conversations/${conversationId}/followup-flag`, { method: "POST" }).catch(() => {});
  }

  // ADMIN-ONLY: fire the conversation's NEXT follow-up step right now (bypassing the
  // silence-delay + tag gates) to test the real ManyChat flow/media delivery. The
  // endpoint (requireSuperadmin) is the real gate; this button only shows for admins.
  function sendTestFollowup() {
    setTestResult(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/test-followup`,
          { method: "POST" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          sent?: boolean;
          reason?: string;
        };
        if (res.ok && data.ok && data.sent) {
          setTestResult("Follow-up sent.");
          router.refresh();
        } else if (res.ok && data.ok) {
          setTestResult("Skipped — lead is muted/paused or the step has nothing to send.");
        } else if (data.reason === "no_steps") {
          setTestResult("No follow-up steps configured.");
        } else if (data.reason === "no_subscriber") {
          setTestResult("No ManyChat subscriber on this conversation.");
        } else {
          setTestResult("Couldn't send — check the ManyChat connection.");
        }
      } catch {
        setTestResult("Couldn't send — network error.");
      }
    });
  }

  // ADMIN-ONLY: fire this conversation's Welcome VM flow right now, bypassing the
  // shouldSendWelcome gate (welcomed_at / opener / keyword-gate), to test the real
  // ManyChat welcome delivery — the same flow the webhook triggers on a first-contact
  // greeting. The endpoint (requireSuperadmin) is the real gate; this button only shows
  // for admins. Re-clickable; the server records the send + one-time-stamps welcomed_at.
  function sendWelcome() {
    // Fires a real DM to a real contact via ManyChat — confirm so a misclick (e.g. while
    // pausing AI on an already-welcomed live thread) can't push a surprise welcome VM.
    if (
      !window.confirm(
        "Send the welcome message now? This fires the welcome VM/video flow to this " +
          "contact via ManyChat right away."
      )
    ) {
      return;
    }
    setWelcomeResult(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/send-welcome`,
          { method: "POST" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          sent?: boolean;
          reason?: string;
        };
        if (res.ok && data.ok && data.sent) {
          setWelcomeResult("Welcome message sent.");
          router.refresh();
        } else if (res.status === 403) {
          setWelcomeResult("Not allowed.");
        } else if (data.reason === "no_welcome_flow") {
          setWelcomeResult("No welcome flow configured on this chatbot.");
        } else if (data.reason === "no_subscriber") {
          setWelcomeResult("No ManyChat subscriber on this conversation.");
        } else if (data.reason === "manychat_key_unavailable") {
          setWelcomeResult("ManyChat key unavailable — check the connection.");
        } else {
          setWelcomeResult("Couldn't send — check the ManyChat connection.");
        }
      } catch {
        setWelcomeResult("Couldn't send — network error.");
      }
    });
  }

  // ADMIN-ONLY: wipe this conversation back to brand-new state — deletes the whole
  // transcript and clears welcomed_at / keyword_fired / tag / mute / follow-up progress
  // so the full funnel (welcome VM, keyword triggers, follow-ups) can be re-tested. Same
  // reset the RESET_KEYWORD webhook word runs. Destructive + irreversible → confirm
  // first. The endpoint (requireSuperadmin) is the real gate; this button only shows for
  // admins. Fires the follow-up-flag sync after, since the thread is now a fresh lead.
  function resetConversation() {
    if (
      !window.confirm(
        "Reset this conversation? This permanently deletes the entire transcript and " +
          "returns the thread to brand-new state so the welcome, keyword triggers, and " +
          "follow-ups can fire again. This can't be undone."
      )
    ) {
      return;
    }
    setResetResult(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/reset`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && data.ok) {
          setResetResult("Conversation reset — send the opener to test the welcome.");
          fireFollowupFlagSync();
          router.refresh();
        } else if (res.status === 403) {
          setResetResult("Not allowed.");
        } else {
          setResetResult("Couldn't reset — try again.");
        }
      } catch {
        setResetResult("Couldn't reset — network error.");
      }
    });
  }

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
      fireFollowupFlagSync();
      router.refresh();
    });
  }

  // Change the inbox tag. "subscribed" is coupled to confirmed_at (stops the drip
  // and silences the bot); leaving "subscribed" reopens the thread. Leaving
  // "starting_later" clears the start date (which un-pauses the drip).
  function changeTag(next: ConversationTag) {
    if (next === tag) return;
    const prev = tag;
    setTag(next);
    startTransition(async () => {
      const supabase = createClient();
      const patch: Record<string, unknown> = { tag: next };
      if (next === "subscribed") {
        patch.confirmed_at = new Date().toISOString();
        patch.confirmed_by = "manual";
      } else if (prev === "subscribed") {
        patch.confirmed_at = null; // reopen
        patch.confirmed_by = null;
      }
      if (prev === "starting_later" && next !== "starting_later") {
        patch.start_on = null;
        patch.start_note = null;
        setStartOn("");
      }
      const { error } = await supabase.from("conversations").update(patch).eq("id", conversationId);
      if (error) {
        setTag(prev); // revert on failure
        return;
      }
      fireFollowupFlagSync();
      router.refresh();
    });
  }

  // Set/edit the start date on a "starting_later" thread. start_note is a friendly
  // rendering used by the badge and the AI's SCHEDULED START memory.
  function setStart(value: string) {
    setStartOn(value);
    startTransition(async () => {
      const supabase = createClient();
      const note = value
        ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : null;
      const { error } = await supabase
        .from("conversations")
        .update({ start_on: value || null, start_note: note })
        .eq("id", conversationId);
      if (!error) router.refresh();
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
      fireFollowupFlagSync();
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
      {tag === "starting_later" && (
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Start</span>
          <input
            type="date"
            value={startOn}
            disabled={isPending}
            onChange={(e) => setStart(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
      )}
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
      {isAdmin && (
        <>
          <Button
            onClick={sendWelcome}
            disabled={isPending}
            variant="secondary"
            size="sm"
          >
            <Voicemail className="h-4 w-4 mr-2" /> Send welcome message
          </Button>
          {welcomeResult && (
            <span className="text-xs text-muted-foreground">{welcomeResult}</span>
          )}
          <Button
            onClick={sendTestFollowup}
            disabled={isPending}
            variant="secondary"
            size="sm"
          >
            <Send className="h-4 w-4 mr-2" /> Send follow-up now
          </Button>
          {testResult && (
            <span className="text-xs text-muted-foreground">{testResult}</span>
          )}
          <Button
            onClick={resetConversation}
            disabled={isPending}
            variant="destructive"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Reset conversation
          </Button>
          {resetResult && (
            <span className="text-xs text-muted-foreground">{resetResult}</span>
          )}
        </>
      )}
    </div>
  );
}
