import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type RangeKey = "7d" | "30d" | "month" | "lastmonth" | "all" | "custom";
export type FunnelStage = "entry" | "replied" | "link_sent";

export interface ResolvedRange {
  from: string;          // ISO inclusive lower bound
  to: string;            // ISO exclusive upper bound
  rangeKey: RangeKey;
  customFrom?: string;   // yyyy-mm-dd echoed for the date inputs
  customTo?: string;
}

export interface AnalyticsOverview {
  funnel: { entry: number; replied: number; link_sent: number };
  response_time: { avg_secs: number | null; median_secs: number | null };
  status_split: { active: number; ai_paused: number; closed: number };
  messages: { total: number; avg_per_convo: number };
  usage: { ai_replies: number; tokens: number; delivery_failures: number };
  followups: { followups_sent: number; conv_with_followup: number };
  series: { day: string; conversations: number; ai_replies: number }[];
}

export interface StageConversation {
  id: string;
  contact_username: string | null;
  contact_name: string | null;
  created_at: string;
  total: number;
}

const RANGE_KEYS: RangeKey[] = ["7d", "30d", "month", "lastmonth", "all", "custom"];

/**
 * Resolve URL params (?range / ?from / ?to) into explicit ISO bounds.
 * Custom from+to (yyyy-mm-dd) override the range key. Defaults to 30d.
 */
export function resolveRange(params: { range?: string; from?: string; to?: string }): ResolvedRange {
  const now = new Date();

  if (params.from && params.to) {
    const from = new Date(`${params.from}T00:00:00`);
    const to = new Date(`${params.to}T23:59:59.999`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        rangeKey: "custom",
        customFrom: params.from,
        customTo: params.to,
      };
    }
  }

  const key: RangeKey = RANGE_KEYS.includes(params.range as RangeKey)
    ? (params.range as RangeKey)
    : "30d";

  let from: Date;
  let to: Date = now;
  switch (key) {
    case "7d":
      from = new Date(now);
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "lastmonth":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 1); // start of this month (exclusive)
      break;
    case "all":
      from = new Date("2020-01-01T00:00:00Z");
      break;
    case "30d":
    case "custom": // custom with invalid dates falls through to a sane default
    default:
      from = new Date(now);
      from.setDate(from.getDate() - 30);
  }

  return { from: from.toISOString(), to: to.toISOString(), rangeKey: key === "custom" ? "30d" : key };
}

/**
 * Why the report didn't come back. Worth telling apart, because the fix differs
 * and the wrong message sends someone to re-run a migration that is already
 * applied:
 *  - `not_installed` - the SQL functions were never applied to this database.
 *  - `timed_out`     - they're installed, but the query exceeded the statement
 *                      timeout. Real symptom on a large multi-tenant dataset.
 *  - `failed`        - anything else (permissions, a transport error).
 */
export type AnalyticsProblem = "not_installed" | "timed_out" | "failed";

export interface AnalyticsResult {
  overview: AnalyticsOverview | null;
  problem: AnalyticsProblem | null;
}

/** Postgres/PostgREST codes for "that function isn't there". */
const MISSING_FN_CODES = new Set(["PGRST202", "PGRST203", "42883"]);
/** Postgres: canceling statement due to statement timeout. */
const TIMEOUT_CODE = "57014";

export async function getAnalyticsOverview(
  supabase: ServerClient,
  opts: { from: string; to: string; chatbotId?: string | null }
): Promise<AnalyticsResult> {
  const { data, error } = await supabase.rpc("analytics_overview", {
    p_from: opts.from,
    p_to: opts.to,
    p_chatbot_id: opts.chatbotId ?? null,
  });
  if (error) {
    console.error("[analytics] overview failed", error);
    return { overview: null, problem: classifyAnalyticsError(error) };
  }
  return { overview: data as AnalyticsOverview | null, problem: null };
}

/** Map a PostgREST error to the reason a screen should show. */
export function classifyAnalyticsError(error: {
  code?: string | null;
}): AnalyticsProblem {
  const code = error.code ?? "";
  if (MISSING_FN_CODES.has(code)) return "not_installed";
  if (code === TIMEOUT_CODE) return "timed_out";
  return "failed";
}

export async function getStageConversations(
  supabase: ServerClient,
  opts: { stage: FunnelStage; from: string; to: string; chatbotId?: string | null; limit?: number; offset?: number }
): Promise<StageConversation[]> {
  const { data, error } = await supabase.rpc("analytics_stage_conversations", {
    p_stage: opts.stage,
    p_from: opts.from,
    p_to: opts.to,
    p_chatbot_id: opts.chatbotId ?? null,
    p_limit: opts.limit ?? 6,
    p_offset: opts.offset ?? 0,
  });
  if (error) {
    console.error("[analytics] stage list failed", error);
    return [];
  }
  return (data ?? []) as StageConversation[];
}

/** Conversion percentage; returns null when the denominator is 0 (caller renders "-"). */
export function safePct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}
