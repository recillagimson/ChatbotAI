"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  StepsEditor,
  toEditable,
  stepsToFollowupSteps,
  type EditableStep,
} from "@/components/dashboard/followup-steps-editor";
import type { Chatbot, FollowupAsset, FollowupLoopMode } from "@/lib/types";

/**
 * Edit a chatbot's rich-media follow-up drip: an ordered list of steps (each with
 * a delay in hours, an optional asset, and optional text), a loop mode, and the
 * AI-media toggle — PLUS an optional "link follow-up" sequence used instead of the
 * usual one once the bot has sent the lead a link (empty = the usual runs). Saves
 * directly via the owner's RLS client (same pattern as the other dashboard forms).
 */
export function FollowupSequenceForm({
  chatbot,
  assets,
}: {
  chatbot: Chatbot;
  assets: FollowupAsset[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(chatbot.auto_followup_enabled);
  const [loopMode, setLoopMode] = useState<FollowupLoopMode>(
    chatbot.auto_followup_loop_mode ??
      (chatbot.auto_followup_loop_last ? "repeat_last" : "stop")
  );
  const [aiMedia, setAiMedia] = useState(chatbot.ai_media_enabled);
  const [noFollowupFlag, setNoFollowupFlag] = useState(chatbot.followup_flag_enabled);
  const [steps, setSteps] = useState<EditableStep[]>(toEditable(chatbot.auto_followup_steps));
  // Optional link sequence — NOT seeded with a blank step: empty means "use the
  // usual follow-up" (the fallback), so a bot that never sets it is unaffected.
  const [linkSteps, setLinkSteps] = useState<EditableStep[]>(
    toEditable(chatbot.auto_followup_link_steps, false)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Any edit flips dirty until a successful save — surfaced next to the Save button.
  const [dirty, setDirty] = useState(false);
  // ManyChat flows for the per-step "deliver via flow" picker (Option B). Loaded
  // once; null = loading, [] = none/failed (the picker just doesn't render).
  const [flows, setFlows] = useState<{ ns: string; name: string }[] | null>(null);
  const [flowsError, setFlowsError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/chatbots/${chatbot.id}/manychat-flows`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (r.ok && Array.isArray(j?.flows)) setFlows(j.flows);
        else { setFlows([]); setFlowsError(j?.error ?? "Couldn't load your ManyChat flows."); }
      })
      .catch(() => { if (alive) { setFlows([]); setFlowsError("Couldn't load your ManyChat flows."); } });
    return () => { alive = false; };
  }, [chatbot.id]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const cleaned = stepsToFollowupSteps(steps);
    const cleanedLink = stepsToFollowupSteps(linkSteps);

    if (enabled && cleaned.length === 0) {
      setError("Add at least one step (a message, asset, or ManyChat flow) to run the drip.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chatbots")
      .update({
        auto_followup_enabled: enabled,
        auto_followup_steps: cleaned,
        auto_followup_link_steps: cleanedLink,
        auto_followup_loop_mode: loopMode,
        auto_followup_loop_last: loopMode === "repeat_last", // keep the legacy flag consistent
        ai_media_enabled: aiMedia,
        followup_flag_enabled: noFollowupFlag,
      })
      .eq("id", chatbot.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    setDirty(false);
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label htmlFor="fu-enabled">Enable auto follow-up</Label>
          <p className="text-sm text-muted-foreground">
            Re-engage contacts who go quiet with a timed sequence of messages and media.
          </p>
        </div>
        <Switch
          id="fu-enabled"
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            markDirty();
          }}
        />
      </div>

      {enabled && (
        <div className="space-y-5 border-l-2 border-muted pl-4">
          <p className="text-xs text-muted-foreground">
            Steps run in order after a contact goes quiet. Delays are in hours from the
            previous message (1–22h), and the whole sequence must finish within 24h of
            their last message — Instagram blocks sends after that unless they opt in to
            notifications. A voice note or video only sends on Facebook/Telegram; on
            Instagram that step sends its text instead.
          </p>

          {flowsError && (
            <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              {flowsError} You can still use message/asset steps; reconnect ManyChat to trigger voice flows.
            </p>
          )}

          <StepsEditor
            steps={steps}
            setSteps={setSteps}
            assets={assets}
            flows={flows}
            markDirty={markDirty}
            idPrefix="main"
            minSteps={1}
            addLabel="+ Add step"
          />

          <div className="space-y-1">
            <Label htmlFor="fu-loop-mode">After the last step</Label>
            <select
              id="fu-loop-mode"
              value={loopMode}
              onChange={(e) => {
                setLoopMode(e.target.value as FollowupLoopMode);
                markDirty();
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="stop">Stop — send nothing more</option>
              <option value="repeat_last">Let the AI keep following up</option>
              <option value="cycle">Cycle through all steps (recommended)</option>
            </select>
            <p className="text-sm text-muted-foreground">
              {loopMode === "cycle"
                ? "After the last step it loops back to the first and keeps rotating — an unconfirmed lead gets a different message each time until they convert or the window closes."
                : loopMode === "repeat_last"
                  ? "After the last step the AI takes over and writes a fresh, context-aware follow-up from the conversation each time (on the last step's delay) until the lead is confirmed or the 24h window closes — no more repeating the same message."
                  : "After the last step the drip ends until the lead messages again."}
              {" "}A reply never restarts the sequence — the lead always picks up at the next step.
            </p>
          </div>

          {/* ── Link follow-up: replaces the sequence above once the bot has sent a link ── */}
          <div className="space-y-4 rounded-md border border-dashed p-4">
            <div>
              <Label className="text-sm font-medium">Link follow-up (optional)</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                A separate sequence used <span className="font-medium">instead of</span> the one above
                once the bot has sent this contact a link (e.g. a sign-up or booking link). Use it to
                nudge them about the link — &ldquo;did you get a chance to sign up?&rdquo; — rather than
                the usual message. <span className="font-medium">Leave it empty and the usual
                follow-up runs</span> as normal. It uses the same &ldquo;after the last step&rdquo;
                setting above.
              </p>
            </div>
            <StepsEditor
              steps={linkSteps}
              setSteps={setLinkSteps}
              assets={assets}
              flows={flows}
              markDirty={markDirty}
              idPrefix="link"
              minSteps={0}
              addLabel="+ Add link follow-up step"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t pt-5">
        <div>
          <Label htmlFor="ai-media">Let the AI send media on its own</Label>
          <p className="text-sm text-muted-foreground">
            During a live chat, the AI can attach a saved asset when it fits (e.g. sends a
            demo video when asked for proof). Uses the same asset library.
          </p>
        </div>
        <Switch id="ai-media" checked={aiMedia} onCheckedChange={(v) => { setAiMedia(v); markDirty(); }} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t pt-5">
        <div>
          <Label htmlFor="mc-no-followup">Sync &ldquo;stop follow-up&rdquo; flag to ManyChat</Label>
          <p className="text-sm text-muted-foreground">
            When a lead is subscribed, disqualified, a bot, starting later, muted, or
            handed to a human, tag them <code>ss_no_followup</code> in ManyChat so a
            native voice-note drip skips them. Create that tag in ManyChat and add a
            Condition on it to your flow before turning this on.
          </p>
        </div>
        <Switch
          id="mc-no-followup"
          checked={noFollowupFlag}
          onCheckedChange={(v) => { setNoFollowupFlag(v); markDirty(); }}
        />
      </div>

      {error && (
        <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save follow-up"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
        {dirty && !saving && (
          <span className="text-sm text-amber-600">Unsaved changes</span>
        )}
      </div>
    </form>
  );
}
