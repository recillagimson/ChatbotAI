"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Paperclip } from "lucide-react";
import { SsCard, SsCardHead } from "@/components/ss/card";
import { SsButton } from "@/components/ss/controls";
import { Callout } from "@/components/ss/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DiffView } from "@/components/dashboard/diff-view";
import { CATEGORY_LABELS, SECTION_LABELS } from "@/lib/change-categories";
import type { ChangeRequest, SectionColumn } from "@/lib/types";

type Action = "approve" | "reject" | "regenerate" | "publish";

type EditableKbEntry = { title: string; content: string; include: boolean };

export function ChangeRequestReview({
  request,
  chatbot,
  currentSection,
  currentSections,
  clientEmail,
  transcript,
}: {
  request: ChangeRequest;
  chatbot: { id: string; name: string; system_prompt: string | null };
  currentSection: string;
  currentSections: Record<SectionColumn, string>;
  clientEmail: string | null;
  transcript: {
    role: "user" | "assistant";
    content: string;
    images?: { name: string; url: string | null }[];
    files?: { name: string; url: string | null }[];
  }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Single-section categories edit one section's text; "overall" edits any affected
  // section(s); "other" (KB) only edits the legacy system_prompt on old requests.
  const isSingleSection =
    request.category === "personality" ||
    request.category === "offers" ||
    request.category === "rebuttals";
  const isOverall = request.category === "overall";
  const sectionLabel = isSingleSection ? CATEGORY_LABELS[request.category] : "System prompt";
  const hasLegacyPrompt = !!request.proposed?.system_prompt;
  const showPromptCard = isSingleSection || hasLegacyPrompt;

  const [systemPrompt, setSystemPrompt] = useState(
    isSingleSection
      ? (request.proposed?.section_content ?? "")
      : isOverall
        ? ""
        : (request.proposed?.system_prompt ?? chatbot.system_prompt ?? "")
  );
  // "overall" - one editable revised text per affected section (initialized from the
  // AI proposal). Approve sends these as `sections`.
  const [sections, setSections] = useState<{ section: SectionColumn; content: string }[]>(
    (request.proposed?.sections ?? []).map((s) => ({
      section: s.section,
      content: s.section_content,
    }))
  );
  function updateSection(index: number, content: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, content } : s)));
  }
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
    const kb_entries = kbEntries
      .filter((e) => e.include)
      .map(({ title, content }) => ({ title, content }));
    run("approve", {
      // Single-section categories publish into their section column; "overall"
      // publishes each affected section; legacy "other" rows carry system_prompt.
      ...(isSingleSection
        ? { section_content: systemPrompt.trim() || undefined }
        : isOverall
          ? {
              sections: sections
                .map((s) => ({ section: s.section, section_content: s.content.trim() }))
                .filter((s) => s.section_content),
            }
          : hasLegacyPrompt
            ? { system_prompt: systemPrompt.trim() || undefined }
            : {}),
      kb_entries,
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
    <div className="flex flex-col gap-5">
      {/* 0. Reviewer reminder (color + text) */}
      <Callout
        tone="amber"
        title="Reminder"
        icon={
          <AlertTriangle
            className="h-[18px] w-[18px] text-ss-amber"
            aria-hidden="true"
          />
        }
      >
        Review the full conversation below before publishing - an approved and
        published change goes live on the client&apos;s bot.
      </Callout>

      {/* 0b. Conversation (client ↔ assistant transcript + attachments) */}
      <SsCard className="p-[22px]">
        <SsCardHead titleAs="h3" title="Conversation" />
        <div className="mt-4 space-y-4">
          {transcript.length === 0 ? (
            <p className="text-sm text-ss-muted">
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
                        ? "max-w-[85%] rounded-ctl-lg border border-ss-line bg-ss-page px-3 py-2"
                        : "max-w-[85%] rounded-ctl-lg border border-ss-line bg-white px-3 py-2"
                    }
                  >
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ss-muted">
                      {isClient ? "Client" : "Assistant"}
                    </p>
                    {m.content && (
                      <p className="whitespace-pre-wrap text-sm text-ss-body">
                        {m.content}
                      </p>
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
                                className="max-h-32 rounded border border-ss-line"
                              />
                            </a>
                          ) : (
                            <span
                              key={j}
                              className="text-xs text-ss-muted"
                            >
                              {img.name} (unavailable)
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {m.files && m.files.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {m.files.map((f, j) =>
                          f.url ? (
                            <a
                              key={j}
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-ss-indigo-600 underline underline-offset-2"
                            >
                              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                              {f.name}
                            </a>
                          ) : (
                            <span key={j} className="text-xs text-ss-muted">
                              {f.name} (unavailable)
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
        </div>
      </SsCard>

      {/* 1. Client request (read-only) */}
      <SsCard className="p-[22px]">
        <SsCardHead titleAs="h3" title="Client request" />
        <div className="mt-4 space-y-3">
          <p className="whitespace-pre-wrap text-sm text-ss-body">
            {request.request_text}
          </p>
          <p className="text-xs text-ss-muted">
            from {clientEmail ?? "unknown client"}
          </p>
          {request.proposed?.summary && (
            <p className="rounded-ctl-lg bg-ss-page px-3 py-2 text-sm text-ss-body">
              <span className="font-semibold text-ss-ink">AI summary:</span>{" "}
              {request.proposed.summary}
            </p>
          )}
          {request.draft_error && (
            <p className="rounded-ctl-lg border border-ss-amber-line bg-ss-amber-bg px-3 py-2 text-[12.5px] text-ss-amber-ink">
              The AI draft failed: {request.draft_error} - use Regenerate.
            </p>
          )}
        </div>
      </SsCard>

      {/* 2. Proposed section / system prompt (before & after). Hidden for KB-only "other". */}
      {showPromptCard && (
        <SsCard className="p-[22px]">
          <SsCardHead titleAs="h3" title={`Proposed ${sectionLabel}`} />
          <div className="mt-4 space-y-3">
            {isSingleSection && (
              <DiffView
                label={sectionLabel}
                before={currentSection}
                after={systemPrompt}
              />
            )}
            <Label htmlFor="proposed-system-prompt" className={isSingleSection ? "text-xs font-medium uppercase tracking-wide text-ss-muted" : "sr-only"}>
              {isSingleSection ? "Revised (after) - editable" : "Proposed system prompt"}
            </Label>
            <Textarea
              id="proposed-system-prompt"
              rows={14}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={readOnly}
            />
            {!isSingleSection && (
              <details className="text-sm">
                <summary className="cursor-pointer text-ss-muted hover:text-ss-ink">
                  Current live prompt
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-ctl-lg bg-ss-page px-3 py-2 text-xs text-ss-body">
                  {chatbot.system_prompt || "(none - generic mode)"}
                </pre>
              </details>
            )}
          </div>
        </SsCard>
      )}

      {/* 2b. "Overall" - one editable before/after per affected section. */}
      {isOverall && (
        <SsCard className="p-[22px]">
          <SsCardHead titleAs="h3" title="Proposed section changes" />
          <div className="mt-4 space-y-6">
            {sections.length === 0 ? (
              <p className="text-sm text-ss-muted">
                No section changes proposed - this request only adds knowledge (below).
              </p>
            ) : (
              sections.map((s, i) => (
                <div key={s.section} className="space-y-3 border-b border-ss-hair pb-6 last:border-b-0 last:pb-0">
                  <DiffView
                    label={SECTION_LABELS[s.section]}
                    before={currentSections[s.section] ?? ""}
                    after={s.content}
                  />
                  <Label
                    htmlFor={`section-${s.section}`}
                    className="text-xs font-medium uppercase tracking-wide text-ss-muted"
                  >
                    {SECTION_LABELS[s.section]} - revised (after), editable
                  </Label>
                  <Textarea
                    id={`section-${s.section}`}
                    rows={12}
                    value={s.content}
                    onChange={(e) => updateSection(i, e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              ))
            )}
          </div>
        </SsCard>
      )}

      {/* 3. Knowledge-base additions */}
      <SsCard className="p-[22px]">
        <SsCardHead titleAs="h3" title="Knowledge-base additions" />
        <div className="mt-4 space-y-4">
          {kbEntries.length === 0 ? (
            <p className="text-sm text-ss-muted">
              No new knowledge-base entries proposed.
            </p>
          ) : (
            <>
              {kbEntries.map((entry, i) => (
                <div
                  key={i}
                  className="space-y-3 rounded-ctl-lg border border-ss-line p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`kb-title-${i}`} className="text-sm">
                      Entry {i + 1}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`kb-include-${i}`}
                        className="text-xs text-ss-muted"
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
              <p className="text-xs text-ss-muted">
                Only included entries are published.
              </p>
            </>
          )}
        </div>
      </SsCard>

      {/* 4. Team note */}
      <SsCard className="p-[22px]">
        <SsCardHead titleAs="h3" title="Team note" />
        <div className="mt-4 space-y-2">
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
          <p className="text-xs text-ss-muted">
            Shown to the client on applied / rejected requests.
          </p>
        </div>
      </SsCard>

      {error && (
        <p
          role="alert"
          className="rounded-ctl-lg border border-ss-rose-line bg-ss-rose-bg px-3 py-2 text-sm text-ss-rose-ink"
        >
          {error}
        </p>
      )}

      {/* 5. Actions (gated by status) */}
      {status === "pending" && (
        <SsCard className="p-[22px]">
          <SsCardHead titleAs="h3" title="Review" />
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap gap-3">
              <SsButton
                type="button"
                size="lg"
                variant="primary"
                onClick={handleApprove}
                disabled={busy !== null}
              >
                {busy === "approve" ? "Approving…" : "Approve"}
              </SsButton>
              <SsButton
                type="button"
                size="lg"
                variant="danger-outline"
                onClick={handleReject}
                disabled={busy !== null}
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </SsButton>
            </div>
            <div className="space-y-2 border-t border-ss-hair pt-4">
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
                <SsButton
                  type="button"
                  size="md"
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={busy !== null}
                >
                  {busy === "regenerate"
                    ? "Regenerating…"
                    : "Regenerate with Sonnet"}
                </SsButton>
              </div>
            </div>
          </div>
        </SsCard>
      )}

      {status === "approved" && (
        <SsCard className="p-[22px]">
          <SsCardHead titleAs="h3" title="Approved" />
          <div className="mt-4 space-y-5">
            <p className="rounded-ctl-lg border border-ss-green-line bg-ss-green-bg px-3 py-2 text-[12.5px] text-ss-green-ink">
              Approved - not live yet. Publish to apply these changes to the
              client&apos;s bot.
            </p>
            <div className="flex flex-wrap gap-3">
              <SsButton
                type="button"
                size="lg"
                variant="primary"
                onClick={handlePublish}
                disabled={busy !== null}
              >
                {busy === "publish" ? "Publishing…" : "Publish to live bot"}
              </SsButton>
              <SsButton
                type="button"
                size="lg"
                variant="outline"
                onClick={handleApprove}
                disabled={busy !== null}
              >
                {busy === "approve" ? "Saving…" : "Re-approve (save edits)"}
              </SsButton>
              <SsButton
                type="button"
                size="lg"
                variant="danger-outline"
                onClick={handleReject}
                disabled={busy !== null}
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </SsButton>
            </div>
          </div>
        </SsCard>
      )}

      {status === "applied" && (
        <SsCard className="p-[22px]">
          <SsCardHead titleAs="h3" title="Applied" />
          <div className="mt-4 space-y-3">
            <p className="rounded-ctl-lg border border-ss-green-line bg-ss-green-bg px-3 py-2 text-[12.5px] text-ss-green-ink">
              Applied
              {request.applied_at
                ? ` ${new Date(request.applied_at).toLocaleString()}`
                : ""}
              . These changes are live on the client&apos;s bot.
            </p>
            {request.final?.section_content && (
              <div>
                <p className="text-sm font-semibold text-ss-ink">{sectionLabel} that went live</p>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-ctl-lg bg-ss-page px-3 py-2 text-xs text-ss-body">
                  {request.final.section_content}
                </pre>
              </div>
            )}
            {request.final?.sections?.map((s) => (
              <div key={s.section}>
                <p className="text-sm font-semibold text-ss-ink">{SECTION_LABELS[s.section]} that went live</p>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-ctl-lg bg-ss-page px-3 py-2 text-xs text-ss-body">
                  {s.section_content}
                </pre>
              </div>
            ))}
            {request.final?.system_prompt && (
              <div>
                <p className="text-sm font-semibold text-ss-ink">System prompt that went live</p>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-ctl-lg bg-ss-page px-3 py-2 text-xs text-ss-body">
                  {request.final.system_prompt}
                </pre>
              </div>
            )}
            {request.final?.kb_entries && request.final.kb_entries.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-ss-ink">
                  Knowledge-base entries added
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ss-muted">
                  {request.final.kb_entries.map((e, i) => (
                    <li key={i}>{e.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SsCard>
      )}

      {status === "rejected" && (
        <SsCard className="p-[22px]">
          <SsCardHead titleAs="h3" title="Rejected" />
          <div className="mt-4 space-y-3">
            <p className="rounded-ctl-lg border border-ss-rose-line bg-ss-rose-bg px-3 py-2 text-[12.5px] text-ss-rose-ink">
              Rejected.
            </p>
            {request.admin_note && (
              <div>
                <p className="text-sm font-semibold text-ss-ink">Team note</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ss-muted">
                  {request.admin_note}
                </p>
              </div>
            )}
          </div>
        </SsCard>
      )}
    </div>
  );
}
