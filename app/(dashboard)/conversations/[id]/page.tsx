import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { ConversationActions } from "@/components/dashboard/conversation-actions";
import { ConversationReplyBox } from "@/components/dashboard/conversation-reply-box";
import { ChatScroll } from "@/components/dashboard/chat-scroll";
import { PlatformBadge } from "@/components/dashboard/platform-badge";
import { contactDisplayName, contactHandle } from "@/lib/contact";
import { signAttachment } from "@/lib/storage";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, chatbots(name)")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  // Resolve a viewable URL for each message that carries media. media_url holds a
  // storage path in the private request-uploads bucket (sign it), unless it's
  // already an absolute URL. Signed links are short-lived but fine for this view.
  const mediaUrls = new Map<string, string>();
  for (const m of messages ?? []) {
    if (!m.media_url) continue;
    const url = /^https?:\/\//.test(m.media_url)
      ? m.media_url
      : await signAttachment(supabase, m.media_url);
    if (url) mediaUrls.set(m.id, url);
  }

  // mark read
  if (conversation.unread_count > 0) {
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", id);
  }

  return (
    <div className="h-screen flex flex-col p-6 max-w-3xl mx-auto w-full">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mb-3 shrink-0 self-start"
      >
        <Link href="/conversations">
          <ArrowLeft className="h-4 w-4 mr-2" />
          All conversations
        </Link>
      </Button>

      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-semibold tracking-tight">
              {contactDisplayName(
                conversation.contact_name,
                conversation.contact_username
              )}
            </h1>
            <PlatformBadge platform={conversation.platform} />
          </div>
          <p className="text-sm text-muted-foreground">
            {(conversation.chatbots as { name: string } | null)?.name ?? "—"}
            {contactHandle(conversation.contact_username)
              ? ` · @${contactHandle(conversation.contact_username)}`
              : ""}
          </p>
        </div>
        <Badge
          variant={
            conversation.status === "active"
              ? "success"
              : conversation.status === "ai_paused"
                ? "warning"
                : "secondary"
          }
        >
          {conversation.status === "ai_paused"
            ? "AI paused"
            : conversation.status}
        </Badge>
      </div>

      <div className="shrink-0">
        <ConversationActions
          conversationId={conversation.id}
          currentStatus={conversation.status}
        />
      </div>

      <Card className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        <ChatScroll className="flex-1 min-h-0 p-4 space-y-3">
          {!messages?.length && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet.
            </p>
          )}
          {messages?.map((m) => {
            const fromCustomer = m.role === "user";
            return (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  fromCustomer ? "justify-start" : "justify-end"
                )}
              >
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
                  {m.media_url && mediaUrls.get(m.id) && (
                    <div className="mb-1.5">
                      {(() => {
                        const url = mediaUrls.get(m.id)!;
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
                        if (t.startsWith("audio/")) {
                          return <audio controls src={url} className="max-w-full" />;
                        }
                        if (t.startsWith("video/")) {
                          return (
                            <video controls src={url} className="rounded-md max-h-60 max-w-full" />
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
                      })()}
                    </div>
                  )}
                  {m.content && m.content !== "(media message)" && (
                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  )}
                  <p
                    className={cn(
                      "text-[10px] mt-1 opacity-70",
                      fromCustomer ? "text-muted-foreground" : ""
                    )}
                  >
                    {m.role === "human_agent"
                      ? "You · "
                      : m.role === "assistant"
                        ? "AI · "
                        : ""}
                    {formatDate(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </ChatScroll>
      </Card>

      <div className="shrink-0">
        <ConversationReplyBox
          conversationId={conversation.id}
          paused={conversation.status === "ai_paused"}
        />
      </div>
    </div>
  );
}
