// lib/follows.ts
// New Instagram followers, as ManyChat reports them.
//
// Instagram's public API has no follower list and no "someone followed you"
// event. ManyChat has one: the Follow to DM trigger behind its "Say hi to new
// followers" automation. An External Request step in that automation posts
// {"event": "new_follower", "contact": <Full Contact Data>} to the ManyChat
// webhook, which records one row per follower in instagram_follows (migration
// 2026-09-29-instagram-follows.sql) and answers with no message. Statistics reads
// them back through the instagram_follow_report function.
//
// Coverage is ManyChat's, not Instagram's: the trigger only runs for people who
// are not already ManyChat contacts (anyone who has messaged the account, or got a
// DM from one of its automations such as comment-to-DM, is skipped), runs once per
// person (a re-follow is not reported), and is a Meta beta that not every account
// has. So the count is a floor, and the Statistics card says so.
import type { createClient, createServiceClient } from "@/lib/supabase/server";
import { cleanContactField } from "@/lib/contact";
import { retrySupabase } from "@/lib/retry";
import { classifyAnalyticsError, type AnalyticsProblem, type RangeKey } from "@/lib/analytics";

type ServiceClient = ReturnType<typeof createServiceClient>;
type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** The `event` value the Connection tab tells owners to put in the request body. */
export const FOLLOW_EVENT = "new_follower";

/** The Connection tab's anchor for the setup steps ("Set it up" links there). */
export const FOLLOWERS_ANCHOR = "followers";

/** How many recent followers the Statistics card lists. */
export const LATEST_FOLLOWERS = 8;

/**
 * Past this many days the chart adds days together. 31 keeps "Last 30 days" and a
 * whole month at one bar per day, and still leaves each bar a few pixels wide in
 * the card's half-width column on a phone.
 */
export const MAX_CHART_BARS = 31;

/** A quiet stretch shorter than this is normal for a small account, so it never reads as a stopped feed. */
export const QUIET_AFTER_DAYS = 7;

/** Fewer days than this draw as full-width slabs rather than a daily chart. */
export const MIN_CHART_DAYS = 3;

/**
 * The ranges that end "now" (lib/analytics.ts resolveRange), so choosing the same
 * one tomorrow shows one more day. Last month and custom dates end on a fixed day.
 */
const RANGES_ENDING_NOW: ReadonlySet<RangeKey> = new Set<RangeKey>(["7d", "30d", "month", "all"]);

const DAY_MS = 86_400_000;

/** A handle, a name or an identity longer than this is cut (or, for an id, dropped). */
const MAX_FIELD_CHARS = 200;

/** A real ManyChat contact id is a short number; anything this long is not one. */
const MAX_SUBSCRIBER_ID_CHARS = 100;

/**
 * True when a webhook body's `event` names a new follower. Only the letters
 * count, so case, spaces, dashes, dots and underscores are forgiven ("New
 * Follower", "newFollower", "new.follower"), and so are the forms an owner might
 * type instead ("new_followers", "follow", "followed"). Anything else
 * ("unfollow", "follow_up", "message") is not a follow, so a real message can
 * never be mistaken for one.
 */
export function isFollowEvent(event: unknown): boolean {
  if (typeof event !== "string") return false;
  const letters = event.toLowerCase().replace(/[^a-z]/g, "");
  return /^(new)?follow(s|ed|er|ers)?$/.test(letters);
}

/** One instagram_follows row, as the webhook writes it. */
export interface FollowRow {
  chatbot_id: string;
  manychat_subscriber_id: string;
  /** Chosen like conversations.external_user_id (resolveExternalId), so the report can find this person's thread after ManyChat reissues their contact id. */
  external_user_id: string | null;
  username: string | null;
  display_name: string | null;
}

const clip = (v: string | null): string | null => (v ? v.slice(0, MAX_FIELD_CHARS) : null);

