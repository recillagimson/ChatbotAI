import { Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { clockTime } from "@/lib/format";
import type { Message } from "@/lib/types";

type BubbleMessage = Pick<Message, "id" | "role" | "content" | "created_at"> &
  Partial<Pick<Message, "media_url" | "media_type">>;

/**
 * One chat bubble. The lead's messages sit left on white with a hairline; the
 * bot's sit right in indigo; a human takeover sits right in navy so you can see
 * at a glance which replies were yours - the design's whole point in giving the
 * AI a byline under every bubble it sent.
 *
 * Shared by the inbox thread and the Bot Trainer sandbox so both render
 * identically. `mediaUrl` is the resolved (signed) attachment URL; the trainer
 * is text-only and omits it.
 */
export function MessageBubble({
  message: m,
  mediaUrl,
  /** Appended to the byline, e.g. "41s after last message". */
  note,
}: {
  message: BubbleMessage;
  mediaUrl?: string | null;
  note?: string;
}) {
  const fromCustomer = m.role === "user";
  const fromHuman = m.role === "human_agent";

  return (
    <div
      className={cn(
        "flex max-w-[min(36rem,80%)] flex-col",
        fromCustomer ? "self-start items-start" : "self-end items-end"
      )}
    >
      <div
        className={cn(
          "px-[15px] py-3 text-[13.5px] leading-relaxed",
          fromCustomer
            ? "rounded-[16px_16px_16px_5px] border border-ss-line bg-white text-ss-ink"
            : fromHuman
              ? "rounded-[16px_16px_5px_16px] bg-ss-navy text-white"
              : "rounded-[16px_16px_5px_16px] bg-ss-indigo text-white"
        )}
      >
        {m.media_url && mediaUrl && (
          <div className="mb-2">
            <Attachment url={mediaUrl} type={m.media_type ?? ""} />
          </div>
        )}
        {m.content && m.content !== "(media message)" && (
          <p className="whitespace-pre-wrap">{m.content}</p>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-medium leading-none text-ss-faint">
        {!fromCustomer &&
          (fromHuman ? (
            <User className="h-3 w-3 text-ss-navy" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3 w-3 text-ss-indigo" aria-hidden="true" />
          ))}
        <span>
          {fromHuman ? "Sent by you" : !fromCustomer ? "Sent by AI" : ""}
          {!fromCustomer ? " · " : ""}
          {clockTime(m.created_at)}
          {note ? ` · ${note}` : ""}
        </span>
      </div>
    </div>
  );
}

function Attachment({ url, type }: { url: string; type: string }) {
  if (type.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Attachment sent in this conversation"
          className="max-h-60 max-w-full rounded-ctl-lg object-cover"
        />
      </a>
    );
  }
  if (type.startsWith("audio/")) {
    return <audio controls src={url} className="max-w-full" />;
  }
  if (type.startsWith("video/")) {
    return (
      <video controls src={url} className="max-h-60 max-w-full rounded-ctl-lg" />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs underline"
    >
      📎 Attachment
    </a>
  );
}

/** The centred date divider between days in a thread. */
export function DayDivider({ label }: { label: string }) {
  return (
    <div className="self-center rounded-full bg-ss-chip px-3 py-1 text-[10.5px] font-semibold uppercase leading-[1.5] tracking-wide text-ss-muted">
      {label}
    </div>
  );
}
