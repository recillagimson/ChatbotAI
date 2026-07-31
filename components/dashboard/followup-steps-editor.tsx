"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AssetThumb } from "@/components/dashboard/asset-thumb";
import { stepAssetKeys } from "@/lib/followup-assets";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { FollowupAsset, FollowupStep } from "@/lib/types";

export const MIN_H = 1;
export const MAX_H = 22;
export const MAX_STEP_ASSETS = 5; // caption + up to 5 media bubbles stays under ManyChat's 10-per-call cap
export const clampHours = (n: number) => Math.min(MAX_H, Math.max(MIN_H, Math.round(n || 3)));

export type EditableStep = {
  delay_hours: number;
  asset_keys: string[];
  text: string;
  flow_ns: string | null;
  flow_name: string | null;
  flow_ns_fb: string | null;
  flow_name_fb: string | null;
  ai_generate: boolean;
};

/** A blank step for "add step" / seeding an empty main sequence. */
export function blankStep(delayHours = 3): EditableStep {
  return { delay_hours: delayHours, asset_keys: [], text: "", flow_ns: null, flow_name: null, flow_ns_fb: null, flow_name_fb: null, ai_generate: false };
}

/**
 * Map stored FollowupSteps → editable rows. `seedIfEmpty` (default true) yields a
 * single blank step when there are none - the main sequence always shows one row;
 * the optional link sequence passes false so "no link steps" stays truly empty.
 */
export function toEditable(steps: FollowupStep[] | null | undefined, seedIfEmpty = true): EditableStep[] {
  // auto_followup_steps is schemaless JSONB - drop any null/garbage element first.
  const arr = Array.isArray(steps)
    ? steps.filter((s): s is FollowupStep => !!s && typeof s === "object")
    : [];
  if (arr.length === 0) return seedIfEmpty ? [blankStep()] : [];
  return arr.map((s) => ({
    delay_hours: clampHours(Number(s.delay_hours)),
    asset_keys: stepAssetKeys(s), // back-compat: reads old single asset_key too
    text: s.text ?? "",
    flow_ns: s.flow_ns ?? null,
    flow_name: s.flow_name ?? null,
    flow_ns_fb: s.flow_ns_fb ?? null,
    flow_name_fb: s.flow_name_fb ?? null,
    ai_generate: !!s.ai_generate,
  }));
}

/**
 * Clean editable rows → FollowupSteps for saving: drop empty steps, clamp delays,
 * mirror the singular asset_key. Shared by the main + link sequences.
 */
export function stepsToFollowupSteps(steps: EditableStep[]): FollowupStep[] {
  return steps
    .filter((s) => s.text.trim() || s.asset_keys.length || s.flow_ns || s.flow_ns_fb || s.ai_generate)
    .map((s) => ({
      delay_hours: clampHours(Number(s.delay_hours)),
      asset_keys: s.asset_keys,
      asset_key: s.asset_keys[0] ?? null,
      text: s.text.trim() || null,
      flow_ns: s.flow_ns ?? null,
      flow_name: s.flow_name ?? null,
      flow_ns_fb: s.flow_ns_fb ?? null,
      flow_name_fb: s.flow_name_fb ?? null,
      ai_generate: s.ai_generate,
    }));
}

/**
 * The ordered-steps editor (delay, optional voice flow, assets, AI toggle, text).
 * Reused for both the main drip and the optional link-follow-up drip; `idPrefix`
 * keeps input ids unique between the two, and `minSteps` gates the Remove button
 * (1 for the main sequence so it never empties; 0 for the link sequence).
 */
