"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChatScroll } from "@/components/dashboard/chat-scroll";
import { MessageBubble } from "@/components/dashboard/message-bubble";
import type { Chatbot, TrainingPair } from "@/lib/types";
import type { KeywordPreviewPlan, PreviewItem } from "@/lib/trainer-preview";
import {
  isUsableTrainingPair,
  trainedResponsesTokens,
  MAX_TRAINING_PAIRS,
  MAX_SCENARIO_CHARS,
  MAX_TRAINED_REPLY_CHARS,
} from "@/lib/training";

/** Per-reply diagnostics from the preview route - surfaces WHY a reply looked off
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
  /** What the lead would receive, in order: separate DMs, link flows, media. */
  items?: PreviewItem[];
  keyword?: KeywordPreviewPlan;
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
 * Bot Trainer: a live sandbox chat (left) + the saved corrections (right).
 *
 * Correcting a sandbox reply SAVES AT ONCE (POST /api/chatbots/[id]/training-pairs),
 * like "Correct this reply" in Conversations - there is no separate step to forget.
 * Editing the list on the right is saved with "Save training" (PUT), which the
 * server refuses if the stored list changed since this tab loaded it, so a stale
 * tab can never drop a correction added elsewhere. The sandbox transcript is
 * ephemeral; the working list is sent as trainingPairsOverride so edits can be
 * tried before saving. Replies are shown as the lead would get them: separate
 * DMs, link and media sends, and keyword triggers applied as they are live.
 */
