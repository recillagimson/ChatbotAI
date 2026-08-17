/**
 * The inbox thread-list query, in one place.
 *
 * The conversations inbox is a two-pane screen: a persistent thread list on the
 * left and the open conversation on the right. The list is rendered once, in the
 * conversations LAYOUT, by a client component so that opening a thread swaps only
 * the right pane and never re-runs the list. That client component gets its data
 * from `/api/conversations/list`, which calls this. The queries here are the
 * same ones the old server `<InboxList>` ran inline - lifted out verbatim so the
 * behaviour (filters, paging, standing counts, present channels) is unchanged.
 */
import type { createClient } from "@/lib/supabase/server";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import {
  CONV_PAGE_SIZE,
  resolveConversationDateBounds,
  type ConvFilterState,
} from "@/lib/conversation-filters";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** One thread row as the inbox list renders it. */
export interface InboxConversation {
  id: string;
  contact_name: string | null;
  contact_username: string | null;
  platform: string;
  last_message_at: string;
  unread_count: number;
  status: string;
  tag: string | null;
  quality_tag: string | null;
  extraction_attempts: number | null;
  chatbots: { name: string } | { name: string }[] | null;
}

/** Everything the inbox list pane needs for one filter state. */
export interface InboxData {
  conversations: InboxConversation[];
  total: number;
  page: number;
  totalPages: number;
  /** Whole-inbox count for the "Inbox N" header - deliberately unfiltered. */
  allCount: number;
  /** Whole-inbox "needs attention" count for that tab - deliberately unfiltered. */
  needsCount: number;
  /** Channels with at least one thread, for the platform filter. */
  channels: Platform[];
}

export async function loadInbox(
  supabase: ServerClient,
  userId: string,
  current: ConvFilterState,
): Promise<InboxData> {
  const bounds = resolveConversationDateBounds(current, Date.now());
  // `%`, `,` and parens are PostgREST's own separators inside an .or() filter -
  // stripping them keeps a search term from breaking out of its pattern.
  const term = current.q ? current.q.replace(/[%,()]/g, " ") : null;

  // Count FIRST (head request) so the page can be clamped before ranging - an
  // out-of-range offset makes PostgREST 416 with a NULL count, which would read
  // as an empty inbox and hide every thread. Both queries take the same chain.
  let countQuery = supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (current.platform)
    countQuery = countQuery.eq("platform", current.platform);
  if (current.chatbot)
    countQuery = countQuery.eq("chatbot_id", current.chatbot);
  if (current.tag) countQuery = countQuery.eq("tag", current.tag);
  if (current.quality)
    countQuery = countQuery.eq("quality_tag", current.quality);
  if (bounds?.gte) countQuery = countQuery.gte("last_message_at", bounds.gte);
  if (bounds?.lt) countQuery = countQuery.lt("last_message_at", bounds.lt);
  if (term)
    countQuery = countQuery.or(
      `contact_name.ilike.%${term}%,contact_username.ilike.%${term}%`,
    );
  const { count } = await countQuery;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CONV_PAGE_SIZE));
  const page = Math.min(Math.max(1, current.page), totalPages);
  const offset = (page - 1) * CONV_PAGE_SIZE;

  let dataQuery = supabase
    .from("conversations")
    .select("*, chatbots(name)")
    .eq("user_id", userId);
  if (current.platform) dataQuery = dataQuery.eq("platform", current.platform);
  if (current.chatbot) dataQuery = dataQuery.eq("chatbot_id", current.chatbot);
  if (current.tag) dataQuery = dataQuery.eq("tag", current.tag);
  if (current.quality) dataQuery = dataQuery.eq("quality_tag", current.quality);
  if (bounds?.gte) dataQuery = dataQuery.gte("last_message_at", bounds.gte);
  if (bounds?.lt) dataQuery = dataQuery.lt("last_message_at", bounds.lt);
  if (term)
    dataQuery = dataQuery.or(
      `contact_name.ilike.%${term}%,contact_username.ilike.%${term}%`,
    );

  const conversations = total
    ? (((
        await dataQuery
          .order("last_message_at", { ascending: false })
          .range(offset, offset + CONV_PAGE_SIZE - 1)
      ).data as InboxConversation[] | null) ?? [])
    : [];

  // Standing counts for the two pinned tabs - deliberately NOT filtered, so
  // "Needs attention · 3" always tells the truth about the whole inbox.
  const [{ count: allCount }, { count: needsCount }, { data: presentRows }] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("tag", "needs_human"),
      supabase
        .from("conversations")
        .select("platform")
        .eq("user_id", userId)
        .limit(1000),
    ]);

  const present = new Set((presentRows ?? []).map((r) => r.platform));
  const channels = PLATFORMS.filter((p) => present.has(p));

  return {
    conversations,
    total,
    page,
    totalPages,
    allCount: allCount ?? 0,
    needsCount: needsCount ?? 0,
    channels,
  };
}
