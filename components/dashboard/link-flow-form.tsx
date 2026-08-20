"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { parseLinkFlows, type LinkFlowEntry } from "@/lib/link-flow";
import type { Chatbot } from "@/lib/types";

const MAX_LINKS = 10;

type Row = LinkFlowEntry & { _key: string };

/**
 * Configure link-via-ManyChat with multiple triggers. Each row = a keyword the bot emits
 * plus the ManyChat flow that delivers that link. SpeedSettr strips the keyword and fires
 * the flow (raw URLs get stripped by Instagram). Saves via the owner's RLS client, the same
 * pattern as the Welcome form. Legacy single-link bots seed row 1 from their old config.
 */
export function LinkFlowForm({ chatbot }: { chatbot: Chatbot }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const keySeq = useRef(0);
  const nextKey = () => `r${keySeq.current++}`;

  const [enabled, setEnabled] = useState(chatbot.link_flow_enabled);
  const [rows, setRows] = useState<Row[]>(() => {
    const parsed = parseLinkFlows(chatbot.link_flows);
    const seed: LinkFlowEntry[] =
      parsed.length > 0
        ? parsed
        : chatbot.link_flow_ns || chatbot.link_flow_ns_fb
          ? [
              {
                token: (chatbot.link_flow_token ?? "").trim() || "[[SEND_LINK]]",
                ns: chatbot.link_flow_ns ?? "",
                name: chatbot.link_flow_name ?? null,
                ns_fb: chatbot.link_flow_ns_fb ?? null,
                name_fb: chatbot.link_flow_name_fb ?? null,
              },
            ]
          : [];
    return seed.map((e) => ({ ...e, _key: `r${keySeq.current++}` }));
  });

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
  function updateRow(key: string, patch: Partial<LinkFlowEntry>) {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
    markDirty();
  }
  function addRow() {
    setRows((rs) =>
      rs.length >= MAX_LINKS
        ? rs
        : [...rs, { token: "", ns: "", name: null, ns_fb: null, name_fb: null, _key: nextKey() }],
    );
    markDirty();
  }
  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r._key !== key));
    markDirty();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    // Keep only rows the owner filled in: a keyword AND at least one flow.
    const clean: LinkFlowEntry[] = rows
      .map((r) => ({
        token: r.token.trim(),
        ns: r.ns?.trim() ?? "",
        name: r.ns?.trim() ? r.name : null,
        ns_fb: r.ns_fb?.trim() ? r.ns_fb : null,
        name_fb: r.ns_fb?.trim() ? r.name_fb : null,
      }))
      .filter((r) => r.token && (r.ns || r.ns_fb));

    if (enabled) {
      if (!clean.length) {
        setError("Add at least one link with a keyword and a ManyChat flow.");
        return;
      }
      const dupe = clean.find(
        (r, i) => clean.findIndex((x) => x.token.toLowerCase() === r.token.toLowerCase()) !== i,
      );
      if (dupe) {
        setError(`Each keyword must be unique. Duplicate: ${dupe.token}`);
        return;
      }
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chatbots")
      .update({ link_flow_enabled: enabled, link_flows: clean })
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
          <Label htmlFor="link-flow-enabled">Send links via ManyChat flows</Label>
          <p className="text-sm text-muted-foreground">
            Instead of typing a URL (which Instagram strips from automated DMs), the bot
            emits a keyword and SpeedSettr fires the matching ManyChat flow to deliver that
            link. Add one row per link, and put the same keyword in your knowledge base so
            the bot knows when to send it.
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
        <div className="space-y-4 border-l-2 border-muted pl-4">
          {flowsError && (
            <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              {flowsError} Reconnect ManyChat to pick a flow.
            </p>
          )}

          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No links yet. Add one to get started.</p>
          )}

          {rows.map((row, i) => (
            <div key={row._key} className="space-y-3 rounded-md border border-muted p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Link {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeRow(row._key)}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove
                </button>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`link-token-${row._key}`}>Trigger keyword</Label>
                <Input
                  id={`link-token-${row._key}`}
                  value={row.token}
                  onChange={(e) => updateRow(row._key, { token: e.target.value })}
                  placeholder="e.g. [[skool]] or book_call"
                />
                <p className="text-xs text-muted-foreground">
                  What the bot writes to send this link. Put the exact same keyword in your
                  knowledge base. It is always removed before the lead sees it.
                </p>
              </div>

              {flowSelect(`link-ig-${row._key}`, "Instagram flow", row.ns || null, (ns, name) =>
                updateRow(row._key, { ns: ns ?? "", name }),
              )}
              {flowSelect(`link-fb-${row._key}`, "Facebook (Messenger) flow", row.ns_fb, (ns, name) =>
                updateRow(row._key, { ns_fb: ns, name_fb: name }),
              )}
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            The Instagram flow also covers Messenger when Facebook is left empty. Instagram
            never uses the Facebook flow.
          </p>

          <Button type="button" variant="outline" onClick={addRow} disabled={rows.length >= MAX_LINKS}>
            {rows.length >= MAX_LINKS ? `Max ${MAX_LINKS} links` : "Add link"}
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save links"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {dirty && !saving && <span className="text-sm text-amber-600">Unsaved changes</span>}
      </div>
    </form>
  );
}
