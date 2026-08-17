/**
 * Shell data - everything the sidebar, top bar and chatbot switcher need, read
 * once per request.
 *
 * The design puts three globals on every screen: which chatbot you're scoped to,
 * whether AI replies are live, and how much work is waiting. Fetching those per
 * component would mean four round-trips on every page, so the layout loads this
 * once and passes it down.
 */
import { cache } from "react";
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
  /**
   * The EFFECTIVE user's `is_superadmin`. Only meaningful when NOT impersonating:
   * during "View as client" this is the target's flag, so the sole consumer (the
   * dashboard layout's Admin link) ANDs it with `!active`, which forces it off.
   */
  isSuperadmin: boolean;
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
 * The scope-INDEPENDENT half of the workspace load: identity, chatbots, and the
 * full conversation set (lead-clock stamped) that every shell badge is counted
 * from. This is the expensive part - it pages the whole conversation set and
 * reads the messages table for the follow-up clock - and it doesn't depend on
 * `?bot=` at all, so it's wrapped in React `cache()` to run AT MOST ONCE per
 * request even though the layout AND the page each ask for the workspace (with
 * different scopes). Before this split the heaviest query on the app ran two to
 * four times on a single page render; now it runs once and `getWorkspace` is a
 * cheap pure projection over the result.
 */
interface WorkspaceBase {
  userId: string;
  fullName: string | null;
  email: string | null;
  isSuperadmin: boolean;
  bots: WorkspaceBot[];
  /** Every conversation this user owns, lead-clock stamped, for count derivation. */
  rows: (WindowConversation & {
    id: string;
    chatbot_id: string;
    last_inbound_at: string | null;
  })[];
  subscriptionActive: boolean;
  planName: string;
  /** One clock shared by every count derived from this base. */
  now: number;
}

const loadWorkspaceBase = cache(async (): Promise<WorkspaceBase | null> => {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const [
    { data: profile },
    { data: subscription },
    { data: chatbots },
    { rows: convoRows },
  ] = await Promise.all([
    // One profile read backs both the sidebar name/email AND the layout's Admin
    // link (`is_superadmin`), so the layout no longer fires its own duplicate
    // read of this same row.
    supabase
      .from("profiles")
      .select("full_name, email, is_superadmin")
      .eq("id", user.id)
      .maybeSingle(),
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

  // The Follow-ups badge counts the same queue the Follow-ups page lists, which
  // means it needs the same clock: the lead's last inbound, not the last
  // activity on the thread. Only threads active inside the reach window are
  // looked up, so a workspace full of dormant conversations costs nothing here.
  const { rows } = await withLeadClock(supabase, convoRows, queueLookbackIso(now));

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

  return {
    userId: user.id,
    fullName: profile?.full_name ?? null,
    email: profile?.email ?? user.email ?? null,
    isSuperadmin: !!profile?.is_superadmin,
    bots,
    rows,
    subscriptionActive: hasActiveAccess(subscription),
    planName: PLAN_NAME,
    now,
  };
});

/**
 * The shell context for the current URL scope. `scopedBot` is the `?bot=` param;
 * an id that doesn't belong to this user is ignored rather than trusted, so a
 * hand-edited query string can't scope the UI to someone else's chatbot.
 *
 * This is a cheap pure projection over the `cache()`-memoised base load above -
 * call it freely (layout, page, whatever `?bot=` scope) without multiplying the
 * underlying queries.
 */
export async function getWorkspace(scopedBot?: string | null): Promise<Workspace | null> {
  const base = await loadWorkspaceBase();
  if (!base) return null;

  const scopedBotId =
    scopedBot && base.bots.some((b) => b.id === scopedBot) ? scopedBot : null;

  // Counts follow the current scope, so the badge next to "Conversations"
  // always matches what clicking it will show.
  const scoped = scopedBotId
    ? base.rows.filter((r) => r.chatbot_id === scopedBotId)
    : base.rows;

  return {
    userId: base.userId,
    fullName: base.fullName,
    email: base.email,
    isSuperadmin: base.isSuperadmin,
    bots: base.bots,
    scopedBotId,
    counts: {
      chatbots: base.bots.length,
      conversations: scoped.length,
      needsAttention: scoped.filter((r) => r.tag === "needs_human").length,
      followups: countWindows(scoped, base.now).manual,
    },
    aiLive: base.bots.some((b) => b.is_active),
    subscriptionActive: base.subscriptionActive,
    planName: base.planName,
  };
}