export function BotTrainer({ chatbot }: { chatbot: Chatbot }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  // Keyword groups that already fired in THIS test chat, so a repeat behaves like one.
  const [keywordFired, setKeywordFired] = useState<string[]>([]);

  const [pairs, setPairs] = useState<TrainingPair[]>(toEditable(chatbot.training_pairs));
  // The stored list as last seen: sent with Save so the server can refuse a stale save.
  const [base, setBase] = useState<unknown>(Array.isArray(chatbot.training_pairs) ? chatbot.training_pairs : []);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftScenario, setDraftScenario] = useState<Record<string, string>>({});
  const [draftExact, setDraftExact] = useState<Record<string, boolean>>({});
  const [openDraft, setOpenDraft] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [savedCorrection, setSavedCorrection] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Unsaved list edits: warn before the tab closes or reloads.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const atCap = pairs.length >= MAX_TRAINING_PAIRS;
  const tokens = trainedResponsesTokens(pairs);

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
        body: JSON.stringify({
          userMessage: text,
          history,
          trainingPairsOverride: pairs.filter((p) => p.enabled),
          keywordFired,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || typeof j?.text !== "string") {
        setChatError(j?.error ?? "The bot couldn't reply - try again.");
      } else {
        const kw = j.keyword as KeywordPreviewPlan | undefined;
        if (kw && "fires" in kw && kw.fires) {
          setKeywordFired((f) => (f.includes(kw.groupId) ? f : [...f, kw.groupId]));
        }
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: j.text,
            created_at: new Date().toISOString(),
            diag: j.diag,
            items: Array.isArray(j.items) ? j.items : undefined,
            keyword: kw,
          },
        ]);
      }
    } catch {
      setChatError("Network error - try again.");
    }
    setSending(false);
  }

  function precedingUser(assistantId: string): string {
    const idx = messages.findIndex((m) => m.id === assistantId);
    for (let i = idx - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
    return "";
  }

  /** Save one correction right away (the sandbox's "Train this reply"). */
  async function saveCorrection(assistantId: string, botReply: string) {
    const reply = (drafts[assistantId] ?? "").trim();
    // Scenario defaults to the preceding user message but is editable - and
    // REQUIRED, so a correction on a first message can't be saved without one.
    const scenario = (draftScenario[assistantId] ?? precedingUser(assistantId)).trim();
    if (!reply || !scenario || draftSaving) return;
    setDraftSaving(assistantId);
    setDraftError(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbot.id}/training-pairs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: { scenario, reply, bad_reply: botReply, exact: !!draftExact[assistantId], enabled: true },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.pair) {
        setDraftError((data && data.error) || "Could not save the correction.");
        return;
      }
      // Keep any unsaved edits on the right; add the saved correction; remember
      // the stored list so a later Save of those edits is not refused.
      setPairs((prev) => [...prev, ...toEditable([data.pair])]);
      setBase(data.pairs);
      setDrafts((d) => ({ ...d, [assistantId]: "" }));
      setDraftScenario((d) => ({ ...d, [assistantId]: "" }));
      setDraftExact((d) => ({ ...d, [assistantId]: false }));
      setOpenDraft(null);
      setSavedCorrection(assistantId);
    } catch {
      setDraftError("Network error - try again.");
    } finally {
      setDraftSaving(null);
    }
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
    if (atCap) return;
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
    try {
      const res = await fetch(`/api/chatbots/${chatbot.id}/training-pairs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: cleaned, base }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError((data && data.error) || "Couldn't save your corrections. Nothing was changed.");
        return;
      }
      setBase(data.pairs);
      setSaved(true);
      setDirty(false);
      router.refresh();
    } catch {
      setSaveError("Network error - nothing was saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Enabled pairs missing a scenario or reply - dropped on save and unused at reply
  // time, so surface them instead (the "my edit did nothing" trap).
  const incompleteEnabled = pairs.filter(
    (p) => p.enabled && !(p.scenario.trim() && p.reply.trim())
  ).length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Left: sandbox chat */}
      <div className="lg:col-span-2 flex flex-col rounded-md border min-h-[28rem]">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            Test chat - shown as Instagram delivers it (nothing here is saved to your inbox)
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMessages([]);
              setOpenDraft(null);
              setKeywordFired([]);
              setSavedCorrection(null);
            }}
          >
            Reset chat
          </Button>
        </div>
        <ChatScroll className="flex-1 min-h-0 p-4 space-y-3" count={messages.length}>
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Message the bot as a lead would. Replies show up the way a lead gets them. Use &ldquo;Train this reply&rdquo; under any bot message to teach it what to say instead.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="space-y-1">
              {m.role === "assistant" && m.keyword && <KeywordNote plan={m.keyword} />}
              {m.role === "assistant" && m.items && m.items.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {m.items.map((it, k) => (
                    <PreviewItemView key={k} item={it} message={m} index={k} />
                  ))}
                </div>
              ) : (
                <MessageBubble message={m} />
              )}
              {m.role === "assistant" && m.diag && <DiagLine diag={m.diag} />}
              {m.role === "assistant" && savedCorrection === m.id && (
                <p role="status" className="text-right text-[11px] text-ss-green-ink">
                  Correction saved. The bot uses it from its next reply.
                </p>
              )}
              {m.role === "assistant" && m.keyword?.kind !== "canned" && (
                <div className="flex justify-end">
                  <div className="w-[75%]">
                    {openDraft === m.id ? (
                      <div className="space-y-2 rounded-md border bg-background p-2">
                        <Label htmlFor={`corr-scen-${m.id}`} className="text-xs">
                          When a lead says something like
                        </Label>
                        <Input
                          id={`corr-scen-${m.id}`}
                          value={draftScenario[m.id] ?? precedingUser(m.id)}
                          onChange={(e) => setDraftScenario((d) => ({ ...d, [m.id]: e.target.value }))}
                          maxLength={MAX_SCENARIO_CHARS}
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
                          maxLength={MAX_TRAINED_REPLY_CHARS}
                          placeholder="What should it have said here?"
                        />
                        {draftError && openDraft === m.id && (
                          <p role="alert" className="text-xs text-destructive">{draftError}</p>
                        )}
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
                                draftSaving !== null ||
                                !(drafts[m.id] ?? "").trim() ||
                                !(draftScenario[m.id] ?? precedingUser(m.id)).trim()
                              }
                              onClick={() => void saveCorrection(m.id, m.content)}
                            >
                              {draftSaving === m.id ? "Saving…" : "Save correction"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          disabled={atCap}
                          title={atCap ? `This bot already has ${MAX_TRAINING_PAIRS} corrections.` : undefined}
                          onClick={() => {
                            setDraftError(null);
                            setOpenDraft(m.id);
                          }}
                        >
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

      {/* Right: saved corrections */}
      <div className="lg:col-span-1 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            Saved corrections ({pairs.length} of {MAX_TRAINING_PAIRS})
          </h3>
          {dirty && <span className="text-xs text-ss-amber-soft">Unsaved</span>}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          When a lead&rsquo;s message matches a situation below, the bot answers with that reply. It takes precedence over the knowledge base for that situation. Corrections you make in the chat, or from Conversations, save at once; edits to this list need <strong>Save training</strong>.
        </p>
        {tokens > 0 && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            These corrections add about {tokens.toLocaleString()} tokens to every reply the bot sends.
          </p>
        )}
        {pairs.length === 0 && (
          <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
            No corrections yet. Correct a bot reply on the left or in Conversations, or add one below.
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
                <Label className="text-xs">When a lead says something like</Label>
                <Input
                  value={p.scenario}
                  onChange={(e) => patchPair(p.id, { scenario: e.target.value })}
                  maxLength={MAX_SCENARIO_CHARS}
                  placeholder="what is your price"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reply</Label>
                <Textarea
                  rows={2}
                  value={p.reply}
                  onChange={(e) => patchPair(p.id, { reply: e.target.value })}
                  maxLength={MAX_TRAINED_REPLY_CHARS}
                  placeholder="What to say in this situation"
                />
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
              {p.enabled && !isUsableTrainingPair(p) && (
                <p className="text-[11px] text-ss-amber-soft">
                  Needs both a situation and a reply to take effect.
                </p>
              )}
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addPair} disabled={atCap}>
          + Add correction
        </Button>
        {atCap && (
          <p className="text-[11px] text-muted-foreground">
            That&rsquo;s the most a bot can use ({MAX_TRAINING_PAIRS}). Remove ones you no longer need to add more.
          </p>
        )}
        {incompleteEnabled > 0 && (
          <p className="rounded bg-ss-amber-bg px-2 py-1 text-xs text-ss-amber-ink">
            {incompleteEnabled} enabled correction{incompleteEnabled === 1 ? "" : "s"} {incompleteEnabled === 1 ? "is" : "are"} missing a situation or reply - they won&rsquo;t be saved or used until both are filled.
          </p>
        )}
        {saveError && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{saveError}</p>}
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => void saveTraining()} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save training"}
          </Button>
          {saved && <span className="text-xs text-ss-green">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}

/** One piece of the reply as the lead gets it: a DM bubble, a link flow, or media. */
function PreviewItemView({ item, message, index }: { item: PreviewItem; message: ChatMsg; index: number }) {
  if (item.kind === "text") {
    return (
      <MessageBubble
        message={{ id: `${message.id}-${index}`, role: "assistant", content: item.text, created_at: message.created_at }}
      />
    );
  }
  if (item.kind === "flow") {
    return (
      <p className="self-end rounded-full border px-3 py-1 text-[11px] text-muted-foreground">
        Sends your link: {item.name}
      </p>
    );
  }
  return item.found ? (
    <p className="self-end rounded-full border px-3 py-1 text-[11px] text-muted-foreground">
      Sends {item.mediaKind ?? "file"}: {item.label || item.key}
    </p>
  ) : (
    <p className="self-end max-w-[80%] rounded-md bg-ss-amber-bg px-3 py-1.5 text-[11px] text-ss-amber-ink">
      Tries to send &ldquo;{item.key}&rdquo;, but no file with that key is on the Media tab, so a lead gets nothing here.
    </p>
  );
}

/** How a keyword trigger changes this reply, as it would live. */
function KeywordNote({ plan }: { plan: KeywordPreviewPlan }) {
  if (plan.kind === "none" || plan.kind === "ai") return null;
  const words = "keywords" in plan && plan.keywords.length ? ` (${plan.keywords.join(", ")})` : "";
  const text =
    plan.kind === "gated"
      ? plan.questionsMayPass
        ? "In a real DM from someone who hasn't used one of your keywords yet, this bot replies only if the message is a genuine question about your business (checked live). Below is what it says when it does reply."
        : "In a real DM from someone who hasn't used one of your keywords yet, this bot doesn't reply at all (keyword-only mode). Below is what it says to a lead who already has."
      : plan.kind === "canned"
        ? `Your keyword trigger${words} answers this message, not the AI. Corrections here don't change it; edit that reply on the Keywords tab.`
        : `Your keyword trigger${words} adds its instruction to this reply.`;
  return (
    <p className="self-end max-w-[80%] rounded-md bg-ss-amber-bg px-3 py-1.5 text-[11px] leading-snug text-ss-amber-ink">
      {text}
    </p>
  );
}

/** Compact per-reply diagnostics shown under a bot message in the sandbox, so the
 *  owner can SEE why a reply looked off - an empty KB is the usual "ignores my
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
          <div className="text-ss-amber-soft">
            ⚠ The bot got NO knowledge base for this message
            {diag.kbMode === "retrieval"
              ? " (nothing matched) - it can only use the persona/prompt and any trained scenarios."
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
