"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { ChangeRequest } from "@/lib/types";

type Action = "approve" | "reject" | "regenerate" | "publish";

type EditableKbEntry = { title: string; content: string; include: boolean };

export function ChangeRequestReview({
  request,
  chatbot,
  clientEmail,
  transcript,
}: {
  request: ChangeRequest;
  chatbot: { id: string; name: string; system_prompt: string | null };
  clientEmail: string | null;
  transcript: {
    role: "user" | "assistant";
    content: string;
    images?: { name: string; url: string | null }[];
  }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [systemPrompt, setSystemPrompt] = useState(
    request.proposed?.system_prompt ?? chatbot.system_prompt ?? ""
  );
  const [kbEntries, setKbEntries] = useState<EditableKbEntry[]>(
    (request.proposed?.kb_entries ?? []).map((e) => ({ ...e, include: true }))
  );
  const [adminNote, setAdminNote] = useState(request.admin_note ?? "");
  const [guidance, setGuidance] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = request.status;
  const readOnly = status === "applied" || status === "rejected";

  function updateEntry(index: number, patch: Partial<EditableKbEntry>) {
    setKbEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...patch } : e))
    );
  }

  async function run(action: Action, payload: Record<string, unknown>) {
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/change-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Something went wrong. Try again.");
        setBusy(null);
        return;
      }
      // The server re-renders with the new status; the component re-initializes
      // from fresh props.
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function handleApprove() {
    run("approve", {
      system_prompt: systemPrompt.trim() || undefined,
      kb_entries: kbEntries
        .filter((e) => e.include)
        .map(({ title, content }) => ({ title, content })),
      admin_note: adminNote || undefined,
    });
  }

  function handleReject() {
    run("reject", { admin_note: adminNote || undefined });
  }

  function handleRegenerate() {
    run("regenerate", { adminGuidance: guidance || undefined });
  }

  function handlePublish() {
    if (
      !window.confirm(
        "Publish to the live bot now? This changes what the client's bot says."
      )
    ) {
      return;
    }
    run("publish", {});
  }

  return (
    <div className="space-y-6">
      {/* 0. Reviewer reminder (color + text) */}
      <div
        role="note"
        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
      >
        <span className="font-medium">Reminder:</span> Review the full
        conversation below before publishing — an approved + published change
        goes live on the client&apos;s bot.
      </div>

      {/* 0b. Conversation (client ↔ assistant transcript + attachments) */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No conversation captured (submitted directly).
            </p>
          ) : (
            transcript.map((m, i) => {
              const isClient = m.role === "user";
              return (
                <div
                  key={i}
                  className={isClient ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      isClient
                        ? "max-w-[85%] rounded-lg border bg-muted/50 px-3 py-2"
                        : "max-w-[85%] rounded-lg border bg-background px-3 py-2"
                    }
                  >
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {isClient ? "Client" : "Assistant"}
                    </p>
                    {m.content && (
                      <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                    )}
                    {m.images && m.images.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.images.map((img, j) =>
                          img.url ? (
                            <a
                              key={j}
                              href={img.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.url}
                                alt={img.name}
                                className="max-h-32 rounded border"
                              />
                            </a>
                          ) : (
                            <span
                              key={j}
                              className="text-xs text-muted-foreground"
                            >
                              {img.name} (unavailable)
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* 1. Client request (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle>Client request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-wrap text-sm">{request.request_text}</p>
          <p className="text-xs text-muted-foreground">
            from {clientEmail ?? "unknown client"}
          </p>
          {request.proposed?.summary && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="font-medium">AI summary:</span>{" "}
              {request.proposed.summary}
            </p>
          )}
          {request.draft_error && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The AI draft failed: {request.draft_error} — use Regenerate.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Proposed system prompt */}
      <Card>
        <CardHeader>
          <CardTitle>Proposed system prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="proposed-system-prompt" className="sr-only">
            Proposed system prompt
          </Label>
          <Textarea
            id="proposed-system-prompt"
            rows={14}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            disabled={readOnly}
          />
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Current live prompt
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs">
              {chatbot.system_prompt || "(none — generic mode)"}
            </pre>
          </details>
        </CardContent>
      </Card>

      {/* 3. Knowledge-base additions */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge-base additions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {kbEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No new knowledge-base entries proposed.
            </p>
          ) : (
            <>
              {kbEntries.map((entry, i) => (
                <div
                  key={i}
                  className="space-y-3 rounded-md border p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`kb-title-${i}`} className="text-sm">
                      Entry {i + 1}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`kb-include-${i}`}
                        className="text-xs text-muted-foreground"
                      >
                        Include
                      </Label>
                      <Switch
                        id={`kb-include-${i}`}
                        checked={entry.include}
                        onCheckedChange={(checked) =>
                          updateEntry(i, { include: checked })
                        }
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                  <Input
                    id={`kb-title-${i}`}
                    aria-label={`Entry ${i + 1} title`}
                    value={entry.title}
                    onChange={(e) => updateEntry(i, { title: e.target.value })}
                    disabled={readOnly || !entry.include}
                  />
                  <Textarea
                    id={`kb-content-${i}`}
                    aria-label={`Entry ${i + 1} content`}
                    rows={5}
                    value={entry.content}
                    onChange={(e) =>
                      updateEntry(i, { content: e.target.value })
                    }
                    disabled={readOnly || !entry.include}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Only included entries are published.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4. Team note */}
      <Card>
        <CardHeader>
          <CardTitle>Team note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="admin-note" className="sr-only">
            Team note
          </Label>
          <Textarea
            id="admin-note"
            rows={3}
            placeholder="Optional note shown to the client when applied or rejected."
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            Shown to the client on applied / rejected requests.
          </p>
        </CardContent>
      </Card>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* 5. Actions (gated by status) */}
      {status === "pending" && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                size="lg"
                onClick={handleApprove}
                disabled={busy !== null}
              >
                {busy === "approve" ? "Approving…" : "Approve"}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="destructive"
                onClick={handleReject}
                disabled={busy !== null}
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </Button>
            </div>
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="guidance">Regenerate the draft (optional guidance)</Label>
              <div className="flex flex-wrap gap-3">
                <Input
                  id="guidance"
                  placeholder="e.g. keep it shorter, mention the new hours"
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  disabled={busy !== null}
                  className="max-w-md"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={busy !== null}
                >
                  {busy === "regenerate"
                    ? "Regenerating…"
                    : "Regenerate with Sonnet"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "approved" && (
        <Card>
          <CardHeader>
            <CardTitle>Approved</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              Approved — not live yet. Publish to apply these changes to the
              client&apos;s bot.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                size="lg"
                onClick={handlePublish}
                disabled={busy !== null}
              >
                {busy === "publish" ? "Publishing…" : "Publish to live bot"}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={handleApprove}
                disabled={busy !== null}
              >
                {busy === "approve" ? "Saving…" : "Re-approve (save edits)"}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="destructive"
                onClick={handleReject}
                disabled={busy !== null}
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "applied" && (
        <Card>
          <CardHeader>
            <CardTitle>Applied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              Applied
              {request.applied_at
                ? ` ${new Date(request.applied_at).toLocaleString()}`
                : ""}
              . These changes are live on the client&apos;s bot.
            </p>
            {request.final?.system_prompt && (
              <div>
                <p className="text-sm font-medium">System prompt that went live</p>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs">
                  {request.final.system_prompt}
                </pre>
              </div>
            )}
            {request.final?.kb_entries && request.final.kb_entries.length > 0 && (
              <div>
                <p className="text-sm font-medium">
                  Knowledge-base entries added
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {request.final.kb_entries.map((e, i) => (
                    <li key={i}>{e.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {status === "rejected" && (
        <Card>
          <CardHeader>
            <CardTitle>Rejected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Rejected.
            </p>
            {request.admin_note && (
              <div>
                <p className="text-sm font-medium">Team note</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {request.admin_note}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
