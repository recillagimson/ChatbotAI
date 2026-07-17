"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChatScroll } from "@/components/dashboard/chat-scroll";
import { MessageBubble } from "@/components/dashboard/message-bubble";
import type { Chatbot, TrainingPair } from "@/lib/types";

type ChatMsg = { id: string; role: "user" | "assistant"; content: string; created_at: string };

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `tp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function toEditable(pairs: unknown): TrainingPair[] {
  if (!Array.isArray(pairs)) return [];
  return pairs
    .filter((p): p is TrainingPair => !!p && typeof p === "object")
    .map((p) => ({
      id: p.id || newId(),
      scenario: p.scenario ?? "",
      reply: p.reply ?? "",
      bad_reply: p.bad_reply ?? null,
      exact: !!p.exact,
      note: p.note ?? null,
      enabled: p.enabled ?? true,
    }));
}

/**
 * Bot Trainer: a live sandbox chat (left) + a saved-scenarios manager (right). Correcting
 * a bot reply mints a TrainingPair (scenario = the preceding user message, reply = what the
 * owner typed, bad_reply = the bot's original). "Save training" persists via the owner's RLS
 * client. The sandbox transcript is ephemeral (never stored). Pairs are sent as
 * trainingPairsOverride so corrections take effect immediately before saving.
 */
export function BotTrainer({ chatbot }: { chatbot: Chatbot }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [pairs, setPairs] = useState<TrainingPair[]>(toEditable(chatbot.training_pairs));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftExact, setDraftExact] = useState<Record<string, boolean>>({});
  const [openDraft, setOpenDraft] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setChatError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { id: newId(), role: "user", content: text, created_at: new Date().toISOString() }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`/api/chatbots/${chatbot.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text, history, trainingPairsOverride: pairs.filter((p) => p.enabled) }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || typeof j?.text !== "string") {
        setChatError(j?.error ?? "The bot couldn't reply — try again.");
      } else {
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: j.text, created_at: new Date().toISOString() }]);
      }
    } catch {
      setChatError("Network error — try again.");
    }
    setSending(false);
  }

  function precedingUser(assistantId: string): string {
    const idx = messages.findIndex((m) => m.id === assistantId);
    for (let i = idx - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
    return "";
  }

  function saveCorrection(assistantId: string, botReply: string) {
    const reply = (drafts[assistantId] ?? "").trim();
    if (!reply) return;
    setPairs((prev) => [
      ...prev,
      {
        id: newId(),
        scenario: precedingUser(assistantId),
        reply,
        bad_reply: botReply,
        exact: !!draftExact[assistantId],
        note: null,
        enabled: true,
      },
    ]);
    setDrafts((d) => ({ ...d, [assistantId]: "" }));
    setDraftExact((d) => ({ ...d, [assistantId]: false }));
    setOpenDraft(null);
    markDirty();
  }

  function patchPair(id: string, next: Partial<TrainingPair>) {
    setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));
    markDirty();
  }
  function removePair(id: string) {
    setPairs((prev) => prev.filter((p) => p.id !== id));
    markDirty();
  }
  function addPair() {
    setPairs((prev) => [...prev, { id: newId(), scenario: "", reply: "", bad_reply: null, exact: false, note: null, enabled: true }]);
    markDirty();
  }

  async function saveTraining() {
    setSaveError(null);
    setSaving(true);
    const cleaned = pairs
      .filter((p) => p.scenario.trim() && p.reply.trim())
      .map((p) => ({
        id: p.id,
        scenario: p.scenario.trim(),
        reply: p.reply.trim(),
        bad_reply: p.bad_reply?.trim() || null,
        exact: !!p.exact,
        note: p.note?.trim() || null,
        enabled: p.enabled,
      }));
    const supabase = createClient();
    const { error } = await supabase.from("chatbots").update({ training_pairs: cleaned }).eq("id", chatbot.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setSaved(true);
    setDirty(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Left: sandbox chat */}
      <div className="lg:col-span-2 flex flex-col rounded-md border min-h-[28rem]">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Test chat — sandbox (nothing here is saved to your inbox)</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setMessages([]); setOpenDraft(null); }}>
            Reset chat
          </Button>
        </div>
        <ChatScroll className="flex-1 min-h-0 p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Message the bot to test it. Then use &ldquo;Train this reply&rdquo; under any bot message to teach it what to say instead.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="space-y-1">
              <MessageBubble message={m} />
              {m.role === "assistant" && (
                <div className="flex justify-end">
                  <div className="w-[75%]">
                    {openDraft === m.id ? (
                      <div className="space-y-2 rounded-md border bg-background p-2">
                        <Label htmlFor={`corr-${m.id}`} className="text-xs">
                          Reply instead {precedingUser(m.id) ? `(for "${precedingUser(m.id)}")` : ""}
                        </Label>
                        <Textarea
                          id={`corr-${m.id}`}
                          rows={2}
                          value={drafts[m.id] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                          placeholder="What should it have said here?"
                        />
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch checked={!!draftExact[m.id]} onCheckedChange={(v) => setDraftExact((d) => ({ ...d, [m.id]: v }))} />
                            Say exactly
                          </label>
                          <div className="flex gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setOpenDraft(null)}>Cancel</Button>
                            <Button type="button" size="sm" onClick={() => saveCorrection(m.id, m.content)}>Add</Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setOpenDraft(m.id)}>
                          Train this reply
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {sending && <p className="pr-1 text-right text-xs text-muted-foreground">bot is typing…</p>}
        </ChatScroll>
        {chatError && <p className="px-3 py-1 text-xs text-destructive">{chatError}</p>}
        <div className="flex gap-2 border-t p-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Message the bot…"
            disabled={sending}
          />
          <Button type="button" onClick={() => void send()} disabled={sending || !input.trim()}>Send</Button>
        </div>
      </div>

      {/* Right: saved scenarios */}
      <div className="lg:col-span-1 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Saved scenarios ({pairs.length})</h3>
          {dirty && <span className="text-xs text-amber-600">Unsaved</span>}
        </div>
        {pairs.length === 0 && (
          <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
            No trained scenarios yet. Correct a bot reply on the left, or add one below.
          </p>
        )}
        <div className="space-y-3">
          {pairs.map((p) => (
            <div key={p.id} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={p.enabled} onCheckedChange={(v) => patchPair(p.id, { enabled: v })} />
                  Enabled
                </label>
                <Button type="button" variant="ghost" size="sm" onClick={() => removePair(p.id)}>Remove</Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Scenario</Label>
                <Input value={p.scenario} onChange={(e) => patchPair(p.id, { scenario: e.target.value })} placeholder="what is your price" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reply</Label>
                <Textarea rows={2} value={p.reply} onChange={(e) => patchPair(p.id, { reply: e.target.value })} placeholder="What to say in this scenario" />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={!!p.exact} onCheckedChange={(v) => patchPair(p.id, { exact: v })} />
                Say exactly (verbatim)
              </label>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addPair}>+ Add scenario</Button>
        {saveError && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{saveError}</p>}
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => void saveTraining()} disabled={saving}>
            {saving ? "Saving…" : "Save training"}
          </Button>
          {saved && <span className="text-xs text-green-600">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}
