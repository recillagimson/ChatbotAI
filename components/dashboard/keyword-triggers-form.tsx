"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { KeywordInput, splitKeywordTerms } from "@/components/ui/keyword-input";
import type { Chatbot, FollowupAsset, KeywordGroup, KeywordOnRepeat } from "@/lib/types";

/** Flatten a stored keyword array, splitting any comma/newline-joined entry and de-duping. */
function normalizeTerms(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const item of arr) {
    for (const t of splitKeywordTerms(String(item ?? ""))) {
      if (!out.some((v) => v.toLowerCase() === t.toLowerCase())) out.push(t);
    }
  }
  return out;
}

type EditableGroup = {
  id: string;
  keywords: string[];
  exclude: string[];
  first_reply_mode: KeywordOnRepeat;
  first_reply_text: string;
  first_reply_asset_key: string;
  first_reply_instruction: string;
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
    keywords: normalizeTerms(g.keywords),
    exclude: normalizeTerms(g.exclude),
    first_reply_mode: g.first_reply_mode ?? "message",
    first_reply_text: g.first_reply_text ?? "",
    first_reply_asset_key: g.first_reply_asset_key ?? "",
    first_reply_instruction: g.first_reply_instruction ?? "",
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
  const [gateEnabled, setGateEnabled] = useState(!!chatbot.keyword_gate_enabled);
  const [strictEnabled, setStrictEnabled] = useState(!!chatbot.keyword_strict_enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Footgun: gate ON with no usable keyword = the bot replies to nobody.
  const hasActiveKeywords = groups.some(
    (g) => g.enabled && g.keywords.some((k) => k.trim())
  );

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
        first_reply_mode: "message",
        first_reply_text: "",
        first_reply_asset_key: "",
        first_reply_instruction: "",
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
      const firstInstr = g.first_reply_instruction.trim();
      // Silently drop a fully-empty row (e.g. an "Add" the owner never filled in).
      if (
        keywords.length === 0 && !firstText && !assetKey && !firstInstr &&
        !g.repeat_text.trim() && !g.instruction.trim()
      ) {
        continue;
      }
      if (keywords.length === 0) {
        setError("Every keyword group needs at least one keyword.");
        return;
      }
      // A "send a set message" first reply must have a message so it never sends
      // nothing (an asset is an optional attachment). The AI modes need no text.
      if (g.first_reply_mode === "message" && !firstText) {
        setError("A “send a set message” first reply needs a message.");
        return;
      }
      cleaned.push({
        id: g.id,
        keywords,
        exclude,
        first_reply_mode: g.first_reply_mode,
        first_reply_text: g.first_reply_mode === "message" ? firstText : "",
        first_reply_asset_key: g.first_reply_mode === "message" ? assetKey || null : null,
        first_reply_instruction: g.first_reply_mode === "instruction" ? firstInstr || null : null,
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
      .update({ keyword_triggers: cleaned, keyword_gate_enabled: gateEnabled, keyword_strict_enabled: strictEnabled })
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

      {/* Keyword-only reply mode: gate all replies behind a keyword match. */}
      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Only reply to messages with a keyword</span>
          <Switch
            checked={gateEnabled}
            onCheckedChange={(v) => {
              markDirty();
              setGateEnabled(v);
            }}
            aria-label="Only reply to messages with a keyword"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          When on, the bot answers ONLY DMs that match a keyword below and silently ignores
          everyone else. Use this for personal or private accounts. Non-matching messages
          still show in your inbox so you can reply by hand.
        </p>
        {gateEnabled && !hasActiveKeywords && (
          <p className="text-xs text-amber-600">
            With this on and no keywords set, the bot won&apos;t reply to anyone. Add at least
            one enabled keyword group below.
          </p>
        )}
      </div>

      {/* Strict keyword matching: whole-message equals instead of contains. */}
      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Use strict keywords (exact message only)</span>
          <Switch
            checked={strictEnabled}
            onCheckedChange={(v) => {
              markDirty();
              setStrictEnabled(v);
            }}
            aria-label="Use strict keywords (exact message only)"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          When on, a keyword only triggers if it&apos;s the whole message — &quot;credit&quot; starts the
          chat, but &quot;i have a problem with my credit&quot; does not. When off, a keyword matches
          anywhere in the message.
        </p>
      </div>

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
            <Label htmlFor={`kw-firstmode-${i}`}>First reply (the first time someone matches)</Label>
            <select
              id={`kw-firstmode-${i}`}
              value={g.first_reply_mode}
              onChange={(e) => patch(i, { first_reply_mode: e.target.value as KeywordOnRepeat })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="message">Send a set message</option>
              <option value="ai">Hand to the AI</option>
              <option value="instruction">Steer the AI with an instruction</option>
            </select>
          </div>

          {g.first_reply_mode === "message" && (
            <>
              <div className="space-y-1">
                <Label htmlFor={`kw-first-${i}`}>Message {g.first_reply_asset_key ? "/ caption" : ""}</Label>
                <Textarea
                  id={`kw-first-${i}`}
                  rows={2}
                  value={g.first_reply_text}
                  onChange={(e) => patch(i, { first_reply_text: e.target.value })}
                  placeholder="Appreciate you! Here's how it works…"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`kw-asset-${i}`}>Attach asset (optional)</Label>
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
            </>
          )}

          {g.first_reply_mode === "ai" && (
            <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              The AI answers their message using this chatbot&apos;s prompts and knowledge base — no
              canned message. Set what happens on later matches below.
            </p>
          )}

          {g.first_reply_mode === "instruction" && (
            <div className="space-y-1">
              <Label htmlFor={`kw-finstr-${i}`}>AI instruction for the first reply</Label>
              <Textarea
                id={`kw-finstr-${i}`}
                rows={2}
                value={g.first_reply_instruction}
                onChange={(e) => patch(i, { first_reply_instruction: e.target.value })}
                placeholder="They came in on the 63 post — answer their question and point them to the community."
              />
              <p className="text-xs text-muted-foreground">
                Added to the AI&apos;s instructions for that first reply only.
              </p>
            </div>
          )}

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
