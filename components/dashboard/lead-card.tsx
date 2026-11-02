"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SsCard } from "@/components/ss/card";
import { ChannelChip } from "@/components/ss/channel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/lead-contact";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  MAX_REMARK_CHARS,
  type LeadStatus,
} from "@/lib/lead-status";
import { cn } from "@/lib/utils";

export interface LeadRemark {
  id: string;
  kind: "note" | "status";
  body: string;
  author_email: string | null;
  created_at: string;
  /** "2h ago", worked out on the server so it matches on first paint. */
  ago?: string;
}

export interface LeadItem {
  id: string;
  name: string;
  handle: string | null;
  botName: string | null;
  platform: string | null;
  phone: string | null;
  email: string | null;
  sharedAt: string;
  sharedAgo: string;
  status: LeadStatus;
  /** Newest first. */
  remarks: LeadRemark[];
}

const STATUS_TONE: Record<LeadStatus, string> = {
  pending: "border-ss-rose-line bg-ss-rose-bg text-ss-rose-ink",
  reached_out: "border-ss-rule-indigo bg-ss-indigo-50 text-ss-indigo-700",
  follow_up: "border-ss-amber-line bg-ss-amber-bg text-ss-amber-ink",
  done: "border-ss-line bg-ss-green-bg text-ss-green-ink",
};

function authorName(email: string | null): string {
  return email ? email.split("@")[0] : "Someone";
}

/** One lead on the Lead contacts page: contact, status dropdown, updates log. */
export function LeadCard({ lead }: { lead: LeadItem }) {
  const router = useRouter();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<null | "status" | "remark">(null);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { status: LeadStatus } | { remark: string }) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  }

  async function changeStatus(next: LeadStatus) {
    const prev = status;
    setStatus(next); // optimistic
    setBusy("status");
    setError(null);
    try {
      await send({ status: next });
      router.refresh();
    } catch (e) {
      setStatus(prev);
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function postRemark() {
    const text = draft.trim();
    if (!text) return;
    setBusy("remark");
    setError(null);
    try {
      await send({ remark: text });
      setDraft("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const latestNote = lead.remarks.find((r) => r.kind === "note");
  const selectId = `lead-status-${lead.id}`;

  return (
    <SsCard className="px-5 py-[18px]">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-[15px] font-bold text-ss-ink">{lead.name}</span>
            {lead.handle && lead.handle !== lead.name ? (
              <span className="text-[12px] text-ss-muted">@{lead.handle}</span>
            ) : null}
            <ChannelChip platform={lead.platform} />
            {lead.botName ? <span className="text-[12px] text-ss-muted">· {lead.botName}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {lead.phone ? (
              <a href={`tel:${lead.phone}`} className="font-semibold text-ss-ink hover:underline">
                {formatPhone(lead.phone)}
              </a>
            ) : null}
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="break-all font-semibold text-ss-ink hover:underline">
                {lead.email}
              </a>
            ) : null}
            <span className="text-ss-muted">
              Shared {lead.sharedAgo}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="sr-only">
            Status for {lead.name}
          </label>
          <select
            id={selectId}
            value={status}
            disabled={busy !== null}
            onChange={(e) => changeStatus(e.target.value as LeadStatus)}
            className={cn(
              "h-9 cursor-pointer rounded-ctl border px-3 text-[13px] font-semibold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-60",
              STATUS_TONE[status]
            )}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {latestNote && !open ? (
        <p className="mt-3 line-clamp-2 text-[13px] leading-snug text-ss-body">
          <span className="font-semibold text-ss-ink">Latest:</span> {latestNote.body}
          <span className="text-ss-muted">
            {" "}
            · {authorName(latestNote.author_email)}
            {latestNote.ago ? `, ${latestNote.ago}` : ""}
          </span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-ss-indigo-700 hover:underline"
        >
          {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          {open ? "Hide updates" : `Updates (${lead.remarks.length})`}
        </button>
        <Link href={`/conversations/${lead.id}`} className="text-[13px] font-semibold text-ss-muted hover:underline">
          Open conversation
        </Link>
      </div>

      {open ? (
        <div className="mt-3 border-t border-ss-line pt-3">
          <label htmlFor={`lead-remark-${lead.id}`} className="sr-only">
            Post an update on {lead.name}
          </label>
          <Textarea
            id={`lead-remark-${lead.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What's the latest? e.g. Called, no answer. Trying again Friday."
            maxLength={MAX_REMARK_CHARS}
            rows={2}
          />
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" onClick={postRemark} disabled={!draft.trim() || busy !== null}>
              {busy === "remark" ? "Posting…" : "Post update"}
            </Button>
          </div>

          {lead.remarks.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-ss-muted">No updates yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2.5">
              {lead.remarks.map((r) => (
                <li key={r.id} className="text-[13px] leading-snug">
                  <p className={r.kind === "status" ? "italic text-ss-muted" : "whitespace-pre-wrap text-ss-body"}>
                    {r.body}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ss-muted">
                    {authorName(r.author_email)}
                    {r.ago ? ` · ${r.ago}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="status" className="mt-3 text-[13px] font-semibold text-ss-rose-ink">
          {error}
        </p>
      ) : null}
    </SsCard>
  );
}
