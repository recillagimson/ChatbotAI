import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/dashboard/platform-badge";
import { ConversationFilter } from "@/components/dashboard/conversation-filter";
import { ConversationDateFilter } from "@/components/dashboard/conversation-date-filter";
import { contactDisplayName } from "@/lib/contact";
import { formatDate, cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { PLATFORMS, PLATFORM_META, isPlatform } from "@/lib/platforms";
import { CONVERSATION_TAGS, TAG_LABEL, TAG_VARIANT, isTag, tagOf } from "@/lib/conversation-tags";
import {
  buildConversationsHref,
  resolveConversationDateBounds,
  isDatePreset,
  isYmd,
  CONV_PAGE_SIZE,
  type ConvFilterState,
} from "@/lib/conversation-filters";

const PILL_BASE =
  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const PILL_ACTIVE = "bg-primary text-primary-foreground";
const PILL_INACTIVE = "border border-input bg-background hover:bg-accent";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    platform?: string;
    chatbot?: string;
    tag?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const platform = isPlatform(sp.platform) ? sp.platform : null;
  const tag = isTag(sp.tag) ? sp.tag : null;
  const range = isDatePreset(sp.range) ? sp.range : null;
  const from = isYmd(sp.from) ? sp.from : null;
  const to = isYmd(sp.to) ? sp.to : null;
  const requestedPage = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const supabase = await createClient();
  const user = await getCurrentUser();

  // This user's chatbots, for the filter dropdown.
  const { data: chatbots } = await supabase
    .from("chatbots")
    .select("id, name")
    .eq("user_id", user!.id)
    .order("created_at");
  // Only honor a chatbot param that belongs to this user.
  const chatbotId =
    sp.chatbot && chatbots?.some((c) => c.id === sp.chatbot) ? sp.chatbot : null;

  // Date filter → last_message_at bounds (null = all time). Uses the request wall
  // clock for relative presets ("last 7 days"); custom dates are UTC day-granular.
  const bounds = resolveConversationDateBounds({ range, from, to }, Date.now());
  const dateActive = !!bounds;

  // Count FIRST (head request, no rows) so we can CLAMP the page before ranging.
  // An out-of-range .range() offset makes PostgREST return HTTP 416 with a NULL
  // count — which would read as total=0 and wrongly show an empty inbox, hiding
  // every thread (e.g. a stale ?page=N link after the filtered set shrank). Both
  // queries apply the same filters.
  let countQuery = supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id);
  if (platform) countQuery = countQuery.eq("platform", platform);
  if (chatbotId) countQuery = countQuery.eq("chatbot_id", chatbotId);
  if (tag) countQuery = countQuery.eq("tag", tag);
  if (bounds?.gte) countQuery = countQuery.gte("last_message_at", bounds.gte);
  if (bounds?.lt) countQuery = countQuery.lt("last_message_at", bounds.lt);
  const { count } = await countQuery;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CONV_PAGE_SIZE));
  // Clamp so an overshoot (?page=999) snaps to the last real page instead of 416.
  const currentPage = Math.min(requestedPage, totalPages);
  const fromIdx = (currentPage - 1) * CONV_PAGE_SIZE;

  // The clamped offset is always in range, so this never 416s. Skip entirely when
  // there are no matches at all.
  let dataQuery = supabase
    .from("conversations")
    .select("*, chatbots(name)")
    .eq("user_id", user!.id);
  if (platform) dataQuery = dataQuery.eq("platform", platform);
  if (chatbotId) dataQuery = dataQuery.eq("chatbot_id", chatbotId);
  if (tag) dataQuery = dataQuery.eq("tag", tag);
  if (bounds?.gte) dataQuery = dataQuery.gte("last_message_at", bounds.gte);
  if (bounds?.lt) dataQuery = dataQuery.lt("last_message_at", bounds.lt);
  const conversations =
    total > 0
      ? (
          await dataQuery
            .order("last_message_at", { ascending: false })
            .range(fromIdx, fromIdx + CONV_PAGE_SIZE - 1)
        ).data ?? []
      : [];

  // Full current filter state — the single source every link/control composes from.
  const current: ConvFilterState = {
    platform,
    chatbot: chatbotId,
    tag,
    range,
    from,
    to,
    page: currentPage,
  };

  const tagTabs: { value: string | null; label: string }[] = [
    { value: null, label: "All" },
    ...CONVERSATION_TAGS.map((t) => ({ value: t, label: TAG_LABEL[t] })),
  ];

  // Which platforms does this user actually have threads on? (for tab visibility —
  // intentionally NOT date-filtered, so a channel's tab doesn't vanish by date.)
  const { data: distinctRows } = await supabase
    .from("conversations")
    .select("platform")
    .eq("user_id", user!.id)
    .limit(1000);
  const present = new Set((distinctRows ?? []).map((r) => r.platform));
  // Always offer tabs for channels in use; if none recorded yet, show Instagram.
  const tabPlatforms = PLATFORMS.filter((p) => present.has(p));
  const tabs: { value: string | null; label: string }[] = [
    { value: null, label: "All" },
    ...(tabPlatforms.length ? tabPlatforms : ["instagram"]).map((p) => ({
      value: p,
      label: PLATFORM_META[p as keyof typeof PLATFORM_META].label,
    })),
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-semibold tracking-tight">Conversations</h1>
        <p className="text-muted-foreground">
          Every DM thread across your chatbots and channels. Click in to view or take over.
        </p>
      </div>

      {/* Filters: platform tabs (left) + chatbot selector (right) */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by platform" className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = platform === t.value || (!platform && t.value === null);
            return (
              <Link
                key={t.value ?? "all"}
                href={buildConversationsHref(current, { platform: t.value })}
                aria-current={active ? "page" : undefined}
                className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_INACTIVE)}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        {(chatbots?.length ?? 0) > 0 && (
          <ConversationFilter chatbots={chatbots ?? []} current={current} />
        )}
      </div>

      {/* Tag filter: Lead / Wants a call / Needs attention / Subscribed */}
      <nav aria-label="Filter by tag" className="mb-4 flex flex-wrap gap-2">
        {tagTabs.map((t) => {
          const active = tag === t.value || (!tag && t.value === null);
          return (
            <Link
              key={t.value ?? "all"}
              href={buildConversationsHref(current, { tag: t.value })}
              aria-current={active ? "page" : undefined}
              className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_INACTIVE)}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Date filter: quick presets + custom range */}
      <div className="mb-6">
        <ConversationDateFilter current={current} />
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="font-medium mb-1">No conversations yet</p>
            <p className="text-sm text-muted-foreground">
              {chatbotId || platform || tag || dateActive
                ? `No conversations${tag ? ` tagged "${TAG_LABEL[tag]}"` : ""}${
                    chatbotId
                      ? ` for ${chatbots?.find((c) => c.id === chatbotId)?.name ?? "this chatbot"}`
                      : ""
                  }${platform ? ` on ${PLATFORM_META[platform].label}` : ""}${
                    dateActive ? " in the selected date range" : ""
                  } yet.`
                : "Once a real customer DMs you, the thread will show up here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <div className="divide-y">
              {conversations.map((c) => (
                  <Link
                    key={c.id}
                    href={`/conversations/${c.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-accent transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                      {contactDisplayName(c.contact_name, c.contact_username, "?")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {contactDisplayName(c.contact_name, c.contact_username)}
                        </p>
                        <PlatformBadge platform={c.platform} showLabel={false} />
                        {c.unread_count > 0 && (
                          <Badge variant="default">{c.unread_count}</Badge>
                        )}
                        {c.status === "ai_paused" && (
                          <Badge variant="warning">AI paused</Badge>
                        )}
                        <Badge variant={TAG_VARIANT[tagOf(c.tag)]}>{TAG_LABEL[tagOf(c.tag)]}</Badge>
                        {tagOf(c.tag) === "starting_later" && (c.start_note || c.start_on) && (
                          <span className="text-xs text-muted-foreground">· {c.start_note || c.start_on}</span>
                        )}
                        {c.user_muted_at && (
                          <Badge variant="secondary">Muted by user</Badge>
                        )}
                        {c.bot_off_at && (
                          <Badge variant="secondary">Bot off</Badge>
                        )}
                        {(c.extraction_attempts ?? 0) > 0 && (
                          <Badge variant="destructive">
                            Flagged{c.extraction_attempts > 1 ? ` ×${c.extraction_attempts}` : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {(c.chatbots as { name: string } | null)?.name ?? "—"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {formatDate(c.last_message_at)}
                    </div>
                  </Link>
              ))}
            </div>
          </Card>

          {/* Pager: total count + Prev / Next */}
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {total.toLocaleString()} conversation{total === 1 ? "" : "s"}
              {totalPages > 1 ? ` · page ${currentPage} of ${totalPages}` : ""}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link
                    href={buildConversationsHref(current, { page: currentPage - 1 })}
                    rel="prev"
                    className={cn(PILL_BASE, PILL_INACTIVE)}
                  >
                    ‹ Prev
                  </Link>
                ) : (
                  <span aria-disabled className={cn(PILL_BASE, PILL_INACTIVE, "opacity-40 pointer-events-none")}>
                    ‹ Prev
                  </span>
                )}
                {currentPage < totalPages ? (
                  <Link
                    href={buildConversationsHref(current, { page: currentPage + 1 })}
                    rel="next"
                    className={cn(PILL_BASE, PILL_INACTIVE)}
                  >
                    Next ›
                  </Link>
                ) : (
                  <span aria-disabled className={cn(PILL_BASE, PILL_INACTIVE, "opacity-40 pointer-events-none")}>
                    Next ›
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
