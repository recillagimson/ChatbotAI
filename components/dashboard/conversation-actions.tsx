"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SsButton, SsStatus } from "@/components/ss/controls";
import { Pause, Play, CheckCircle2, RotateCcw, Send, RefreshCw, Voicemail, Radio } from "lucide-react";
import {
  CONVERSATION_TAGS,
  TAG_LABEL,
  type ConversationTag,
} from "@/lib/conversation-tags";
import {
  CONVERSATION_QUALITY,
  QUALITY_LABEL,
  type QualityTag,
} from "@/lib/conversation-quality";

/**
 * The thread's control surface - identity row plus the tag / quality / action
 * row beneath it.
 *
 * Both rows live in one component because they share optimistic state: pausing
 * the AI has to flip the header's "AI ACTIVE" badge in the same tick as the
 * button, and marking a lead subscribed has to move the tag select. Splitting
 * them would mean lifting all of that into the server page and losing the
 * instant feedback.
 *
 * `identity` is the contact block the page renders (avatar, name, channel) -
 * passed in so the server can own the display data while this owns the state.
 */
export function ConversationActions({
  conversationId,
  currentStatus,
  currentTag,
  currentQuality = null,
  currentStartOn = null,
  userMutedAt = null,
  isAdmin = false,
  identity,
  meta,
}: {
  conversationId: string;
  currentStatus: string;
  currentTag: ConversationTag;
  currentQuality?: QualityTag | null;
  currentStartOn?: string | null;
  userMutedAt?: string | null;
  isAdmin?: boolean;
  identity?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic: flip the control the instant it's clicked, before the server
  // round-trip. Revert if the update fails.
  const [paused, setPaused] = useState(currentStatus === "ai_paused");
  const [tag, setTag] = useState<ConversationTag>(currentTag);
  // Owner-set quality rating (good/bad), orthogonal to the funnel tag. "" = unrated.
  const [quality, setQuality] = useState<QualityTag | "">(currentQuality ?? "");
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
  // ADMIN-ONLY "test delivery" probe result (ManyChat's actual verdict). Null = idle.
  const [deliveryResult, setDeliveryResult] = useState<string | null>(null);

  // subscribed ⇔ confirmed_at set: the tag and the conversion state move together.
  const confirmed = tag === "subscribed";

  // Best-effort: mirror the new stop-follow-up state to ManyChat (server-only key,
  // so we POST to a thin route). Fire-and-forget - a failure never affects the UI.
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
          setTestResult("Skipped - lead is muted/paused or the step has nothing to send.");
        } else if (data.reason === "no_steps") {
          setTestResult("No follow-up steps configured.");
        } else if (data.reason === "no_subscriber") {
          setTestResult("No ManyChat subscriber on this conversation.");
        } else {
          setTestResult("Couldn't send - check the ManyChat connection.");
        }
      } catch {
        setTestResult("Couldn't send - network error.");
      }
    });
  }

  // ADMIN-ONLY: fire this conversation's Welcome VM flow right now, bypassing the
  // shouldSendWelcome gate (welcomed_at / opener / keyword-gate), to test the real
  // ManyChat welcome delivery - the same flow the webhook triggers on a first-contact
  // greeting. The endpoint (requireSuperadmin) is the real gate; this button only shows
  // for admins. Re-clickable; the server records the send + one-time-stamps welcomed_at.
  function sendWelcome() {
    // Fires a real DM to a real contact via ManyChat - confirm so a misclick (e.g. while
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
          setWelcomeResult("ManyChat key unavailable - check the connection.");
        } else {
          setWelcomeResult("Couldn't send - check the ManyChat connection.");
        }
      } catch {
        setWelcomeResult("Couldn't send - network error.");
      }
    });
  }

  // ADMIN-ONLY: wipe this conversation back to brand-new state - deletes the whole
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
          setResetResult("Conversation reset - send the opener to test the welcome.");
          fireFollowupFlagSync();
          router.refresh();
        } else if (res.status === 403) {
          setResetResult("Not allowed.");
        } else {
          setResetResult("Couldn't reset - try again.");
        }
      } catch {
        setResetResult("Couldn't reset - network error.");
      }
    });
  }

  // ADMIN-ONLY: push a real test DM to this contact via ManyChat and surface
  // ManyChat's actual verdict (accepted vs. refused-with-reason), so delivery can
  // be checked per contact instead of guessing from the ManyChat test panel.
  function testDelivery() {
    if (
      !window.confirm(
        "Send a real test DM to this contact via ManyChat? Use this to check whether " +
          "replies are actually being delivered - it will show ManyChat's exact response."
      )
    ) {
      return;
    }
    setDeliveryResult(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/test-delivery`,
          { method: "POST" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          note?: string;
          error?: string;
        };
        if (res.status === 403) {
          setDeliveryResult("Not allowed.");
        } else if (data.ok) {
          setDeliveryResult(data.note ?? "ManyChat accepted the send.");
        } else {
          setDeliveryResult(`Not delivered - ManyChat said: ${data.error ?? "unknown error"}`);
        }
      } catch {
        setDeliveryResult("Couldn't run the test - network error.");
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

  // Change the quality rating (good/bad/unrated). Orthogonal to the funnel tag and
  // to follow-up gating - a plain owner label, so no confirmed_at / flag sync.
  function changeQuality(next: QualityTag | "") {
    if (next === quality) return;
    const prev = quality;
    setQuality(next);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ quality_tag: next || null })
        .eq("id", conversationId);
      if (error) {
        setQuality(prev); // revert on failure
        return;
      }
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

  const notes = [welcomeResult, testResult, deliveryResult, resetResult].filter(
    Boolean
  ) as string[];

  return (
    <div className="flex-none border-b border-ss-line bg-white px-5 py-4 sm:px-6">
      {/* ---- Identity + the one primary action ------------------------- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {identity}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SsStatus tone={paused ? "amber" : muted ? "rose" : "green"}>
            {paused ? "AI paused" : muted ? "Muted by lead" : "AI active"}
          </SsStatus>
          <SsButton
            onClick={toggle}
            disabled={isPending}
            variant={paused ? "primary" : "navy"}
            size="md"
          >
            {paused ? (
              <>
                <Play className="h-4 w-4" aria-hidden="true" /> Resume AI
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" aria-hidden="true" /> Pause AI &amp;
                take over
              </>
            )}
          </SsButton>
        </div>
      </div>

      {meta ? <div className="mt-1.5">{meta}</div> : null}

      {/* ---- Tag · quality · the rest ---------------------------------- */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Field label="Tag">
          <select
            value={tag}
            disabled={isPending}
            onChange={(e) => changeTag(e.target.value as ConversationTag)}
            aria-label="Conversation tag"
            className={SELECT}
          >
            {CONVERSATION_TAGS.map((t) => (
              <option key={t} value={t}>
                {TAG_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Quality">
          <select
            value={quality}
            disabled={isPending}
            onChange={(e) => changeQuality(e.target.value as QualityTag | "")}
            aria-label="Conversation quality"
            className={SELECT}
          >
            <option value="">Unrated</option>
            {CONVERSATION_QUALITY.map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABEL[q]}
              </option>
            ))}
          </select>
        </Field>

        {tag === "starting_later" && (
          <Field label="Start">
            <input
              type="date"
              value={startOn}
              disabled={isPending}
              onChange={(e) => setStart(e.target.value)}
              aria-label="Date this lead wants to start"
              className={SELECT}
            />
          </Field>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {muted && (
            <SsButton onClick={unmute} disabled={isPending} variant="outline" size="sm">
              <Play className="h-[15px] w-[15px]" aria-hidden="true" /> Un-mute
            </SsButton>
          )}
          <SsButton
            onClick={() => changeTag(confirmed ? "lead" : "subscribed")}
            disabled={isPending}
            variant={confirmed ? "outline" : "soft"}
            size="sm"
          >
            {confirmed ? (
              <>
                <RotateCcw className="h-[15px] w-[15px]" aria-hidden="true" /> Reopen
              </>
            ) : (
              <>
                <CheckCircle2 className="h-[15px] w-[15px]" aria-hidden="true" /> Mark
                subscribed
              </>
            )}
          </SsButton>

          {isAdmin && (
            <>
              <SsButton onClick={sendWelcome} disabled={isPending} variant="outline" size="sm">
                <Voicemail className="h-[15px] w-[15px]" aria-hidden="true" /> Welcome
              </SsButton>
              <SsButton onClick={sendTestFollowup} disabled={isPending} variant="outline" size="sm">
                <Send className="h-[15px] w-[15px]" aria-hidden="true" /> Follow-up now
              </SsButton>
              <SsButton onClick={testDelivery} disabled={isPending} variant="outline" size="sm">
                <Radio className="h-[15px] w-[15px]" aria-hidden="true" /> Test delivery
              </SsButton>
              <SsButton
                onClick={resetConversation}
                disabled={isPending}
                variant="danger-outline"
                size="sm"
              >
                <RefreshCw className="h-[15px] w-[15px]" aria-hidden="true" /> Reset
              </SsButton>
            </>
          )}
        </div>
      </div>

      {notes.length > 0 && (
        <p role="status" className="mt-2.5 text-[11.5px] leading-snug text-ss-body">
          {notes.join(" · ")}
        </p>
      )}
    </div>
  );
}

const SELECT =
  "h-[34px] rounded-ctl border border-ss-line bg-white px-2.5 text-[12px] font-semibold leading-none text-ss-ink outline-none transition-colors focus:border-ss-indigo-200 focus:ring-2 focus:ring-ss-indigo/20 disabled:opacity-60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex items-center gap-2")}>
      <span className="ss-eyebrow tracking-[0.08em] text-ss-muted">{label}</span>
      {children}
    </label>
  );
}
