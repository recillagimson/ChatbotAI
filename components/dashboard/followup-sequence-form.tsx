"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AssetThumb } from "@/components/dashboard/asset-thumb";
import { stepAssetKeys } from "@/lib/followup-assets";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { Chatbot, FollowupAsset, FollowupLoopMode, FollowupStep } from "@/lib/types";

const MIN_H = 1;
const MAX_H = 22;
const MAX_STEP_ASSETS = 5; // caption + up to 5 media bubbles stays under ManyChat's 10-per-call cap
const clampHours = (n: number) => Math.min(MAX_H, Math.max(MIN_H, Math.round(n || 3)));

type EditableStep = { delay_hours: number; asset_keys: string[]; text: string };

function toEditable(steps: FollowupStep[]): EditableStep[] {
  // auto_followup_steps is schemaless JSONB — drop any null/garbage element
  // before mapping (a null here would otherwise crash the editor mount).
  const arr = Array.isArray(steps)
    ? steps.filter((s): s is FollowupStep => !!s && typeof s === "object")
    : [];
  if (arr.length === 0) {
    return [{ delay_hours: 3, asset_keys: [], text: "" }];
  }
  return arr.map((s) => ({
    delay_hours: clampHours(Number(s.delay_hours)),
    asset_keys: stepAssetKeys(s), // back-compat: reads old single asset_key too
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
  const [loopMode, setLoopMode] = useState<FollowupLoopMode>(
    chatbot.auto_followup_loop_mode ??
      (chatbot.auto_followup_loop_last ? "repeat_last" : "stop")
  );
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
  // Toggle an asset key on step i: add if absent (up to the cap), remove if present.
  function toggleAsset(i: number, key: string) {
    markDirty();
    setSteps((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s;
        if (s.asset_keys.includes(key)) {
          return { ...s, asset_keys: s.asset_keys.filter((k) => k !== key) };
        }
        if (s.asset_keys.length >= MAX_STEP_ASSETS) return s; // at cap, ignore
        return { ...s, asset_keys: [...s.asset_keys, key] };
      })
    );
  }
  function addStep() {
    markDirty();
    setSteps((prev) => [...prev, { delay_hours: 5, asset_keys: [], text: "" }]);
  }
  function removeStep(i: number) {
    markDirty();
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    // Keep only steps that carry a message or an asset; normalize. Write both the
    // plural asset_keys (canonical) and a singular asset_key mirror (= first key)
    // so anything still reading the legacy field keeps working.
    const cleaned: FollowupStep[] = steps
      .filter((s) => s.text.trim() || s.asset_keys.length)
      .map((s) => ({
        delay_hours: clampHours(Number(s.delay_hours)),
        asset_keys: s.asset_keys,
        asset_key: s.asset_keys[0] ?? null,
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
        auto_followup_loop_mode: loopMode,
        auto_followup_loop_last: loopMode === "repeat_last", // keep the legacy flag consistent
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

              {/* Attach assets — a thumbnail multi-picker (up to MAX_STEP_ASSETS). */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Attach assets (optional)</Label>
                  <span className="text-xs text-muted-foreground">
                    {step.asset_keys.length}/{MAX_STEP_ASSETS} selected
                  </span>
                </div>

                {/* Keys whose asset was deleted stay VISIBLE (removable) so the
                    owner sees the broken reference instead of a silent drop. */}
                {step.asset_keys
                  .filter((k) => !knownKeys.has(k))
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleAsset(i, k)}
                      className="mr-2 inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                    >
                      ⚠ missing: {k} <span aria-hidden>✕</span>
                    </button>
                  ))}

                {hasAssets ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {assets.map((a) => {
                      const selected = step.asset_keys.includes(a.key);
                      const atCap = step.asset_keys.length >= MAX_STEP_ASSETS;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={selected}
                          disabled={!selected && atCap}
                          onClick={() => toggleAsset(i, a.key)}
                          className={cn(
                            "relative flex min-h-11 flex-col items-center gap-1 rounded-md border p-2 text-center transition",
                            selected
                              ? "border-primary ring-2 ring-primary"
                              : "border-input hover:border-primary/50",
                            !selected && atCap && "cursor-not-allowed opacity-40"
                          )}
                        >
                          {selected && (
                            <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                          <AssetThumb kind={a.kind} url={a.url} className="h-16 w-16" />
                          <code className="block max-w-full truncate rounded bg-muted px-1 py-0.5 text-[11px]">
                            {a.key}
                          </code>
                          <span className="text-[10px] text-muted-foreground">{a.kind}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Add pictures, voice notes, videos, or links in the asset library above to
                    attach them here.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor={`step-text-${i}`}>
                  Message {step.asset_keys.length ? "/ caption" : ""}
                </Label>
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
              <option value="repeat_last">Repeat the last step</option>
              <option value="cycle">Cycle through all steps (recommended)</option>
            </select>
            <p className="text-sm text-muted-foreground">
              {loopMode === "cycle"
                ? "Loops back to the first step and keeps rotating — an unconfirmed lead gets a different message each time (until they convert or the window closes). A reply continues to the next one instead of restarting."
                : loopMode === "repeat_last"
                  ? "Keeps re-sending the final step (on its delay) until the lead is confirmed or the 24h window closes."
                  : "The drip ends after the last step until the lead messages again."}
            </p>
          </div>
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
