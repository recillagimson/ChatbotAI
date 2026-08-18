"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_LINK_FLOW_TOKEN } from "@/lib/link-flow";
import type { Chatbot } from "@/lib/types";

/**
 * Configure link-via-ManyChat. When the bot is ready to send the signup link it emits
 * a marker token; SpeedSettr strips the token and fires a native ManyChat flow to
 * deliver the link, instead of sending a raw URL (which Instagram strips). Saves
 * directly via the owner's RLS client, the same pattern as the Welcome form.
 */
export function LinkFlowForm({ chatbot }: { chatbot: Chatbot }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(chatbot.link_flow_enabled);
  const [igNs, setIgNs] = useState<string | null>(chatbot.link_flow_ns ?? null);
  const [igName, setIgName] = useState<string | null>(
    chatbot.link_flow_name ?? null,
  );
  const [fbNs, setFbNs] = useState<string | null>(
    chatbot.link_flow_ns_fb ?? null,
  );
  const [fbName, setFbName] = useState<string | null>(
    chatbot.link_flow_name_fb ?? null,
  );
  const [token, setToken] = useState(chatbot.link_flow_token ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [flows, setFlows] = useState<{ ns: string; name: string }[] | null>(
    null,
  );
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
    if (enabled && !igNs && !fbNs) {
      setError(
        "Pick at least one ManyChat flow (Instagram or Facebook) to enable link delivery.",
      );
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chatbots")
      .update({
        link_flow_enabled: enabled,
        link_flow_ns: igNs,
        link_flow_name: igNs ? igName : null,
        link_flow_ns_fb: fbNs,
        link_flow_name_fb: fbNs ? fbName : null,
        link_flow_token: token.trim() || null,
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

  function flowSelect(
    id: string,
    label: string,
    ns: string | null,
    onPick: (ns: string | null, name: string | null) => void,
  ) {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {flows && flows.length > 0 ? (
          <select
            id={id}
            value={ns ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              const name = flows.find((f) => f.ns === next)?.name ?? null;
              onPick(next || null, next ? name : null);
              markDirty();
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">- none -</option>
            {flows.map((f) => (
              <option key={f.ns} value={f.ns}>
                {f.name || f.ns}
              </option>
            ))}
          </select>
        ) : (
          <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
            {flows === null
              ? "Loading your ManyChat flows..."
              : "No ManyChat flows found. Build the link automation in ManyChat, then reconnect."}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="link-flow-enabled">
            Send the signup link via a ManyChat flow
          </Label>
          <p className="text-sm text-muted-foreground">
            When the bot is ready to share your link, it fires a ManyChat flow
            that delivers it instead of typing the URL. Useful on Instagram,
            which strips links from automated DMs. In your knowledge base, tell
            the bot to output the token below when it wants to send the link.
          </p>
        </div>
        <Switch
          id="link-flow-enabled"
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            markDirty();
          }}
        />
      </div>

      {enabled && (
        <div className="space-y-5 border-l-2 border-muted pl-4">
          {flowsError && (
            <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              {flowsError} Reconnect ManyChat to pick a flow.
            </p>
          )}

          {flowSelect("link-flow-ig", "Instagram flow", igNs, (ns, name) => {
            setIgNs(ns);
            setIgName(name);
          })}
          {flowSelect(
            "link-flow-fb",
            "Facebook (Messenger) flow",
            fbNs,
            (ns, name) => {
              setFbNs(ns);
              setFbName(name);
            },
          )}
          <p className="text-xs text-muted-foreground">
            The Instagram flow also covers Messenger when Facebook is left
            empty. Instagram never uses the Facebook flow, so if you set only
            the Facebook flow, Instagram links will not send. Set the Instagram
            flow if you serve Instagram.
          </p>

          <div className="space-y-1">
            <Label htmlFor="link-flow-token">Trigger token</Label>
            <Input
              id="link-flow-token"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                markDirty();
              }}
              placeholder={DEFAULT_LINK_FLOW_TOKEN}
            />
            <p className="text-xs text-muted-foreground">
              What the bot writes to trigger the link. Defaults to{" "}
              <span className="font-mono">{DEFAULT_LINK_FLOW_TOKEN}</span>. Put
              the exact same token in your knowledge base. It is always removed
              before the message reaches the lead.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save link flow"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {dirty && !saving && (
          <span className="text-sm text-amber-600">Unsaved changes</span>
        )}
      </div>
    </form>
  );
}