export function StepsEditor({
  steps,
  setSteps,
  assets,
  flows,
  markDirty,
  idPrefix,
  minSteps = 0,
  addLabel = "+ Add step",
  firstDelayLabel = "Send after (hours of silence)",
}: {
  steps: EditableStep[];
  setSteps: (updater: (prev: EditableStep[]) => EditableStep[]) => void;
  assets: FollowupAsset[];
  flows: { ns: string; name: string }[] | null;
  markDirty: () => void;
  idPrefix: string;
  minSteps?: number;
  addLabel?: string;
  firstDelayLabel?: string;
}) {
  const knownKeys = new Set(assets.map((a) => a.key));
  const hasAssets = assets.length > 0;

  function patch(i: number, next: Partial<EditableStep>) {
    markDirty();
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...next } : s)));
  }
  function toggleAsset(i: number, key: string) {
    markDirty();
    setSteps((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s;
        if (s.asset_keys.includes(key)) return { ...s, asset_keys: s.asset_keys.filter((k) => k !== key) };
        if (s.asset_keys.length >= MAX_STEP_ASSETS) return s; // at cap, ignore
        return { ...s, asset_keys: [...s.asset_keys, key] };
      })
    );
  }
  function addStep() {
    markDirty();
    setSteps((prev) => [...prev, blankStep(5)]);
  }
  function removeStep(i: number) {
    markDirty();
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-5">
      {steps.map((step, i) => (
        <div key={i} className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Step {i + 1}</span>
            {steps.length > minSteps && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(i)}>
                Remove
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-step-delay-${i}`}>
              {i === 0 ? firstDelayLabel : "Then wait (hours)"}
            </Label>
            <Input
              id={`${idPrefix}-step-delay-${i}`}
              type="number"
              min={MIN_H}
              max={MAX_H}
              value={step.delay_hours}
              onChange={(e) => patch(i, { delay_hours: Number(e.target.value) })}
              className="w-28"
            />
          </div>

          {flows && flows.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-step-flow-ig-${i}`}>ManyChat flow - Instagram (voice) - optional</Label>
                <select
                  id={`${idPrefix}-step-flow-ig-${i}`}
                  value={step.flow_ns ?? ""}
                  onChange={(e) => {
                    const ns = e.target.value;
                    const name = flows.find((f) => f.ns === ns)?.name ?? null;
                    patch(i, { flow_ns: ns || null, flow_name: ns ? name : null });
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">- none (send the message/assets below) -</option>
                  {flows.map((f) => (
                    <option key={f.ns} value={f.ns}>{f.name || f.ns}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-step-flow-fb-${i}`}>ManyChat flow - Facebook (voice) - optional</Label>
                <select
                  id={`${idPrefix}-step-flow-fb-${i}`}
                  value={step.flow_ns_fb ?? ""}
                  onChange={(e) => {
                    const ns = e.target.value;
                    const name = flows.find((f) => f.ns === ns)?.name ?? null;
                    patch(i, { flow_ns_fb: ns || null, flow_name_fb: ns ? name : null });
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">- none (use the Instagram flow / message below) -</option>
                  {flows.map((f) => (
                    <option key={f.ns} value={f.ns}>{f.name || f.ns}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Pick the matching flow per platform (both lists show all your flows - ManyChat
                doesn&apos;t tag them by channel). Set one and it fires for everyone; set both and
                each platform gets its own. When a flow fires, the assets and message below are
                ignored for that send.
              </p>
            </div>
          )}

          <div className={cn((step.flow_ns || step.flow_ns_fb) && "pointer-events-none opacity-40")}>
            {/* Attach assets - a thumbnail multi-picker (up to MAX_STEP_ASSETS). */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Attach assets (optional)</Label>
                <span className="text-xs text-muted-foreground">
                  {step.asset_keys.length}/{MAX_STEP_ASSETS} selected
                </span>
              </div>

              {/* Keys whose asset was deleted stay VISIBLE (removable). */}
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                          selected ? "border-primary ring-2 ring-primary" : "border-input hover:border-primary/50",
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
                  Add pictures, voice notes, videos, or links in the asset library above to attach them here.
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label htmlFor={`${idPrefix}-step-ai-${i}`}>AI Follow up</Label>
                <p className="text-xs text-muted-foreground">
                  Let the AI write this follow-up from the conversation. Leave the box below blank
                  to let it decide, or add an instruction to steer it.
                </p>
              </div>
              <Switch
                id={`${idPrefix}-step-ai-${i}`}
                checked={step.ai_generate}
                onCheckedChange={(v) => patch(i, { ai_generate: v })}
              />
            </div>
            <div className="mt-3 space-y-1">
              <Label htmlFor={`${idPrefix}-step-text-${i}`}>
                {step.ai_generate
                  ? "Instruction for the AI (optional - leave blank to let it decide)"
                  : `Message ${step.asset_keys.length ? "/ caption" : ""}`}
              </Label>
              <Textarea
                id={`${idPrefix}-step-text-${i}`}
                rows={2}
                value={step.text}
                onChange={(e) => patch(i, { text: e.target.value })}
                placeholder={step.ai_generate ? "e.g. gently ask if they still want to hit their goal" : "Hey {{name}}, still thinking it over? 😊"}
              />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addStep}>
        {addLabel}
      </Button>
    </div>
  );
}