/**
 * The row for one follow, or null when ManyChat sent no usable contact id (an
 * unwired {{field}}, a blank, or something far too long to be an id). Without the
 * id there is nothing to count once per person, so such a request records nothing
 * rather than a row every follower would collide on. Unwired fields are stored as
 * null, never as text. `externalUserId` is the caller's resolveExternalId result;
 * an identity is matched exactly, so one too long to be real is dropped, not cut.
 */
export function buildFollowRow(input: {
  chatbotId: string;
  subscriberId: string;
  externalUserId?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): FollowRow | null {
  const subscriberId = cleanContactField(input.subscriberId);
  if (!subscriberId || subscriberId.length > MAX_SUBSCRIBER_ID_CHARS) return null;
  const externalUserId = cleanContactField(input.externalUserId);
  const name = [cleanContactField(input.firstName), cleanContactField(input.lastName)]
    .filter(Boolean)
    .join(" ");
  return {
    chatbot_id: input.chatbotId,
    manychat_subscriber_id: subscriberId,
    external_user_id:
      externalUserId && externalUserId.length <= MAX_FIELD_CHARS ? externalUserId : null,
    username: clip(cleanContactField(input.username)),
    display_name: clip(name || null),
  };
}

export type FollowOutcome = "follow_recorded" | "follow_already_recorded" | "follow_not_recorded";

/**
 * Record one follow. The first report of a follower wins: a repeat (ManyChat
 * re-running the automation, or the same request sent twice) inserts nothing.
 * Never throws; a failed write (including a missing table before the migration)
 * is logged by the retry helper and reported as not recorded.
 */
export async function recordFollow(supabase: ServiceClient, row: FollowRow): Promise<FollowOutcome> {
  const { data, error } = await retrySupabase(
    (signal) =>
      supabase
        .from("instagram_follows")
        .upsert(row, { onConflict: "chatbot_id,manychat_subscriber_id", ignoreDuplicates: true })
        .select("id")
        .abortSignal(signal),
    { label: "instagram follow insert" }
  );
  if (error) return "follow_not_recorded";
  return Array.isArray(data) && data.length > 0 ? "follow_recorded" : "follow_already_recorded";
}

/* ------------------------------------------------------------------ *
 * The Statistics report
 * ------------------------------------------------------------------ */

export interface FollowDay {
  /** YYYY-MM-DD (UTC). */
  day: string;
  follows: number;
}

export interface LatestFollower {
  username: string | null;
  display_name: string | null;
  followed_at: string;
  /** Their thread on that bot, when they have one. */
  conversation_id: string | null;
  /** That thread has at least one inbound from them: a DM, or a keyword comment the bot answered. */
  messaged: boolean;
}

/** A chatbot in scope with at least one recorded follow. */
export interface TrackedBot {
  id: string;
  /** Its first recorded follow: it was tracked no later than this. */
  firstFollowedAt: string;
  lastFollowedAt: string;
}

export interface FollowReport {
  /** At least one follow was ever recorded for the bots in scope (false: show the setup prompt). */
  tracking: boolean;
  /** The bots in scope with at least one recorded follow, earliest first. */
  trackedBots: TrackedBot[];
  /** The first recorded follow in scope (the day series starts there). */
  firstFollowedAt: string | null;
  /** The latest recorded follow in scope. */
  lastFollowedAt: string | null;
  /** Follows recorded in the range. */
  follows: number;
  /** Follows in the previous range of the same length; null when not asked for. */
  prevFollows: number | null;
  /** Of `follows`, how many have a thread with an inbound from them (see LatestFollower.messaged). */
  messaged: number;
  /**
   * One entry per UTC day, zeros included, from the later of the range start and
   * the first recorded follow to the earlier of the range end and today. Empty
   * when the range ended before tracking began.
   */
  series: FollowDay[];
  /** The most recent follows in the range, newest first. */
  latest: LatestFollower[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** A non-negative whole count; bigints can arrive from PostgREST as strings. */
function toCount(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const toText = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** A timestamp the report can compare; anything unparseable reads as absent. */
const toTime = (v: unknown): string | null => {
  const t = toText(v);
  return t && Number.isFinite(Date.parse(t)) ? t : null;
};

/** The report function's jsonb, checked field by field. Null when it is not a report. */
export function parseFollowReport(raw: unknown): FollowReport | null {
  if (!isRecord(raw)) return null;
  const series = Array.isArray(raw.series)
    ? raw.series.filter(isRecord).flatMap((d) => {
        const day = toText(d.day);
        return day ? [{ day, follows: toCount(d.follows) }] : [];
      })
    : [];
  const latest = Array.isArray(raw.latest)
    ? raw.latest.filter(isRecord).flatMap((f) => {
        const followedAt = toText(f.followed_at);
        return followedAt
          ? [
              {
                username: toText(f.username),
                display_name: toText(f.display_name),
                followed_at: followedAt,
                conversation_id: toText(f.conversation_id),
                messaged: f.messaged === true,
              },
            ]
          : [];
      })
    : [];
  const trackedBots = Array.isArray(raw.tracked_bots)
    ? raw.tracked_bots.filter(isRecord).flatMap((b) => {
        const id = toText(b.id);
        const firstFollowedAt = toTime(b.first_followed_at);
        const lastFollowedAt = toTime(b.last_followed_at);
        return id && firstFollowedAt && lastFollowedAt ? [{ id, firstFollowedAt, lastFollowedAt }] : [];
      })
    : [];
  return {
    tracking: raw.tracking === true,
    trackedBots,
    firstFollowedAt: toTime(raw.first_followed_at),
    lastFollowedAt: toTime(raw.last_followed_at),
    follows: toCount(raw.follows),
    prevFollows: raw.prev_follows == null ? null : toCount(raw.prev_follows),
    messaged: toCount(raw.messaged),
    series,
    latest,
  };
}

/**
 * The follower report for `opts.userId`, the EFFECTIVE user whose dashboard is
 * shown (getCurrentUser().id), not whoever's JWT is on `supabase`: under "View as
 * client" the JWT is the superadmin's. Same contract as getAnalyticsOverview, and
 * the same guard enforces it in the database (analytics_scope_uid).
 */
export async function getFollowReport(
  supabase: ServerClient,
  opts: { from: string; to: string; prevFrom: string; chatbotId: string | null; userId: string }
): Promise<{ report: FollowReport | null; problem: AnalyticsProblem | null }> {
  const { data, error } = await supabase.rpc("instagram_follow_report", {
    p_from: opts.from,
    p_to: opts.to,
    p_prev_from: opts.prevFrom,
    p_chatbot_id: opts.chatbotId,
    p_user_id: opts.userId,
    p_latest: LATEST_FOLLOWERS,
  });
  if (error) {
    console.error("[follows] report failed", error);
    return { report: null, problem: classifyAnalyticsError(error) };
  }
  return { report: parseFollowReport(data), problem: null };
}

/**
 * How the range sits against when each chatbot began tracking. Follows exist only
 * from the day an owner added the ManyChat step, and a bot's first recorded follow
 * is the nearest the data can say about that (tracking began no later than it), so:
 *  - previousComparable: EVERY tracked bot in scope was tracked for the whole
 *    previous period, so the change against it is fair. Otherwise a half-tracked
 *    previous period turns a flat rate into "+600%", and in "All chatbots" one bot
 *    can start long after another.
 *  - lateBots: tracked bots whose first recorded follow falls inside this range,
 *    so their earlier days in it may not have been tracked.
 *  - startedAfterRange: the whole range is before any recorded follow, so its zero
 *    means "nothing recorded yet", not "nobody followed".
 *  - quiet: nothing in this range and nothing recorded for at least
 *    QUIET_AFTER_DAYS before it, so the feed may have stopped (a paused
 *    automation, a rotated secret, Meta pausing the trigger). Measured against
 *    `now` too, so a range that has only just begun (or starts later) never
 *    reads as a stopped feed after a few hours of normal silence.
 *  - chartFillsIn: a bot began tracking inside this range, so its daily chart
 *    has fewer than MIN_CHART_DAYS days so far, and this range will still reach
 *    that many. The card holds the chart back until then. A range that ends now
 *    gains a day every day; Last month and custom dates only up to their last
 *    day, so once that has passed the card draws the days it has instead of
 *    promising more that can never come.
 */
export interface FollowCoverage {
  previousComparable: boolean;
  lateBots: TrackedBot[];
  startedAfterRange: boolean;
  quiet: boolean;
  chartFillsIn: boolean;
}

export function followCoverage(
  report: FollowReport,
  range: { from: string; to: string; prevFrom: string; rangeKey: RangeKey },
  now: number = Date.now()
): FollowCoverage {
  const bots = report.trackedBots;
  if (!report.tracking || bots.length === 0) {
    return {
      previousComparable: false,
      lateBots: [],
      startedAfterRange: false,
      quiet: false,
      chartFillsIn: false,
    };
  }
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const prevFrom = Date.parse(range.prevFrom);
  const firsts = bots.map((b) => Date.parse(b.firstFollowedAt));
  const last = Math.max(...bots.map((b) => Date.parse(b.lastFollowedAt)));
  const lateBots = bots.filter((_, i) => firsts[i] > from && firsts[i] < to);
  return {
    previousComparable: Math.max(...firsts) <= prevFrom,
    lateBots,
    startedAfterRange: Math.min(...firsts) >= to,
    quiet:
      report.follows === 0 &&
      last < from &&
      from <= now &&
      now - last >= QUIET_AFTER_DAYS * DAY_MS,
    chartFillsIn:
      report.series.length < MIN_CHART_DAYS &&
      lateBots.length > 0 &&
      (RANGES_ENDING_NOW.has(range.rangeKey) ||
        chartDaysInRange(from, to, Math.min(...firsts)) >= MIN_CHART_DAYS),
  };
}

/**
 * How many days a fixed range's chart holds once the range is over: the SQL
 * report's series runs, in UTC days, from the range start or the first tracked
 * follow (whichever is later) to the range's last day.
 */
function chartDaysInRange(from: number, to: number, firstFollow: number): number {
  const utcDay = (ms: number) => Math.floor(ms / DAY_MS);
  return utcDay(to - 1000) - Math.max(utcDay(from), utcDay(firstFollow)) + 1;
}

/* ------------------------------------------------------------------ *
 * What the Statistics page shows, and for which chatbots
 * ------------------------------------------------------------------ */

/** A workspace chatbot as the Statistics page knows it (lib/workspace.ts WorkspaceBot). */
export interface ScopeBot {
  id: string;
  name: string;
  is_active: boolean;
  platforms: string[];
}

/**
 * The Instagram chatbots in scope, and the ones among them that can record a
 * follow right now. The webhook refuses a follow for a switched-off chatbot (its
 * lookup requires is_active) and for an account whose plan is inactive, and
 * ManyChat never sends a refused follow again, so setup is only offered where
 * following the steps would record something.
 */
export function followScope<B extends ScopeBot>(
  bots: readonly B[],
  scopedBotId: string | null,
  planActive: boolean
): { instagram: B[]; recordable: B[] } {
  const instagram = bots.filter(
    (b) => (!scopedBotId || b.id === scopedBotId) && b.platforms.includes("instagram")
  );
  return { instagram, recordable: planActive ? instagram.filter((b) => b.is_active) : [] };
}

/** "Set it up" links for the recordable Instagram chatbots that haven't recorded a follow yet. */
export function followSetupLinks(
  recordable: readonly ScopeBot[],
  report: FollowReport | null
): { name: string; href: string }[] {
  const tracked = new Set((report?.trackedBots ?? []).map((b) => b.id));
  return recordable
    .filter((b) => !tracked.has(b.id))
    .map((b) => ({ name: b.name, href: followSetupHref(b.id) }));
}

/**
 * Whether Statistics shows the follower card: the report once anything is
 * tracked, else the setup prompt when there is a chatbot to set it up on and this
 * account's prompt isn't hidden.
 */
export function followCardVisible(
  report: FollowReport | null,
  setupLinks: number,
  hidden: boolean
): boolean {
  return !!report && (report.tracking || (setupLinks > 0 && !hidden));
}

/** What the Statistics skeleton holds in the follower card's place while the report loads. */
export type FollowSkeleton = "report" | "setup" | null;

export function followSkeleton(opts: {
  /** probeFollowTracking's answer (null: couldn't tell, read as no). */
  tracking: boolean | null;
  /** Recordable Instagram chatbots in scope (followScope). */
  recordable: number;
  hidden: boolean;
}): FollowSkeleton {
  if (opts.tracking) return "report";
  if (opts.recordable > 0 && !opts.hidden) return "setup";
  return null;
}

/** Why nothing is being recorded right now for the tracked chatbots in scope, if anything stops it. */
export interface FollowPause {
  planInactive: boolean;
  /** Names of tracked chatbots in scope that are switched off (their AI replies are off). */
  botsOff: string[];
}

export function followPause(
  report: FollowReport,
  bots: readonly ScopeBot[],
  planActive: boolean
): FollowPause {
  const byId = new Map(bots.map((b) => [b.id, b]));
  return {
    planInactive: report.tracking && !planActive,
    botsOff: report.trackedBots.flatMap((t) => {
      const b = byId.get(t.id);
      return b && !b.is_active ? [b.name] : [];
    }),
  };
}

/**
 * Whether any chatbot of `userId` (or only `chatbotId`) has recorded a follow: one
 * index probe the Statistics page runs beside its other shell reads, so the
 * skeleton holds a place the size of the card that will land. The user filter
 * matters under "View as client", where the superadmin's RLS reads every tenant.
 * Null when it can't tell (the table isn't there yet, an error).
 */
export async function probeFollowTracking(
  supabase: ServerClient,
  opts: { userId: string; chatbotId: string | null }
): Promise<boolean | null> {
  let q = supabase
    .from("instagram_follows")
    .select("chatbot_id, chatbots!inner(user_id)")
    .eq("chatbots.user_id", opts.userId)
    .limit(1);
  if (opts.chatbotId) q = q.eq("chatbot_id", opts.chatbotId);
  const { data, error } = await q;
  if (error) return null;
  return Array.isArray(data) && data.length > 0;
}

/** One bar of the follower chart. */
export interface FollowBar {
  /** The first and last UTC day it covers (the same day when days are not grouped). */
  day: string;
  lastDay: string;
  /** How many days it covers. */
  days: number;
  follows: number;
}

/**
 * At most `maxBars` bars: past that, consecutive days are added together. The
 * groups are cut from the END, so the newest bar always covers a full group and
 * only the oldest bar can be short. Totals are kept exactly. The card draws each
 * bar's follows per day, so a short oldest bar is not drawn as a drop.
 */
export function bucketFollowSeries(series: FollowDay[], maxBars: number = MAX_CHART_BARS): FollowBar[] {
  const size = Math.max(1, Math.ceil(series.length / Math.max(1, maxBars)));
  const out: FollowBar[] = [];
  for (let end = series.length; end > 0; end -= size) {
    const chunk = series.slice(Math.max(0, end - size), end);
    out.push({
      day: chunk[0].day,
      lastDay: chunk[chunk.length - 1].day,
      days: chunk.length,
      follows: chunk.reduce((sum, d) => sum + d.follows, 0),
    });
  }
  return out.reverse();
}

/** The Connection tab section of one bot, where "Set it up" goes. */
export function followSetupHref(botId: string): string {
  return `/chatbots/${botId}?tab=connection#${FOLLOWERS_ANCHOR}`;
}
