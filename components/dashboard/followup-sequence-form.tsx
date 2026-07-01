"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Chatbot, FollowupAsset, FollowupStep } from "@/lib/types";

const MIN_H = 1;
const MAX_H = 22;
const clampHours = (n: number) => Math.min(MAX_H, Math.max(MIN_H, Math.round(n || 3)));

type EditableStep = { delay_hours: number; asset_key: string; text: string };

function toEditable(steps: FollowupStep[]): EditableStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    return [{ delay_hours: 3, asset_key: "", text: "" }];
  }
  return steps.map((s) => ({
    delay_hours: clampHours(Number(s.delay_hours)),
    asset_key: s.asset_key ?? "",
    text: s.text ?? "",
  }));
}

/**
 * Edit a chatbot's rich-media follow-up drip: an ordered list of steps (each with
 * a delay in hours, an optional asset, and optional text), a loop-last toggle, and
 * the AI-media toggle. Saves directly via the owner's RLS client (same pattern as
 * the other dashboard forms). Legacy day-scale fields are left untouched.
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
  const [loopLast, setLoopLast] = useState(chatbot.auto_followup_loop_last);
  const [aiMedia, setAiMedia] = useState(chatbot.ai_media_enabled);
  const [steps, setSteps] = useState<EditableStep[]>(toEditable(chatbot.auto_followup_steps));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Any edit flips dirty until a successful save — surfaced next to the Save
  // button so toggled switches aren't silently lost on navigation.
  const [dirty, setDirty] = useState(false);

  const knownKeys = new Set(assets.map((a) => a.key));

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }
  function patch(i: number, next: Partial<EditableStep>) {
    markDirty();
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...next } : s)));
  }
  function addStep() {
    markDirty();
    setSteps((prev) => [...prev, { delay_hours: 5, asset_key: "", text: "" }]);
  }
  function removeStep(i: number) {
    markDirty();
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    // Keep only steps that carry a message or an asset; normalize.
    const cleaned: FollowupStep[] = steps
      .filter((s) => s.text.trim() || s.asset_key.trim())
      .map((s) => ({
        delay_hours: clampHours(Number(s.delay_hours)),
        asset_key: s.asset_key.trim() || null,
        text: s.text.trim() || null,
      }));

    if (enabled && cleaned.length === 0) {
      setError("Add at least one step (a message and/or an asset) to run the drip.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chatbots")
      .update({
        auto_followup_enabled: enabled,
        auto_followup_steps: cleaned,
        auto_followup_loop_last: loopLast,
        ai_media_enabled: aiMedia,
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

  const hasAssets = assets.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between gap-4">
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

          {steps.map((step, i) => (
            <div key={i} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Step {i + 1}</span>
                {steps.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(i)}>
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`step-delay-${i}`}>
                    {i === 0 ? "Send after (hours of silence)" : "Then wait (hours)"}
                  </Label>
                  <Input
                    id={`step-delay-${i}`}
                    type="number"
                    min={MIN_H}
                    max={MAX_H}
                    value={step.delay_hours}
                    onChange={(e) => patch(i, { delay_hours: Number(e.target.value) })}
                    className="w-28"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`step-asset-${i}`}>Attach asset (optional)</Label>
                  <select
                    id={`step-asset-${i}`}
                    value={step.asset_key}
                    onChange={(e) => patch(i, { asset_key: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">No asset (text only)</option>
                    {/* A key whose asset was deleted stays VISIBLE (not silently
                        blank) so the owner sees the broken reference. */}
                    {step.asset_key && !knownKeys.has(step.asset_key) && (
                      <option value={step.asset_key}>⚠ missing: {step.asset_key}</option>
                    )}
                    {assets.map((a) => (
                      <option key={a.id} value={a.key}>
                        {a.key} ({a.kind})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {step.asset_key && !knownKeys.has(step.asset_key) && (
                <p className="text-xs text-destructive">
                  The asset &quot;{step.asset_key}&quot; no longer exists — this step will send
                  text only. Pick another asset or set it to text only.
                </p>
              )}
              <div className="space-y-1">
                <Label htmlFor={`step-text-${i}`}>Message {step.asset_key ? "/ caption" : ""}</Label>
                <Textarea
                  id={`step-text-${i}`}
                  rows={2}
                  value={step.text}
                  onChange={(e) => patch(i, { text: e.target.value })}
                  placeholder="Hey {{name}}, still thinking it over? 😊"
                />
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            + Add step
          </Button>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="fu-loop">Repeat the last step until they convert</Label>
              <p className="text-sm text-muted-foreground">
                Keep re-sending the final step (on its delay) until the lead is confirmed
                or the 24h window closes.
              </p>
            </div>
            <Switch id="fu-loop" checked={loopLast} onCheckedChange={(v) => { setLoopLast(v); markDirty(); }} />
          </div>

          {!hasAssets && (
            <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              Add pictures, voice notes, videos, or links in the asset library above to
              attach them to a step.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t pt-5">
        <div>
          <Label htmlFor="ai-media">Let the AI send media on its own</Label>
          <p className="text-sm text-muted-foreground">
            During a live chat, the AI can attach a saved asset when it fits (e.g. sends a
            demo video when asked for proof). Uses the same asset library.
          </p>
        </div>
        <Switch id="ai-media" checked={aiMedia} onCheckedChange={(v) => { setAiMedia(v); markDirty(); }} />
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
