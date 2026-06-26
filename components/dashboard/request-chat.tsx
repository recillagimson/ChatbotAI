"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ChatScroll } from "@/components/dashboard/chat-scroll";
import { RequestComposer } from "@/components/dashboard/request-composer";
import { CATEGORY_LABELS } from "@/lib/change-categories";
import type { ChangeCategory, ChangeProposal } from "@/lib/types";
import { Sparkles, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type CrStatus = "draft" | "pending" | "approved" | "applied" | "rejected";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: { name: string; url: string | null }[];
  files?: { name: string }[];
};

const CATEGORY_ORDER: ChangeCategory[] = ["personality", "offers", "rebuttals", "other"];
const CATEGORY_BLURB: Record<ChangeCategory, string> = {
  personality: "The bot's voice and tone. Applies instantly — no team review.",
  offers: "Services, packages, inclusions/exclusions, prices, links. Team-reviewed.",
  rebuttals: "How the bot handles objections and FAQs. Team-reviewed.",
  other: "Add facts to the knowledge base. Team-reviewed.",
};

export function RequestChat({
  changeRequestId,
  chatbotId,
  projectName,
  greeting,
  initialTranscript,
  initialProposal,
  initialStatus,
  initialCategory,
  currentSection,
  hasProjects,
}: {
  changeRequestId: string | null;
  chatbotId: string | null;
  projectName: string | null;
  greeting: string;
  initialTranscript: ChatMessage[];
  initialProposal: ChangeProposal | null;
  initialStatus: CrStatus | null;
  initialCategory: ChangeCategory;
  currentSection: string;
  hasProjects: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [messages, setMessages] = useState<ChatMessage[]>(initialTranscript);
  const [crId, setCrId] = useState<string | null>(changeRequestId);
  const [proposal, setProposal] = useState<ChangeProposal | null>(initialProposal);
  const [status, setStatus] = useState<CrStatus | null>(initialStatus);
  const [category, setCategory] = useState<ChangeCategory>(initialCategory);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [applying, setApplying] = useState(false);

  const decided = status !== null && status !== "draft";
  const noProject = !chatbotId;
  const empty = messages.length === 0;
  // Category is fixed once the thread exists (a message has been sent).
  const categoryLocked = !empty || crId !== null;
  const isPersonality = category === "personality";

  async function handleSend(
    message: string,
    attachments: {
      images: { path: string; name: string }[];
      files: { path: string; name: string; type: string }[];
    },
    localPreviews: { images: { name: string; url: string }[]; fileNames: string[] }
  ) {
    if (!chatbotId) return;
    setError(null);
    setSending(true);

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: message,
        ...(localPreviews.images.length ? { images: localPreviews.images } : {}),
        ...(localPreviews.fileNames.length
          ? { files: localPreviews.fileNames.map((name) => ({ name })) }
          : {}),
      },
    ]);

    try {
      const res = await fetch("/api/change-requests/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatbot_id: chatbotId,
          change_request_id: crId ?? undefined,
          category, // honored only on a NEW thread; ignored for an existing one
          message,
          images: attachments.images.length ? attachments.images : undefined,
          files: attachments.files.length ? attachments.files : undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError((data && data.error) || "The assistant is unavailable right now. Please try again.");
        setSending(false);
        return;
      }

      const serverTranscript: { role: "user" | "assistant"; content: string }[] =
        data?.transcript ?? [];
      const lastAssistant = [...serverTranscript].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) {
        setMessages((prev) => [...prev, { role: "assistant", content: lastAssistant.content }]);
      }

      if (data?.proposal) setProposal(data.proposal as ChangeProposal);

      const newId: string | undefined = data?.id;
      if (newId) {
        setStatus((s) => s ?? "draft");
        if (!crId) {
          setCrId(newId);
          router.replace(`/requests?id=${newId}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit() {
    if (!crId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/change-requests/${crId}/submit`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Could not submit your request.");
        setSubmitting(false);
        return;
      }
      setStatus("pending");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApply() {
    if (!crId || applying) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/change-requests/${crId}/apply`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Could not apply the change.");
        setApplying(false);
        return;
      }
      setStatus("applied");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the change.");
    } finally {
      setApplying(false);
    }
  }

  const hint = noProject
    ? "Pick a project on the left to start."
    : `Tell me what you'd like to change about ${projectName ?? "your bot"} — you can type, attach a screenshot or knowledge file (PDF/DOCX/TXT), or use the mic.`;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b px-6 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Request Changes
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {projectName ? `Project: ${projectName}` : "Pick a project to start"}
            {categoryLocked && <> · {CATEGORY_LABELS[category]}</>}
          </p>
        </div>
        {status && <StatusBadge status={status} />}
      </header>

      {empty ? (
        // New / greeting state
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {greeting}
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">{hint}</p>

          {!noProject && (
            <div className="mt-8 w-full max-w-xl text-left">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What do you want to change?
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CATEGORY_ORDER.map((c) => {
                  const active = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <span className="block text-sm font-medium">{CATEGORY_LABELS[c]}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {CATEGORY_BLURB[c]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Thread state
        <ChatScroll className="flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5 text-sm">
                    {m.images && m.images.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {m.images.map((im, j) =>
                          im.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={j}
                              src={im.url}
                              alt={`Attached image: ${im.name}`}
                              className="h-24 w-24 rounded-lg border object-cover"
                            />
                          ) : (
                            <span
                              key={j}
                              className="inline-flex h-24 items-center rounded-lg border bg-muted px-3 text-xs text-muted-foreground"
                            >
                              {im.name}
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {m.files && m.files.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {m.files.map((f, j) => (
                          <span
                            key={j}
                            className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-lg border bg-muted px-2.5 py-1.5 text-xs text-muted-foreground"
                            title={f.name}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{f.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="flex max-w-[90%] gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                    >
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="whitespace-pre-wrap break-words pt-1 text-sm leading-relaxed">
                      {m.content}
                    </div>
                  </div>
                </div>
              )
            )}

            {sending && (
              <div className="flex justify-start" aria-live="polite">
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="inline-flex gap-1">
                    Thinking
                    <span className="motion-safe:animate-pulse">…</span>
                  </span>
                </div>
              </div>
            )}

            {/* Proposal summary */}
            {proposal && (
              <Card className="border-primary/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Proposed change</CardTitle>
                  <CardDescription>
                    {isPersonality
                      ? "Review the before & after, then apply it to your bot."
                      : "What the SpeedSettr team will review."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-wrap break-words text-sm">{proposal.summary}</p>

                  {/* Section change → before / after. */}
                  {proposal.section_content && proposal.section_content.trim() && (
                    <BeforeAfter
                      label={CATEGORY_LABELS[category]}
                      before={currentSection}
                      after={proposal.section_content}
                    />
                  )}

                  {/* Legacy proposals (old shape) still show the system prompt. */}
                  {!proposal.section_content && proposal.system_prompt && proposal.system_prompt.trim() && (
                    <BeforeAfter label="System prompt" before="" after={proposal.system_prompt} />
                  )}

                  {proposal.kb_entries && proposal.kb_entries.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        New knowledge entries
                      </p>
                      <ul className="space-y-1 text-sm">
                        {proposal.kb_entries.map((kb, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span aria-hidden="true" className="mt-1 text-primary">
                              •
                            </span>
                            <span className="break-words">{kb.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Apply (personality) / Submit (everything else) / decided states */}
            {proposal && status === "draft" && (
              <div className="flex flex-col items-start gap-2">
                {isPersonality ? (
                  <>
                    <Button size="lg" onClick={handleApply} disabled={applying}>
                      {applying ? "Applying…" : "Apply now"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Personality changes go live on your bot right away — no team review needed.
                    </p>
                  </>
                ) : (
                  <>
                    <Button size="lg" onClick={handleSubmit} disabled={submitting}>
                      {submitting ? "Submitting…" : "Submit to team"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Keep chatting to refine it, or submit when you&apos;re happy.
                    </p>
                  </>
                )}
              </div>
            )}
            {status === "pending" && (
              <p className="rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">
                Submitted — the SpeedSettr team will review it.
              </p>
            )}
            {status === "applied" && (
              <p className="rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">
                Applied — this change is live on your bot. Start a new request to make more changes.
              </p>
            )}
            {decided && status !== "pending" && status !== "applied" && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                This request is {STATUS_LABEL[status as CrStatus].toLowerCase()}. Start a new request
                to make more changes.
              </p>
            )}
          </div>
        </ChatScroll>
      )}

      {/* Composer */}
      <div className="border-t px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {error && (
            <p role="alert" className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <RequestComposer
            disabled={noProject || decided}
            sending={sending}
            onSend={handleSend}
            placeholder={
              noProject
                ? "Pick a project on the left to start."
                : decided
                  ? "This request is closed."
                  : `Describe the ${CATEGORY_LABELS[category].toLowerCase()} change you'd like…`
            }
          />
          {!hasProjects && (
            <p className="mt-2 text-xs text-muted-foreground">
              Create a chatbot first to request changes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Side-by-side (stacked on mobile) before/after of a section's text. */
function BeforeAfter({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label} — before &amp; after
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border bg-muted/40">
          <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">Before</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-xs text-muted-foreground">
            {before.trim() || "(empty)"}
          </pre>
        </div>
        <div className="rounded-md border border-primary/30 bg-primary/5">
          <p className="border-b border-primary/20 px-3 py-1.5 text-xs font-medium text-primary">After</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-xs">
            {after}
          </pre>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<CrStatus, string> = {
  draft: "Draft",
  pending: "In review",
  approved: "Approved",
  applied: "Applied",
  rejected: "Rejected",
};

function StatusBadge({ status }: { status: CrStatus }) {
  const map: Record<CrStatus, "secondary" | "warning" | "success" | "destructive"> = {
    draft: "secondary",
    pending: "warning",
    approved: "warning",
    applied: "success",
    rejected: "destructive",
  };
  return (
    <Badge variant={map[status]} className={cn("shrink-0")}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
