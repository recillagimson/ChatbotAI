/**
 * Who spoke last, and when - read from the messages table rather than inferred.
 *
 * `conversations.last_message_at` means "latest activity", not "the lead's last
 * message": the ManyChat webhook stamps it on every inbound, but the manual
 * reply route stamps it too. The follow-up queue needs the lead's clock
 * specifically - it decides whether a thread is still inside Instagram's 24-hour
 * window, whether a hand-sent reply can still reach it seven days on, and
 * whether the lead has answered you (in which case the thread leaves the queue).
 * Using the activity column for that would mean your own nudge reopened the
 * window it was sent into.
 *
 * Scoped by conversation id, never by role + date alone. A superadmin's RLS
 * grants every tenant's rows, so an unscoped `role = 'human_agent'` count is a
 * full scan of the whole platform's message history - which is both a wrong
 * answer and, on a real dataset, a statement timeout.
 */
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Conversation ids per request. Keeps the `in.()` filter inside a sane URL
 * length while still hitting the (conversation_id, created_at) index.
 */
const CHUNK = 150;

/** Backstop so one runaway thread can't pull an unbounded result set. */
const MAX_ROWS_PER_CHUNK = 20_000;

export interface LeadActivity {
  /** Conversation id → ISO time of the lead's most recent inbound message. */
  lastInbound: Map<string, string>;
  /** Conversation id → ISO times of replies you sent by hand, newest first. */
  handSends: Map<string, string[]>;
}

export const EMPTY_LEAD_ACTIVITY: LeadActivity = {
  lastInbound: new Map(),
  handSends: new Map(),
};

/**
 * Load inbound and hand-sent message times for the given conversations, back to
 * `sinceIso`.
 *
 * A conversation with no entry in `lastInbound` had no inbound message in that
 * window - for the queue's lookback that means the lead's last message is older
 * than anything still reachable, so the caller treats it as out of reach rather
 * than as fresh. Missing is a real answer here, not missing data.
 */
export async function loadLeadActivity(
  supabase: ServerClient,
  conversationIds: string[],
  sinceIso: string
): Promise<LeadActivity> {
  const ids = [...new Set(conversationIds)];
  if (!ids.length) return { lastInbound: new Map(), handSends: new Map() };

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("messages")
        .select("conversation_id, role, created_at")
        .in("conversation_id", chunk)
        .in("role", ["user", "human_agent"])
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS_PER_CHUNK)
    )
  );

  const lastInbound = new Map<string, string>();
  const handSends = new Map<string, string[]>();

  for (const { data, error } of results) {
    if (error) {
      // Better to under-report the queue than to silently show every thread as
      // freshly active on a partial read.
      console.error("[lead-activity] message read failed", error);
      continue;
    }
    for (const m of data ?? []) {
      if (m.role === "user") {
        // Rows arrive newest-first, so the first sighting is the latest.
        if (!lastInbound.has(m.conversation_id)) {
          lastInbound.set(m.conversation_id, m.created_at);
        }
      } else {
        const list = handSends.get(m.conversation_id);
        if (list) list.push(m.created_at);
        else handSends.set(m.conversation_id, [m.created_at]);
      }
    }
  }

  return { lastInbound, handSends };
}

/**
 * Stamp each conversation with the lead's real last message, ready for
 * [lib/manual-followups.ts] to bucket.
 *
 * Only threads whose latest activity falls inside the reach window are looked
 * up: a thread quiet for longer than that can't be in the queue whichever
 * timestamp you measure, since the lead's message is never newer than the
 * activity stamp. On a workspace with a long tail of dormant threads that's the
 * difference between reading a handful of rows and reading all of them.
 *
 * Two different "no answer" cases, kept apart on purpose:
 *
 *  - A thread that was looked up and had no inbound in the lookback is pinned to
 *    the lookback edge. That's the newest their last message could possibly be,
 *    so it buckets as out of reach - which is the point. Falling back to
 *    `last_message_at` here would make a thread you hand-replied to look freshly
 *    active, the exact bug this function exists to prevent.
 *  - A thread that was never looked up (quiet for longer than the lookback) gets
 *    null and falls back to `last_message_at`, which is already old enough to
 *    bucket the same way.
 */
export async function withLeadClock<
  T extends { id: string; last_message_at: string },
>(
  supabase: ServerClient,
  rows: T[],
  lookbackIso: string
): Promise<{
  rows: (T & { last_inbound_at: string | null })[];
  activity: LeadActivity;
}> {
  // Compared as instants, not strings: Postgres hands back "+00:00" offsets
  // while `toISOString()` writes "Z", so lexical ordering across the two would
  // quietly mis-sort every row.
  const lookback = new Date(lookbackIso).getTime();
  const candidates = rows.filter(
    (r) => new Date(r.last_message_at).getTime() >= lookback
  );
  const activity = candidates.length
    ? await loadLeadActivity(
        supabase,
        candidates.map((r) => r.id),
        lookbackIso
      )
    : EMPTY_LEAD_ACTIVITY;

  const lookedUp = new Set(candidates.map((r) => r.id));

  return {
    rows: rows.map((r) => ({
      ...r,
      last_inbound_at: lookedUp.has(r.id)
        ? (activity.lastInbound.get(r.id) ?? lookbackIso)
        : null,
    })),
    activity,
  };
}

/** How many replies you sent by hand at or after `sinceIso`, across all threads. */
export function countHandSendsSince(
  activity: LeadActivity,
  sinceIso: string
): number {
  const since = new Date(sinceIso).getTime();
  if (!Number.isFinite(since)) return 0;
  let n = 0;
  for (const times of activity.handSends.values()) {
    for (const t of times) {
      if (new Date(t).getTime() >= since) n += 1;
    }
  }
  return n;
}
