"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CheckCheck, Copy, ExternalLink, Hourglass, RotateCcw, Sparkles } from "lucide-react";
import { SsAvatar, SsButton, SsChip } from "@/components/ss/controls";
import { ChannelChip } from "@/components/ss/channel";

export interface FollowupItem {
  id: string;
  name: string;
  platform: string;
  /** "6d 2h" - how long since the lead's last message. */
  waiting: string;
  tagLabel: string;
  lastMessage: string | null;
  lastMessageAt: string;
  botName: string | null;
  /** Native inbox (Instagram/Messenger/…) - where a human can send by hand. */
  nativeUrl: string | null;
  nativeLabel: string;
  /** ManyChat Live Chat - the primary manual-send surface for these threads. */
  manychatUrl: string | null;
  /** The day band this card is shown in (d1/d3/d5/d7), when the view is a day band.
   *  Drives the "Resolved" button; absent on the Closing-soon / reachable views. */
  band?: string;
}

/**
 * One card in the manual follow-up queue.
 *
 * The queue exists because Instagram and Messenger stop accepting automated sends
 * 24 hours after the lead's last message - past that the bot physically can't
 * reach them. These are NOT sent from the app: an out-of-window send from here
 * doesn't reliably arrive, so the card's job is to hand you an on-brand draft and
 * a fast way OUT to where you actually send - ManyChat's Live Chat (every channel
 * routes through it) or the native inbox. Nothing here delivers a message.
 *
 * "Suggest" asks the bot for a re-engagement FOLLOW-UP draft (the same engine that
 * writes its live drip nudges, in its own voice, from the conversation so far),
 * then hands it to you to copy and send by hand.
 */
export function FollowupCard({ item }: { item: FollowupItem }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);

  // "Resolved" = the user did this follow-up by hand in ManyChat. It hides the card
  // from THIS band; the server records the band so the thread re-surfaces in the next
  // band if the lead still hasn't replied (a reply un-hides it - see the API route).
  async function resolve() {
    if (resolving || !item.band) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${item.id}/followup-resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ band: item.band }),
      });
      if (!res.ok) {
        setError("Couldn't mark this resolved. Try again.");
        setResolving(false);
        return;
      }
      // Drop the card immediately, then re-read so the pill counts follow.
      setResolved(true);
      router.refresh();
    } catch {
      setError("Couldn't mark resolved - check your connection.");
      setResolving(false);
    }
  }

  async function suggest() {
    if (suggesting) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${item.id}/suggest-reply`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as {
        draft?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.draft) {
        setError(data?.error ?? "Couldn't draft a follow-up. Try again.");
        return;
      }
      setDraft(data.draft.slice(0, 1000));
    } catch {
      setError("Couldn't draft a follow-up - check your connection.");
    } finally {
      setSuggesting(false);
    }
  }

  function copy() {
    const text = draft.trim();
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => setError("Couldn't copy - select the text and copy manually."));
  }

  if (resolved) return null;

  return (
    <div className="rounded-card border border-ss-line bg-white px-5 py-[18px]">
      <div className="flex items-start gap-3">
        <SsAvatar name={item.name} size={38} tone="indigo" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/conversations/${item.id}`}
              className="truncate text-[14.5px] font-bold leading-none text-ss-ink hover:underline"
            >
              {item.name}
            </Link>
            <ChannelChip platform={item.platform} />
            <span className="inline-flex items-center gap-1 rounded-full bg-ss-amber-bg px-2 py-[3px] text-[10.5px] font-bold leading-[1.5] text-ss-amber-ink">
              <Hourglass className="h-3 w-3" aria-hidden="true" />
              {item.waiting} since their last message
            </span>
            <SsChip tone="indigo">{item.tagLabel}</SsChip>
          </div>

          {item.lastMessage && (
            <p className="mt-2.5 rounded-ctl-lg bg-ss-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-ss-body">
              <span className="text-ss-muted">Their last message · </span>
              &ldquo;{item.lastMessage}&rdquo;
            </p>
          )}

          {/* ---- Draft ------------------------------------------------- */}
          <div className="mt-2.5 rounded-ctl-lg border border-ss-indigo-200 bg-ss-indigo-25 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-ss-indigo-600" aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-ss-indigo-700">
                Your follow-up
              </span>
              <button
                type="button"
                onClick={suggest}
                disabled={suggesting}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold leading-none text-ss-indigo-600 transition-colors hover:text-ss-indigo-800 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                {suggesting ? "Writing…" : draft ? "Rewrite" : "Suggest one"}
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={1000}
              disabled={suggesting}
              aria-label={`Follow-up message to ${item.name}`}
              placeholder="Write the nudge yourself, or let the bot draft one in its own voice…"
              className="mt-2.5 w-full resize-none bg-transparent text-[13px] leading-relaxed text-ss-ink outline-none placeholder:text-ss-faint disabled:opacity-60"
            />
          </div>

          {error && (
            <p role="alert" className="mt-2 text-[11.5px] font-medium text-ss-rose-ink">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* ---- Actions -------------------------------------------------- */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-ss-hair pt-3.5">
        {item.manychatUrl && (
          <a
            href={item.manychatUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ss-indigo-600 px-[13px] py-2.5 text-[12.5px] font-semibold leading-none text-white transition-colors hover:bg-ss-indigo-700"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open in ManyChat
          </a>
        )}

        <SsButton onClick={copy} disabled={!draft.trim()} variant="outline" size="md">
          {copied ? (
            <Check className="h-4 w-4 text-ss-green" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy text"}
        </SsButton>

        {item.nativeUrl && (
          <a
            href={item.nativeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-ss-line bg-white px-[13px] py-2.5 text-[12.5px] font-semibold leading-none text-ss-ink transition-colors hover:border-ss-dash hover:bg-ss-page"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {item.nativeLabel}
          </a>
        )}

        {item.band && (
          <SsButton onClick={resolve} disabled={resolving} variant="outline" size="md">
            <CheckCheck className="h-4 w-4 text-ss-green" aria-hidden="true" />
            {resolving ? "Resolving…" : "Resolved"}
          </SsButton>
        )}

        <Link
          href={`/conversations/${item.id}`}
          className="ml-auto text-[12.5px] font-semibold leading-none text-ss-muted transition-colors hover:text-ss-ink"
        >
          Open thread
        </Link>
      </div>
    </div>
  );
}
