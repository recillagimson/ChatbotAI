import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ConversationActions } from "@/components/dashboard/conversation-actions";
import { ConversationReplyBox } from "@/components/dashboard/conversation-reply-box";
import { ChatScroll } from "@/components/dashboard/chat-scroll";
import { PlatformBadge } from "@/components/dashboard/platform-badge";
import { MessageBubble } from "@/components/dashboard/message-bubble";
import { contactDisplayName, contactHandle } from "@/lib/contact";
import { signAttachment } from "@/lib/storage";
import { TAG_LABEL, TAG_VARIANT, tagOf } from "@/lib/conversation-tags";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  const isAdmin = !!(await requireSuperadmin());

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
        <div className="flex items-center gap-2">
          <Badge variant={TAG_VARIANT[tagOf(conversation.tag)]}>
            {TAG_LABEL[tagOf(conversation.tag)]}
          </Badge>
          {tagOf(conversation.tag) === "starting_later" &&
            (conversation.start_note || conversation.start_on) && (
              <span className="text-xs text-muted-foreground">
                · {conversation.start_note || conversation.start_on}
              </span>
            )}
          {conversation.user_muted_at && (
            <Badge variant="secondary">Muted by user</Badge>
          )}
          {conversation.bot_off_at && (
            <Badge variant="secondary">Bot off</Badge>
          )}
          {(conversation.extraction_attempts ?? 0) > 0 && (
            <Badge variant="destructive">
              Flagged{conversation.extraction_attempts > 1 ? ` ×${conversation.extraction_attempts}` : ""}
            </Badge>
          )}
          {conversation.confirmed_at && (
            <Badge variant="success">
              Confirmed ✓ ({conversation.confirmed_by === "ai" ? "AI" : "manual"})
            </Badge>
          )}
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
      </div>

      <div className="shrink-0">
        <ConversationActions
          conversationId={conversation.id}
          currentStatus={conversation.status}
          currentTag={tagOf(conversation.tag)}
          currentStartOn={conversation.start_on ?? null}
          userMutedAt={conversation.user_muted_at ?? null}
          isAdmin={isAdmin}
        />
      </div>

      <Card className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        <ChatScroll className="flex-1 min-h-0 p-4 space-y-3">
          {!messages?.length && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet.
            </p>
          )}
          {messages?.map((m) => (
            <MessageBubble key={m.id} message={m} mediaUrl={mediaUrls.get(m.id)} />
          ))}
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
