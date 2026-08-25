"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { SsCard } from "@/components/ss/card";
import { SsButton, SsChip, SsStatus } from "@/components/ss/controls";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLAUDE_IMAGE_TYPES } from "@/lib/storage";
import type { Attachment } from "@/lib/types";

type FeedbackStatus = "new" | "read" | "resolved";

type SignedAttachment = Attachment & { url: string | null };

const IMAGE_TYPES = new Set<string>(CLAUDE_IMAGE_TYPES);

export type FeedbackItem = {
  id: string;
  message: string;
  status: FeedbackStatus;
  created_at: string;
  admin_note: string | null;
  clientEmail: string | null;
  clientName: string | null;
  botName: string | null;
  attachments: SignedAttachment[];
};

function AttachmentView({ att }: { att: SignedAttachment }) {
  const isImage = IMAGE_TYPES.has(att.type);

  if (!att.url) {
    return (
      <span className="inline-flex items-center rounded-full border border-ss-line bg-ss-page px-2.5 py-1 text-[11px] text-ss-muted">
        {att.name}
      </span>
    );
  }

  if (isImage) {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo focus-visible:ring-offset-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={att.name}
          className="max-h-24 rounded-chip border border-ss-line"
        />
      </a>
    );
  }

  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-ss-line bg-ss-page px-3 py-1 text-[11px] font-medium text-ss-body transition-colors hover:border-ss-dash hover:bg-ss-page-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo focus-visible:ring-offset-2"
    >
      <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="max-w-[16rem] truncate">{att.name}</span>
    </a>
  );
}

function statusBadge(status: FeedbackStatus) {
  switch (status) {
    case "new":
      return <SsStatus tone="indigo">New</SsStatus>;
    case "read":
      return <SsChip tone="neutral">Read</SsChip>;
    case "resolved":
      return <SsStatus tone="green">Resolved</SsStatus>;
  }
}

export function FeedbackInbox({ items }: { items: FeedbackItem[] }) {
  if (items.length === 0) {
    return <p className="text-[12.5px] text-ss-muted">No feedback here yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <FeedbackCard key={item.id} item={item} />
      ))}
    </div>
  );
}

export function FeedbackCard({ item }: { item: FeedbackItem }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [note, setNote] = useState(item.admin_note ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const client = item.clientName || item.clientEmail || "Unknown";

  async function run(label: string, targetStatus: FeedbackStatus) {
    setError(null);
    setBusy(label);
    try {
      const res = await fetch(`/api/admin/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus, admin_note: note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Something went wrong. Try again.");
        setBusy(null);
        return;
      }
      // The server re-renders with the new status; this card re-initializes
      // from fresh props.
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const noteId = `feedback-note-${item.id}`;

  return (
    <SsCard className="p-[22px]">
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge(item.status)}
        <span className="text-[13px] font-semibold text-ss-ink">{client}</span>
        {item.botName && (
          <span className="text-[11.5px] text-ss-muted">{item.botName}</span>
        )}
        <time
          dateTime={item.created_at}
          className="ml-auto text-[11.5px] tabular-nums text-ss-muted"
        >
          {new Date(item.created_at).toLocaleDateString()}
        </time>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ss-body">
        {item.message}
      </p>

      {item.attachments.length > 0 && (
        <ul className="mt-3.5 flex flex-wrap items-center gap-3">
          {item.attachments.map((att) => (
            <li key={att.path}>
              <AttachmentView att={att} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        <Label htmlFor={noteId}>Internal note</Label>
        <Textarea
          id={noteId}
          rows={2}
          placeholder="Optional note for the team."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy !== null}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-ctl-lg bg-ss-rose-bg px-3 py-2 text-[12.5px] text-ss-rose-ink"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2.5">
        {item.status === "new" && (
          <>
            <SsButton
              type="button"
              variant="primary"
              size="md"
              onClick={() => run("read", "read")}
              disabled={busy !== null}
            >
              {busy === "read" ? "Saving…" : "Mark read"}
            </SsButton>
            <SsButton
              type="button"
              variant="outline"
              size="md"
              onClick={() => run("resolved", "resolved")}
              disabled={busy !== null}
            >
              {busy === "resolved" ? "Saving…" : "Mark resolved"}
            </SsButton>
          </>
        )}
        {item.status === "read" && (
          <>
            <SsButton
              type="button"
              variant="primary"
              size="md"
              onClick={() => run("resolved", "resolved")}
              disabled={busy !== null}
            >
              {busy === "resolved" ? "Saving…" : "Mark resolved"}
            </SsButton>
            <SsButton
              type="button"
              variant="outline"
              size="md"
              onClick={() => run("reopen", "new")}
              disabled={busy !== null}
            >
              {busy === "reopen" ? "Saving…" : "Reopen"}
            </SsButton>
          </>
        )}
        {item.status === "resolved" && (
          <SsButton
            type="button"
            variant="outline"
            size="md"
            onClick={() => run("reopen", "new")}
            disabled={busy !== null}
          >
            {busy === "reopen" ? "Saving…" : "Reopen"}
          </SsButton>
        )}
        <SsButton
          type="button"
          variant="soft"
          size="md"
          onClick={() => run("save-note", item.status)}
          disabled={busy !== null}
        >
          {busy === "save-note" ? "Saving…" : "Save note"}
        </SsButton>
      </div>
    </SsCard>
  );
}
