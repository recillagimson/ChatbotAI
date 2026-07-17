"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { coerceKeywords } from "@/lib/welcome";
import type { Chatbot } from "@/lib/types";

/**
 * Configure the first-message Welcome VM. When a new contact's opener is a bare
 * greeting or a configured keyword (and carries no media), SpeedSettr fires a native
 * ManyChat voice/video flow instead of running the AI; a substantive opener (image,
 * detail, question) skips this and goes to the AI. Saves directly via the owner's RLS
 * client, the same pattern as the follow-up form.
 */
export function WelcomeForm({ chatbot }: { chatbot: Chatbot }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(chatbot.welcome_enabled);
  const [flowNs, setFlowNs] = useState<string | null>(chatbot.welcome_flow_ns ?? null);
  const [flowName, setFlowName] = useState<string | null>(chatbot.welcome_flow_name ?? null);
  const [keywords, setKeywords] = useState(coerceKeywords(chatbot.welcome_keywords).join(", "));
  const [useKeywordTriggers, setUseKeywordTriggers] = useState(
    chatbot.welcome_use_keyword_triggers
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [flows, setFlows] = useState<{ ns: string; name: string }[] | null>(null);
  const [flowsError, setFlowsError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/chatbots/${chatbot.id}/manychat-flows`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (r.ok && Array.isArray(j?.flows)) setFlows(j.flows);
        else {
          setFlows([]);
          setFlowsError(j?.error ?? "Couldn't load your ManyChat flows.");
        }
      })
      .catch(() => {
        if (alive) {
          setFlows([]);
          setFlowsError("Couldn't load your ManyChat flows.");
        }
      });
    return () => {
      alive = false;
    };
  }, [chatbot.id]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const list = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (enabled && !flowNs) {
      setError("Pick the ManyChat Welcome VM flow to enable the welcome message.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    // Turning the welcome ON for a bot that's already live: every conversation that
    // predates this switch is an EXISTING contact, not a new one. The migration's
    // backfill only covers rows that predate the column, and the gate never runs while
    // the feature is off — so those rows would still read welcomed_at IS NULL ("brand
    // new") and the next "hey" from an ongoing lead would fire the first-contact VM.
    // Resolve them BEFORE flipping the flag, so no webhook can fire a welcome at an
    // ongoing lead mid-save. If this fails, do NOT enable — leaving the flag off is the
    // safe direction. Idempotent + tenant-scoped (chatbot_id, and RLS scopes to the owner).
    //
    // The SAME hazard reopens when "use my Keyword triggers" is turned ON while the
    // welcome is already live: it widens what counts as a first-contact opener from an
    // exact greeting/keyword to any message CONTAINING a keyword. An ongoing lead whose
    // welcomed_at is still NULL only because they have so far only ever hit an upstream
    // gate (mute / disqualified / subscribed / human-takeover — all return before the
    // welcome decision) could then get a first-contact VM from an ordinary keyword-bearing
    // message. Run the same backfill on that transition too.
    const welcomeTurningOn = enabled && !chatbot.welcome_enabled;
    const syncTurningOn =
      enabled && useKeywordTriggers && !chatbot.welcome_use_keyword_triggers;
    if (welcomeTurningOn || syncTurningOn) {
      const { error: backfillError } = await supabase
        .from("conversations")
        .update({ welcomed_at: new Date().toISOString() })
        .eq("chatbot_id", chatbot.id)
        .is("welcomed_at", null);
      if (backfillError) {
        setSaving(false);
        setError(`Couldn't prepare existing conversations: ${backfillError.message}`);
        return;
      }
    }
    const { error } = await supabase
      .from("chatbots")
      .update({
        welcome_enabled: enabled,
        welcome_flow_ns: flowNs,
        welcome_flow_name: flowNs ? flowName : null,
        welcome_keywords: list,
        welcome_use_keyword_triggers: useKeywordTriggers,
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="welcome-enabled">Send a welcome voice/video on first contact</Label>
          <p className="text-sm text-muted-foreground">
            When a new contact opens with a greeting or one of your keywords (and no image),
            fire a ManyChat voice/video flow instead of the AI. If they open with an image or
            real detail, the AI reads it and replies instead.
          </p>
        </div>
        <Switch id="welcome-enabled" checked={enabled} onCheckedChange={(v) => { setEnabled(v); markDirty(); }} />
      </div>

      {enabled && (
        <div className="space-y-5 border-l-2 border-muted pl-4">
          {flowsError && (
            <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              {flowsError} Reconnect ManyChat to pick a welcome flow.
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="welcome-flow">Welcome VM flow</Label>
            {flows && flows.length > 0 ? (
              <select
                id="welcome-flow"
                value={flowNs ?? ""}
                onChange={(e) => {
                  const ns = e.target.value;
                  const name = flows.find((f) => f.ns === ns)?.name ?? null;
                  setFlowNs(ns || null);
                  setFlowName(ns ? name : null);
                  markDirty();
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— pick a flow —</option>
                {flows.map((f) => (
                  <option key={f.ns} value={f.ns}>
                    {f.name || f.ns}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                {flows === null
                  ? "Loading your ManyChat flows…"
                  : "No ManyChat flows found. Create a single voice-note flow in ManyChat, then reconnect."}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Make this a single voice-note (or video) send in ManyChat — no internal delays.
              SpeedSettr triggers it and records that the greeting was sent.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="welcome-keywords">Opener keywords (optional)</Label>
            <Input
              id="welcome-keywords"
              value={keywords}
              onChange={(e) => { setKeywords(e.target.value); markDirty(); }}
              placeholder="credit, funding, cash"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. A first message that is exactly one of these (or a plain greeting
              like &ldquo;hey&rdquo;) triggers the welcome; everything else goes to the AI.
              Comment-campaign opt-ins always get the welcome.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="welcome-use-keywords">Also use my Keyword triggers</Label>
              <p className="text-sm text-muted-foreground">
                When on, a first message that matches any keyword in your{" "}
                <span className="font-medium">Keywords</span> tab also fires the welcome — so you
                don&rsquo;t keep a separate list here. It uses the same matching as the Keywords
                tab, which looks for a keyword <span className="font-medium">anywhere</span> in the
                message — so even a longer, detailed first message that mentions a keyword gets the
                welcome VM instead of an AI reply. If that keyword also has its own first-reply set
                on the Keywords tab, the welcome VM takes its place for that contact.
              </p>
            </div>
            <Switch
              id="welcome-use-keywords"
              checked={useKeywordTriggers}
              onCheckedChange={(v) => {
                setUseKeywordTriggers(v);
                markDirty();
              }}
            />
          </div>
        </div>
      )}

      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save welcome"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
        {dirty && !saving && <span className="text-sm text-amber-600">Unsaved changes</span>}
      </div>
    </form>
  );
}
