/**
 * Shell data - everything the sidebar, top bar and chatbot switcher need, read
 * once per request.
 *
 * The design puts three globals on every screen: which chatbot you're scoped to,
 * whether AI replies are live, and how much work is waiting. Fetching those per
 * component would mean four round-trips on every page, so the layout loads this
 * once and passes it down.
 */
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  countWindows,
  queueLookbackIso,
  type WindowConversation,
} from "@/lib/manual-followups";
import { withLeadClock } from "@/lib/lead-activity";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { hasActiveAccess } from "@/lib/access";
import { PLAN_NAME } from "@/lib/pricing";

export interface WorkspaceBot {
  id: string;
  name: string;
  is_active: boolean;
  /** Threads on this bot (all time). */
  threads: number;
  /** Threads on this bot currently tagged "Needs attention". */
  needsAttention: number;
  /** Distinct channels with at least one thread. */
  platforms: string[];
  /** True when no channel has ever delivered a message for this bot. */
  unconnected: boolean;
}

export interface Workspace {
  userId: string;
  fullName: string | null;
  email: string | null;
  bots: WorkspaceBot[];
  /** The bot the current URL is scoped to, or null for "All chatbots". */
  scopedBotId: string | null;
  counts: {
    chatbots: number;
    conversations: number;
    needsAttention: number;
    followups: number;
  };
  /** True when at least one chatbot is currently auto-replying. */
  aiLive: boolean;
  subscriptionActive: boolean;
  planName: string;
}

/**
 * Load the shell context. `scopedBot` is the `?bot=` param from the current URL;
 * an id that doesn't belong to this user is ignored rather than trusted, so a
 * hand-edited query string can't scope the UI to someone else's chatbot.
 */
export async function getWorkspace(scopedBot?: string | null): Promise<Workspace | null> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const [
    { data: profile },
    { data: subscription },
    { data: chatbots },
    { rows: convoRows },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("chatbots")
      .select("id, name, is_active")
      .eq("user_id", user.id)
      .order("created_at"),
    // One read backs every count in the shell. Selecting only the columns the
    // window maths needs keeps this cheap even on a busy workspace.
    //
    // Paged, not `.limit(5000)`: PostgREST silently caps a request at 1,000
    // rows, so the limit form made every badge here plateau - a workspace with
    // 2,453 threads reported exactly "1,000", and the Follow-ups badge counted
    // a different truncated slice than the Follow-ups page did, so the two
    // never agreed.
    fetchAllRows<WindowConversation & { id: string; chatbot_id: string }>(
      (from, to) =>
        supabase
          .from("conversations")
          .select(
            "id, chatbot_id, platform, last_message_at, status, confirmed_at, user_muted_at, bot_off_at, tag"
          )
          .eq("user_id", user.id)
          .range(from, to),
      { label: "workspace conversations" }
    ),
  ]);

  const now = Date.now();
  const fetched = convoRows;

  // The Follow-ups badge counts the same queue the Follow-ups page lists, which
  // means it needs the same clock: the lead's last inbound, not the last
  // activity on the thread. Only threads active inside the reach window are
  // looked up, so a workspace full of dormant conversations costs nothing here.
  const { rows } = await withLeadClock(supabase, fetched, queueLookbackIso(now));

  const bots: WorkspaceBot[] = (chatbots ?? []).map((c) => {
    const mine = rows.filter((r) => r.chatbot_id === c.id);
    const platforms = [...new Set(mine.map((r) => r.platform ?? "instagram"))];
    return {
      id: c.id,
      name: c.name,
      is_active: !!c.is_active,
      threads: mine.length,
      needsAttention: mine.filter((r) => r.tag === "needs_human").length,
      platforms,
      unconnected: mine.length === 0,
    };
  });

  const scopedBotId =
    scopedBot && bots.some((b) => b.id === scopedBot) ? scopedBot : null;

  // Counts follow the current scope, so the badge next to "Conversations"
  // always matches what clicking it will show.
  const scoped = scopedBotId
    ? rows.filter((r) => r.chatbot_id === scopedBotId)
    : rows;

  return {
    userId: user.id,
    fullName: profile?.full_name ?? null,
    email: profile?.email ?? user.email ?? null,
    bots,
    scopedBotId,
    counts: {
      chatbots: bots.length,
      conversations: scoped.length,
      needsAttention: scoped.filter((r) => r.tag === "needs_human").length,
      followups: countWindows(scoped, now).manual,
    },
    aiLive: bots.some((b) => b.is_active),
    subscriptionActive: hasActiveAccess(subscription),
    planName: PLAN_NAME,
  };
}
