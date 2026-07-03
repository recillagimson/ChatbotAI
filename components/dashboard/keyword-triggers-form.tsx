"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { KeywordInput } from "@/components/ui/keyword-input";
import type { Chatbot, FollowupAsset, KeywordGroup, KeywordOnRepeat } from "@/lib/types";

type EditableGroup = {
  id: string;
  keywords: string[];
  exclude: string[];
  first_reply_text: string;
  first_reply_asset_key: string;
  on_repeat: KeywordOnRepeat;
  repeat_text: string;
  instruction: string;
  enabled: boolean;
};

function newId(): string {
  // Stable id so keyword_fired stays valid across edits. crypto.randomUUID is
  // available in every browser we target; fall back just in case.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `kw_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function toEditable(groups: KeywordGroup[]): EditableGroup[] {
  if (!Array.isArray(groups)) return [];
  return groups.map((g) => ({
    id: g.id || newId(),
    keywords: Array.isArray(g.keywords) ? g.keywords : [],
    exclude: Array.isArray(g.exclude) ? g.exclude : [],
    first_reply_text: g.first_reply_text ?? "",
    first_reply_asset_key: g.first_reply_asset_key ?? "",
    on_repeat: g.on_repeat ?? "ai",
    repeat_text: g.repeat_text ?? "",
    instruction: g.instruction ?? "",
    enabled: g.enabled ?? true,
  }));
}

/**
 * Edit a chatbot's keyword triggers: a list of keyword groups, each with include
 * (and optional exclude) keyword pills, a canned first reply (text + optional
 * saved asset), and an on-repeat behavior. The webhook sends the first reply the
 * first time a contact's DM matches, then runs on_repeat on later matches. Saves
 * directly via the owner's RLS client — same pattern as the other dashboard forms.
 */
