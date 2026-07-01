/**
 * @deprecated DEAD CODE — superseded by followup-sequence-form.tsx (the
 * step-based rich-media drip). No longer imported anywhere; kept only until the
 * next cleanup pass. Do not wire this back in: it edits the legacy day-scale
 * auto_followup_days/repeat/max fields that the engine now treats as a fallback.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Chatbot } from "@/lib/types";

const clampDays = (n: number) => Math.min(6, Math.max(1, Math.round(n || 3)));
const clampMax = (n: number) => Math.min(6, Math.max(1, Math.round(n || 1)));

export function ChatbotSettingsForm({ chatbot }: { chatbot: Chatbot }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(chatbot.auto_followup_enabled);
  const [days, setDays] = useState(chatbot.auto_followup_days ?? 3);
  const [repeat, setRepeat] = useState(chatbot.auto_followup_repeat);
  const [max, setMax] = useState(chatbot.auto_followup_max ?? 3);
  const [template, setTemplate] = useState(chatbot.auto_followup_template ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const previewName = chatbot.instagram_username || "there";
  const preview = template.replace(/\{\{\s*name\s*\}\}/gi, previewName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (enabled && !template.trim()) {
      setError("Add a follow-up message when the feature is on.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chatbots")
      .update({
        auto_followup_enabled: enabled,
        auto_followup_days: clampDays(Number(days)),
        auto_followup_repeat: repeat,
        auto_followup_max: clampMax(Number(max)),
        auto_followup_template: template.trim() || null,
      })
      .eq("id", chatbot.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="fu-enabled">Enable auto follow-up</Label>
          <p className="text-sm text-muted-foreground">
            Re-engage contacts who go quiet, automatically.
          </p>
        </div>
        <Switch
          id="fu-enabled"
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            setSaved(false);
          }}
        />
      </div>

      {enabled && (
        <div className="space-y-5 border-l-2 border-muted pl-4">
          <div className="space-y-2">
            <Label htmlFor="fu-days">Follow up after (days of silence)</Label>
            <Input
              id="fu-days"
              type="number"
              min={1}
              max={6}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              1–6 days. Instagram blocks messages sent more than 7 days after the
              contact&apos;s last message, so follow-ups can&apos;t go beyond that.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fu-mode">If they still don&apos;t reply</Label>
            <select
              id="fu-mode"
              value={repeat ? "repeat" : "once"}
              onChange={(e) => setRepeat(e.target.value === "repeat")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="once">Send once, then stop</option>
              <option value="repeat">
                Repeat every few days (until they reply or the 7-day window closes)
              </option>
            </select>
          </div>

          {repeat && (
            <div className="space-y-2">
              <Label htmlFor="fu-max">Max follow-ups</Label>
              <Input
                id="fu-max"
                type="number"
                min={1}
                max={6}
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
                className="w-28"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="fu-template">Follow-up message</Label>
            <Textarea
              id="fu-template"
              rows={3}
              placeholder="Hey {{name}}! Just checking in — did you still have questions? Happy to help 😊"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use{" "}
              <code className="bg-muted px-1 rounded">{"{{name}}"}</code> to insert
              the contact&apos;s name.
            </p>
            {template.trim() && (
              <p className="text-sm bg-muted rounded px-3 py-2">
                <span className="text-muted-foreground">Preview: </span>
                {preview}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
      </div>
    </form>
  );
}
