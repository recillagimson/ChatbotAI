"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChatScroll } from "@/components/dashboard/chat-scroll";
import { MessageBubble } from "@/components/dashboard/message-bubble";
import type { Chatbot, TrainingPair } from "@/lib/types";
import { isUsableTrainingPair } from "@/lib/training";

/** Per-reply diagnostics from the preview route — surfaces WHY a reply looked off
 *  (empty KB, which prompt path, how many corrections applied). */
type Diag = {
  promptMode: string;
  kbMode: string;
  kbChunks: number;
  kbTopSimilarity: number | null;
  kbChars: number;
  kbEmpty: boolean;
  trainingTotal: number;
  trainingActive: number;
  trainingSkipped: number;
};
type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  diag?: Diag;
};

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
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [pairs, setPairs] = useState<TrainingPair[]>(toEditable(chatbot.training_pairs));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftScenario, setDraftScenario] = useState<Record<string, string>>({});
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
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: j.text, created_at: new Date().toISOString(), diag: j.diag }]);
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
    // Scenario defaults to the preceding user message but is editable — and
    // REQUIRED, so a correction on a first message (no preceding user text) can't
    // be minted with a blank scenario that would be silently dropped on save.
    const scenario = (draftScenario[assistantId] ?? precedingUser(assistantId)).trim();
    if (!reply || !scenario) return;
    setPairs((prev) => [
      ...prev,
      {
        id: newId(),
        scenario,
        reply,
        bad_reply: botReply,
        exact: !!draftExact[assistantId],
        note: null,
        enabled: true,
      },
    ]);
    setDrafts((d) => ({ ...d, [assistantId]: "" }));
    setDraftScenario((d) => ({ ...d, [assistantId]: "" }));
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
    // .select() so a 0-row write (RLS/permission, wrong bot) is DETECTED instead of
    // silently showing "Saved ✓". router.refresh() reconciles the server data.
    const { data, error } = await supabase
      .from("chatbots")
      .update({ training_pairs: cleaned })
      .eq("id", chatbot.id)
      .select("id");
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setSaveError(
        "Couldn't save — the change didn't reach the database (you may not have permission on this bot). Nothing was saved."
      );
      return;
    }
    setSaved(true);
    setDirty(false);
    router.refresh();
  }

  // Enabled pairs missing a scenario or reply — silently dropped on save/at reply
  // time, so surface them instead (the "my edit did nothing" trap).
  const incompleteEnabled = pairs.filter(
    (p) => p.enabled && !(p.scenario.trim() && p.reply.trim())
  ).length;

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
              {m.role === "assistant" && m.diag && <DiagLine diag={m.diag} />}
              {m.role === "assistant" && (
                <div className="flex justify-end">
                  <div className="w-[75%]">
                    {openDraft === m.id ? (
                      <div className="space-y-2 rounded-md border bg-background p-2">
                        <Label htmlFor={`corr-scen-${m.id}`} className="text-xs">
                          When the contact says (scenario)
                        </Label>
                        <Input
                          id={`corr-scen-${m.id}`}
                          value={draftScenario[m.id] ?? precedingUser(m.id)}
                          onChange={(e) => setDraftScenario((d) => ({ ...d, [m.id]: e.target.value }))}
                          placeholder="what is your price"
                        />
                        <Label htmlFor={`corr-${m.id}`} className="text-xs">
                          Reply instead
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
                            Say exactly (word for word)
                          </label>
                          <div className="flex gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setOpenDraft(null)}>Cancel</Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                !(drafts[m.id] ?? "").trim() ||
                                !(draftScenario[m.id] ?? precedingUser(m.id)).trim()
                              }
                              onClick={() => saveCorrection(m.id, m.content)}
                            >
                              Add
                            </Button>
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
        <p className="text-[11px] leading-snug text-muted-foreground">
          When a contact&rsquo;s message matches a Scenario, the bot answers with that Reply — it takes precedence over the knowledge base for that scenario. Click <strong>Save training</strong> to apply it to the live bot.
        </p>
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
                Say exactly (word for word)
              </label>
              <p className="text-[11px] text-muted-foreground">
                {p.exact
                  ? "Sends this reply word for word."
                  : "Keeps your wording and facts, said in the bot's own voice."}
              </p>
              {p.enabled && !(p.scenario.trim() && p.reply.trim()) && (
                <p className="text-[11px] text-amber-700 dark:text-amber-500">
                  Needs both a Scenario and a Reply to take effect.
                </p>
              )}
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addPair}>+ Add scenario</Button>
        {incompleteEnabled > 0 && (
          <p className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-500">
            {incompleteEnabled} enabled scenario{incompleteEnabled === 1 ? "" : "s"} {incompleteEnabled === 1 ? "is" : "are"} missing a Scenario or Reply — they won&rsquo;t be saved or used until both are filled.
          </p>
        )}
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

/** Compact per-reply diagnostics shown under a bot message in the sandbox, so the
 *  owner can SEE why a reply looked off — an empty KB is the usual "ignores my
 *  knowledge base" culprit. */
function DiagLine({ diag }: { diag: Diag }) {
  const kbEmpty = diag.kbEmpty;
  const sim =
    diag.kbTopSimilarity != null ? ` · top match ${Math.round(diag.kbTopSimilarity * 100)}%` : "";
  return (
    <div className="flex justify-start pl-1">
      <div className="max-w-[80%] space-y-0.5 text-[11px] leading-tight text-muted-foreground">
        <div>
          KB: {diag.kbMode}
          {diag.kbMode === "retrieval"
            ? ` · ${diag.kbChunks} chunk${diag.kbChunks === 1 ? "" : "s"} matched`
            : ""}
          {` · ${diag.kbChars} chars sent`}
          {sim}
        </div>
        {kbEmpty && (
          <div className="text-amber-600 dark:text-amber-500">
            ⚠ The bot got NO knowledge base for this message
            {diag.kbMode === "retrieval"
              ? " (nothing matched) — it can only use the persona/prompt and any trained scenarios."
              : "."}
          </div>
        )}
        <div>
          Prompt: {diag.promptMode} · Corrections: {diag.trainingActive} active
          {diag.trainingSkipped > 0
            ? ` · ${diag.trainingSkipped} skipped (missing scenario or reply)`
            : ""}
        </div>
      </div>
    </div>
  );
}
