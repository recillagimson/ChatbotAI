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

export async function getAnalyticsOverview(
  supabase: ServerClient,
  opts: { from: string; to: string; chatbotId?: string | null }
): Promise<AnalyticsOverview | null> {
  const { data, error } = await supabase.rpc("analytics_overview", {
    p_from: opts.from,
    p_to: opts.to,
    p_chatbot_id: opts.chatbotId ?? null,
  });
  if (error) {
    console.error("[analytics] overview failed", error);
    return null;
  }
  return data as AnalyticsOverview | null;
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

/** Conversion percentage; returns null when the denominator is 0 (caller renders "—"). */
export function safePct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}