export function KeywordTriggersForm({
  chatbot,
  assets,
}: {
  chatbot: Chatbot;
  assets: FollowupAsset[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [groups, setGroups] = useState<EditableGroup[]>(toEditable(chatbot.keyword_triggers));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const knownKeys = new Set(assets.map((a) => a.key));

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }
  function patch(i: number, next: Partial<EditableGroup>) {
    markDirty();
    setGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...next } : g)));
  }
  function addGroup() {
    markDirty();
    setGroups((prev) => [
      ...prev,
      {
        id: newId(),
        keywords: [],
        exclude: [],
        first_reply_text: "",
        first_reply_asset_key: "",
        on_repeat: "ai",
        repeat_text: "",
        instruction: "",
        enabled: true,
      },
    ]);
  }
  function removeGroup(i: number) {
    markDirty();
    setGroups((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const cleaned: KeywordGroup[] = [];
    for (const g of groups) {
      const keywords = g.keywords.map((k) => k.trim()).filter(Boolean);
      const exclude = g.exclude.map((k) => k.trim()).filter(Boolean);
      const firstText = g.first_reply_text.trim();
      const assetKey = g.first_reply_asset_key.trim();
      // Silently drop a fully-empty row (e.g. an "Add" the owner never filled in).
      if (
        keywords.length === 0 && !firstText && !assetKey &&
        !g.repeat_text.trim() && !g.instruction.trim()
      ) {
        continue;
      }
      if (keywords.length === 0) {
        setError("Every keyword group needs at least one keyword.");
        return;
      }
      // Text is required (an asset is an optional attachment to it): the first reply
      // must have a message so it works on every channel and never sends nothing.
      if (!firstText) {
        setError("Every keyword group needs a first reply message.");
        return;
      }
      cleaned.push({
        id: g.id,
        keywords,
        exclude,
        first_reply_text: firstText,
        first_reply_asset_key: assetKey || null,
        on_repeat: g.on_repeat,
        repeat_text: g.on_repeat === "message" ? g.repeat_text.trim() || null : null,
        instruction: g.on_repeat === "instruction" ? g.instruction.trim() || null : null,
        enabled: g.enabled,
      });
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chatbots")
      .update({ keyword_triggers: cleaned })
      .eq("id", chatbot.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setGroups(toEditable(cleaned));
    setSaved(true);
    setDirty(false);
    startTransition(() => router.refresh());
  }

  const hasAssets = assets.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm text-muted-foreground">
        When a lead&apos;s DM contains a keyword, the bot sends your canned reply the first
        time only. If they say it again later, it does what you choose below (hand to the AI,
        send a different message, or steer the AI) — so a returning lead never gets the same
        pitch twice.
      </p>

      {groups.map((g, i) => (
        <div key={g.id} className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Keyword group {i + 1}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {g.enabled ? "On" : "Off"}
                <Switch
                  checked={g.enabled}
                  onCheckedChange={(v) => patch(i, { enabled: v })}
                  aria-label={`Enable keyword group ${i + 1}`}
                />
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeGroup(i)}>
                Remove
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`kw-inc-${i}`}>Keywords (any of these triggers it)</Label>
            <KeywordInput
              id={`kw-inc-${i}`}
              value={g.keywords}
              onChange={(next) => patch(i, { keywords: next })}
              placeholder="Type a keyword and press Enter (e.g. 63, fix, repair)"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={`kw-exc-${i}`}>Exclude keywords (optional — block a match)</Label>
            <KeywordInput
              id={`kw-exc-${i}`}
              value={g.exclude}
              onChange={(next) => patch(i, { exclude: next })}
              placeholder="Words that should NOT trigger it"
              variant="outline"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={`kw-first-${i}`}>First reply {g.first_reply_asset_key ? "/ caption" : ""}</Label>
            <Textarea
              id={`kw-first-${i}`}
              rows={2}
              value={g.first_reply_text}
              onChange={(e) => patch(i, { first_reply_text: e.target.value })}
              placeholder="Appreciate you! Here's how it works…"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={`kw-asset-${i}`}>Attach asset to the first reply (optional)</Label>
            <select
              id={`kw-asset-${i}`}
              value={g.first_reply_asset_key}
              onChange={(e) => patch(i, { first_reply_asset_key: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">No asset (text only)</option>
              {/* A key whose asset was deleted stays VISIBLE so the owner sees the break. */}
              {g.first_reply_asset_key && !knownKeys.has(g.first_reply_asset_key) && (
                <option value={g.first_reply_asset_key}>⚠ missing: {g.first_reply_asset_key}</option>
              )}
              {assets.map((a) => (
                <option key={a.id} value={a.key}>
                  {a.key} ({a.kind})
                </option>
              ))}
            </select>
            {g.first_reply_asset_key && !knownKeys.has(g.first_reply_asset_key) && (
              <p className="text-xs text-destructive">
                The asset &quot;{g.first_reply_asset_key}&quot; no longer exists — the first reply
                will send text only. Pick another asset or set it to text only.
              </p>
            )}
            {g.first_reply_asset_key && !hasAssets && (
              <p className="text-xs text-muted-foreground">
                Add assets in the follow-up asset library above to attach them here.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor={`kw-repeat-${i}`}>If they say it again later</Label>
            <select
              id={`kw-repeat-${i}`}
              value={g.on_repeat}
              onChange={(e) => patch(i, { on_repeat: e.target.value as KeywordOnRepeat })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="ai">Hand to the AI (it remembers them)</option>
              <option value="message">Send a different message</option>
              <option value="instruction">Steer the AI with an instruction</option>
            </select>
          </div>

          {g.on_repeat === "message" && (
            <div className="space-y-1">
              <Label htmlFor={`kw-rtext-${i}`}>Repeat message</Label>
              <Textarea
                id={`kw-rtext-${i}`}
                rows={2}
                value={g.repeat_text}
                onChange={(e) => patch(i, { repeat_text: e.target.value })}
                placeholder="You're already in — want me to point you to the next step?"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to just hand them to the AI instead.
              </p>
            </div>
          )}

          {g.on_repeat === "instruction" && (
            <div className="space-y-1">
              <Label htmlFor={`kw-instr-${i}`}>AI instruction for this reply</Label>
              <Textarea
                id={`kw-instr-${i}`}
                rows={2}
                value={g.instruction}
                onChange={(e) => patch(i, { instruction: e.target.value })}
                placeholder="They already got the intro — skip it and route them to funding."
              />
              <p className="text-xs text-muted-foreground">
                Added to the AI&apos;s instructions for that one reply only.
              </p>
            </div>
          )}
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addGroup}>
        + Add keyword group
      </Button>

      {error && (
        <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save keyword triggers"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
        {dirty && !saving && <span className="text-sm text-amber-600">Unsaved changes</span>}
      </div>
    </form>
  );
}
