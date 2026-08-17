/**
 * The contacts inside one funnel stage on the Statistics page.
 *
 * The funnel drill-down ("click a stage to see who's in it") used to be a URL
 * param that re-ran the ENTIRE statistics report on the server. It now loads
 * client-side from `/api/statistics/stage`, which calls this. The logic is lifted
 * verbatim from the old server-side `loadStage` so the members shown are
 * identical.
 *
 * The first three stages come from the RPC that already backs the funnel
 * (getStageConversations); `subscribed` is SpeedSettr's own conversion marker
 * (`confirmed_at`), counted here on the same created_at basis the stage count
 * uses so the list can never exceed the stage above it.
 */
import type { createClient } from "@/lib/supabase/server";
import { getStageConversations, type FunnelStage } from "@/lib/analytics";
import { contactDisplayName } from "@/lib/contact";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export const STAGE_KEYS = [
  "entry",
  "replied",
  "link_sent",
  "subscribed",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export function isStageKey(v: string | null | undefined): v is StageKey {
  return !!v && (STAGE_KEYS as readonly string[]).includes(v);
}

export interface StageMember {
  id: string;
  name: string;
  date: string;
}

export async function loadStageMembers(
  supabase: ServerClient,
  opts: {
    stage: StageKey;
    userId: string;
    from: string;
    to: string;
    chatbotId: string | null;
    limit: number;
  },
): Promise<StageMember[]> {
  const { stage, userId, from, to, chatbotId, limit } = opts;

  if (stage !== "subscribed") {
    const list = await getStageConversations(supabase, {
      stage: stage as FunnelStage,
      from,
      to,
      chatbotId,
      limit,
    });
    return list.map((r) => ({
      id: r.id,
      name: contactDisplayName(r.contact_name, r.contact_username),
      date: r.created_at,
    }));
  }

  let q = supabase
    .from("conversations")
    .select("id, contact_name, contact_username, created_at")
    .eq("user_id", userId)
    .not("confirmed_at", "is", null)
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (chatbotId) q = q.eq("chatbot_id", chatbotId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: contactDisplayName(r.contact_name, r.contact_username),
    date: r.created_at,
  }));
}
