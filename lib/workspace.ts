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

/** Per-chatbot conversation rollup - the all-time counts the shell badges show. */
interface BotRollup {
  threads: number;
  needsAttention: number;
  platforms: string[];
}

/** One row of the `workspace_conversation_rollup` RPC (bigints arrive as numbers or strings). */
type RollupRow = {
  chatbot_id: string;
  threads: number | string | null;
  needs_attention: number | string | null;
  platforms: string[] | null;
};

/**
 * The scope-INDEPENDENT half of the workspace load: identity, chatbots, the
 * per-bot all-time rollup, and ONLY the recently-active conversations needed for
 * the follow-up clock. It doesn't depend on `?bot=`, so it's wrapped in React
 * `cache()` to run AT MOST ONCE per request even though the layout AND the page
 * both ask for the workspace with different scopes.
 *
 * It deliberately does NOT hold every conversation row. The big counts come from
 * a grouped aggregate; the only rows pulled into memory are those inside the
 * follow-up reach window - a small, bounded slice even on a workspace with tens
 * of thousands of dormant threads.
 */
interface WorkspaceBase {
  userId: string;
  fullName: string | null;
  email: string | null;
  isSuperadmin: boolean;
  bots: WorkspaceBot[];
  /**
   * Only the conversations inside the follow-up reach window (last activity within
   * MAX_REACH_HOURS), lead-clock stamped. This is all `countWindows(...).manual`
   * needs: a thread older than the reach window can never bucket as "manual", so
   * omitting it changes no follow-up count.
   */
  reachRows: (WindowConversation & {
    id: string;
    chatbot_id: string;
    last_inbound_at: string | null;
  })[];
  subscriptionActive: boolean;
  planName: string;
  /** One clock shared by every count derived from this base. */
  now: number;
}

/**
 * Per-bot all-time counts + the reach-window conversation slice, in as little
 * data as possible.
 *
 * Fast path: a grouped aggregate RPC returns one row per chatbot (threads,
 * needs-attention, distinct channels) - no conversation rows cross the wire - and
 * a second query pulls ONLY the reach-window slice for the follow-up clock.
 *
 * Fallback: if the RPC isn't present yet (migration not applied) or errors, page
 * every conversation and roll it up in JS - exactly the pre-optimisation
 * behaviour, so the shell is correct before AND after the migration lands.
 */
async function loadConversationRollup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  lookbackIso: string
): Promise<{ rollup: Map<string, BotRollup>; reachRows: WorkspaceBase["reachRows"] }> {
  const CONVO_COLS =
    "id, chatbot_id, platform, last_message_at, status, confirmed_at, user_muted_at, bot_off_at, tag";
  const rollup = new Map<string, BotRollup>();

  const { data: rollupRows, error: rollupErr } = await supabase.rpc(
    "workspace_conversation_rollup",
    { p_user_id: userId }
  );

  if (rollupErr || !Array.isArray(rollupRows)) {
    // ---- Fallback: page everything and roll up in JS (pre-migration path). ----
    if (rollupErr) {
      console.warn(
        "[workspace] rollup RPC unavailable, falling back to full scan:",
        rollupErr.message
      );
    }
    const { rows: allConvos } = await fetchAllRows<
      WindowConversation & { id: string; chatbot_id: string }
    >(
      (from, to) =>
        supabase.from("conversations").select(CONVO_COLS).eq("user_id", userId).range(from, to),
      { label: "workspace conversations (fallback)" }
    );
    const { rows: leadClocked } = await withLeadClock(supabase, allConvos, lookbackIso);
    for (const r of leadClocked) {
      const agg = rollup.get(r.chatbot_id) ?? { threads: 0, needsAttention: 0, platforms: [] };
      agg.threads += 1;
      if (r.tag === "needs_human") agg.needsAttention += 1;
      const platform = r.platform ?? "instagram";
      if (!agg.platforms.includes(platform)) agg.platforms.push(platform);
      rollup.set(r.chatbot_id, agg);
    }
    const lookbackMs = new Date(lookbackIso).getTime();
    const reachRows = leadClocked.filter(
      (r) => new Date(r.last_message_at).getTime() >= lookbackMs
    );
    return { rollup, reachRows };
  }

  // ---- Fast path: aggregate + reach-window slice only. ----
  for (const row of rollupRows as RollupRow[]) {
    rollup.set(row.chatbot_id, {
      threads: Number(row.threads ?? 0),
      needsAttention: Number(row.needs_attention ?? 0),
      platforms: (row.platforms ?? []).map((p) => p ?? "instagram"),
    });
  }

  // Only threads active inside the reach window can matter to the follow-up
  // count; the aggregate above already carries every all-time total.
  const { rows: reachRaw } = await fetchAllRows<
    WindowConversation & { id: string; chatbot_id: string }
  >(
    (from, to) =>
      supabase
        .from("conversations")
        .select(CONVO_COLS)
        .eq("user_id", userId)
        .gte("last_message_at", lookbackIso)
        .range(from, to),
    { label: "workspace reach-window conversations" }
  );
  const { rows: reachRows } = await withLeadClock(supabase, reachRaw, lookbackIso);
  return { rollup, reachRows };
}

const loadWorkspaceBase = cache(async (): Promise<WorkspaceBase | null> => {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const now = Date.now();
  const lookbackIso = queueLookbackIso(now);

  const [{ data: profile }, { data: subscription }, { data: chatbots }, { rollup, reachRows }] =
    await Promise.all([
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
      loadConversationRollup(supabase, user.id, lookbackIso),
    ]);

  const bots: WorkspaceBot[] = (chatbots ?? []).map((c) => {
    const agg = rollup.get(c.id);
    return {
      id: c.id,
      name: c.name,
      is_active: !!c.is_active,
      threads: agg?.threads ?? 0,
      needsAttention: agg?.needsAttention ?? 0,
      platforms: agg?.platforms ?? [],
      unconnected: (agg?.threads ?? 0) === 0,
    };
  });

  return {
    userId: user.id,
    fullName: profile?.full_name ?? null,
    email: profile?.email ?? user.email ?? null,
    isSuperadmin: !!profile?.is_superadmin,
    bots,
    reachRows,
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

  // Counts follow the current scope, so the badge next to "Conversations" always
  // matches what clicking it will show. Totals come from the per-bot rollup; the
  // follow-up count buckets the reach-window slice.
  const scopedBots = scopedBotId
    ? base.bots.filter((b) => b.id === scopedBotId)
    : base.bots;
  const scopedReach = scopedBotId
    ? base.reachRows.filter((r) => r.chatbot_id === scopedBotId)
    : base.reachRows;

  return {
    userId: base.userId,
    fullName: base.fullName,
    email: base.email,
    isSuperadmin: base.isSuperadmin,
    bots: base.bots,
    scopedBotId,
    counts: {
      chatbots: base.bots.length,
      conversations: scopedBots.reduce((sum, b) => sum + b.threads, 0),
      needsAttention: scopedBots.reduce((sum, b) => sum + b.needsAttention, 0),
      followups: countWindows(scopedReach, base.now).manual,
    },
    aiLive: base.bots.some((b) => b.is_active),
    subscriptionActive: base.subscriptionActive,
    planName: base.planName,
  };
}
