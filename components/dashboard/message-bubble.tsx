import { formatDate, cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

type BubbleMessage = Pick<Message, "id" | "role" | "content" | "created_at"> &
  Partial<Pick<Message, "media_url" | "media_type">>;

/**
 * One chat bubble (customer left / AI+agent right) with optional media. Shared by the
 * inbox thread and the Bot Trainer sandbox so both render identically. `mediaUrl` is the
 * resolved (signed) attachment URL, if any — the trainer sandbox is text-only and omits it.
 */
export function MessageBubble({
  message: m,
  mediaUrl,
}: {
  message: BubbleMessage;
  mediaUrl?: string | null;
}) {
  const fromCustomer = m.role === "user";
  return (
    <div className={cn("flex", fromCustomer ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2",
          fromCustomer
            ? "bg-secondary"
            : m.role === "human_agent"
              ? "bg-amber-100 text-amber-900"
              : "bg-primary text-primary-foreground"
        )}
      >
        {m.media_url && mediaUrl && (
          <div className="mb-1.5">
            {(() => {
              const url = mediaUrl;
              const t = m.media_type ?? "";
              if (t.startsWith("image/")) {
                return (
                  <a href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="attachment"
                      className="rounded-md max-h-60 max-w-full object-cover"
                    />
                  </a>
                );
              }
              if (t.startsWith("audio/")) return <audio controls src={url} className="max-w-full" />;
              if (t.startsWith("video/"))
                return <video controls src={url} className="rounded-md max-h-60 max-w-full" />;
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
            })()}
          </div>
        )}
        {m.content && m.content !== "(media message)" && (
          <p className="text-sm whitespace-pre-wrap">{m.content}</p>
        )}
        <p className={cn("text-[10px] mt-1 opacity-70", fromCustomer ? "text-muted-foreground" : "")}>
          {m.role === "human_agent" ? "You · " : m.role === "assistant" ? "AI · " : ""}
          {formatDate(m.created_at)}
        </p>
      </div>
    </div>
  );
}
