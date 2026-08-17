import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flag } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { ConversationActions } from "@/components/dashboard/conversation-actions";
import { ConversationReplyBox } from "@/components/dashboard/conversation-reply-box";
import { ChatScroll } from "@/components/dashboard/chat-scroll";
import {
  MessageBubble,
  DayDivider,
} from "@/components/dashboard/message-bubble";
import { SsAvatar, SsChip } from "@/components/ss/controls";
import { ChannelChip } from "@/components/ss/channel";
import { contactDisplayName, contactHandle } from "@/lib/contact";
import { signAttachment } from "@/lib/storage";
import { botNameOf } from "@/lib/utils";
import { shortDate } from "@/lib/format";
import { TAG_LABEL, tagOf } from "@/lib/conversation-tags";
import { QUALITY_LABEL, qualityOf } from "@/lib/conversation-quality";
import { botReplySilenced } from "@/lib/conversation-silence";
import { readInboxFilters } from "@/lib/inbox-params";
import { buildConversationsHref } from "@/lib/conversation-filters";

export const dynamic = "force-dynamic";

/**
 * A thread, open beside the list it came from.
 *
 * This page is ONLY the right pane. The thread list is rendered once by the
 * conversations layout and stays mounted across thread opens, so switching
 * conversations reloads just this pane and never the list (the design's reason
 * for the two-pane inbox). On mobile the layout hides the list and this fills
 * the screen, with a back link to the queue.
 */
export default async function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const current = readInboxFilters(await searchParams);

  const supabase = await createClient();
  const user = await getCurrentUser();
  const isAdmin = !!(await requireSuperadmin());

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, chatbots(name, keep_replies_when_tagged)")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  // Resolve a viewable URL for each message carrying media. media_url holds a
  // storage path in the private request-uploads bucket (sign it), unless it's
  // already absolute. Signed links are short-lived but fine for this view.
  const mediaUrls = new Map<string, string>();
  for (const m of messages ?? []) {
    if (!m.media_url) continue;
    const url = /^https?:\/\//.test(m.media_url)
      ? m.media_url
      : await signAttachment(supabase, m.media_url);
    if (url) mediaUrls.set(m.id, url);
  }

  if (conversation.unread_count > 0) {
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", id);
  }

  const name = contactDisplayName(
    conversation.contact_name,
    conversation.contact_username,
  );
  const handle = contactHandle(conversation.contact_username);
  const tag = tagOf(conversation.tag);
  const quality = qualityOf(conversation.quality_tag);
  const urgent = tag === "needs_human";
  const cbRel = conversation.chatbots as
    | { keep_replies_when_tagged?: boolean }
    | { keep_replies_when_tagged?: boolean }[]
    | null;
  const keepRepliesWhenTagged =
    (Array.isArray(cbRel) ? cbRel[0] : cbRel)?.keep_replies_when_tagged ===
    true;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ss-page-alt">
      <ConversationActions
        conversationId={conversation.id}
        currentStatus={conversation.status}
        currentTag={tag}
        currentQuality={quality}
        currentStartOn={conversation.start_on ?? null}
        userMutedAt={conversation.user_muted_at ?? null}
        isAdmin={isAdmin}
        identity={
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={buildConversationsHref(
                current,
                { page: current.page },
                "/conversations",
              )}
              aria-label="Back to the inbox"
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl-lg text-ss-body transition-colors hover:bg-ss-page lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            <SsAvatar name={name} size={40} tone={urgent ? "rose" : "indigo"} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-[17px] font-bold leading-[1.1] text-ss-ink">
                  {name}
                </h1>
                <ChannelChip platform={conversation.platform} />
                <SsChip tone={urgent ? "rose" : "indigo"}>
                  {TAG_LABEL[tag]}
                </SsChip>
                {quality && (
                  <SsChip tone={quality === "good" ? "green" : "rose-soft"}>
                    {QUALITY_LABEL[quality]}
                  </SsChip>
                )}
                {(conversation.extraction_attempts ?? 0) > 0 && (
                  <SsChip tone="rose">
                    Flagged
                    {conversation.extraction_attempts > 1
                      ? ` ×${conversation.extraction_attempts}`
                      : ""}
                  </SsChip>
                )}
              </div>
            </div>
          </div>
        }
        meta={
          <p className="text-[12px] leading-none text-ss-muted">
            {botNameOf(conversation.chatbots) ?? "-"}
            {handle ? ` · @${handle}` : ""}
            {` · ${(messages ?? []).length} message${(messages ?? []).length === 1 ? "" : "s"}`}
            {` · first seen ${shortDate(conversation.created_at)}`}
            {conversation.bot_off_at ? " · bot off (ManyChat tag)" : ""}
            {conversation.start_note
              ? ` · starting ${conversation.start_note}`
              : ""}
          </p>
        }
      />

      <ChatScroll className="ss-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 py-6 sm:px-6">
        {!messages?.length && (
          <p className="py-10 text-center text-[12.5px] text-ss-muted">
            No messages yet on this thread.
          </p>
        )}
        {(messages ?? []).map((m, i) => {
          const prev = i > 0 ? messages![i - 1] : null;
          const newDay =
            !prev ||
            new Date(prev.created_at).toDateString() !==
              new Date(m.created_at).toDateString();
          return (
            <div key={m.id} className="contents">
              {newDay && <DayDivider label={dayLabel(m.created_at)} />}
              <MessageBubble message={m} mediaUrl={mediaUrls.get(m.id)} />
            </div>
          );
        })}

        {urgent && (
          <div className="flex items-center gap-2.5 self-stretch rounded-[13px] border border-dashed border-ss-indigo-200 bg-ss-indigo-50 px-3.5 py-3">
            <Flag
              className="h-4 w-4 shrink-0 text-ss-indigo-700"
              aria-hidden="true"
            />
            <p className="text-[11.5px] leading-snug text-ss-indigo-700">
              Flagged <strong>needs attention</strong> - the AI stopped here so
              you can close it yourself.
            </p>
          </div>
        )}
      </ChatScroll>

      <ConversationReplyBox
        conversationId={conversation.id}
        botSilent={botReplySilenced(conversation, keepRepliesWhenTagged)}
      />
    </div>
  );
}

/** "TODAY", "YESTERDAY", or the date - the divider label between days. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
