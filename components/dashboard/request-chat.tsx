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
import type { ChangeProposal } from "@/lib/types";
import { Sparkles, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type CrStatus = "draft" | "pending" | "approved" | "applied" | "rejected";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: { name: string; url: string | null }[];
  files?: { name: string }[];
};

export function RequestChat({
  changeRequestId,
  chatbotId,
  projectName,
  greeting,
  initialTranscript,
  initialProposal,
  initialStatus,
  hasProjects,
}: {
  changeRequestId: string | null;
  chatbotId: string | null;
  projectName: string | null;
  greeting: string;
  initialTranscript: ChatMessage[];
  initialProposal: ChangeProposal | null;
  initialStatus: CrStatus | null;
  hasProjects: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [messages, setMessages] = useState<ChatMessage[]>(initialTranscript);
  const [crId, setCrId] = useState<string | null>(changeRequestId);
  const [proposal, setProposal] = useState<ChangeProposal | null>(initialProposal);
  const [status, setStatus] = useState<CrStatus | null>(initialStatus);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const decided = status !== null && status !== "draft";
  const noProject = !chatbotId;
  const empty = messages.length === 0;

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

    // 1. Optimistically append the user's message with local image previews + doc names.
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
          message,
          images: attachments.images.length ? attachments.images : undefined,
          files: attachments.files.length ? attachments.files : undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // 502/error: keep the optimistic user message so the client can retry.
        setError((data && data.error) || "The assistant is unavailable right now. Please try again.");
        setSending(false);
        return;
      }

      // Append the assistant's reply (last transcript entry) so local previews persist.
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
          // Make the URL deep-linkable + refresh the rail's History list.
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
          {projectName && (
            <p className="truncate text-xs text-muted-foreground">Project: {projectName}</p>
          )}
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
                  <CardDescription>What the SpeedSettr team will review.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-wrap break-words text-sm">{proposal.summary}</p>

                  {proposal.system_prompt && proposal.system_prompt.trim() && (
                    <div className="rounded-md border bg-muted/40">
                      <button
                        type="button"
                        onClick={() => setShowPrompt((v) => !v)}
                        aria-expanded={showPrompt}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      >
                        New system prompt
                        {showPrompt ? (
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                      {showPrompt && (
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t px-3 py-2 text-xs">
                          {proposal.system_prompt}
                        </pre>
                      )}
                    </div>
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

            {/* Submit / decided states */}
            {proposal && status === "draft" && (
              <div className="flex flex-col items-start gap-2">
                <Button size="lg" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit to team"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Keep chatting to refine it, or submit when you&apos;re happy.
                </p>
              </div>
            )}
            {status === "pending" && (
              <p className="rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">
                Submitted — the SpeedSettr team will review it.
              </p>
            )}
            {decided && status !== "pending" && (
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
                  : "Describe the change you'd like…"
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
