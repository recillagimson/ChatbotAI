/**
 * Statistics CSV export.
 *
 * Two shapes behind one route, matching the two export buttons on the page:
 *  - no `stage` → the daily series (one row per day) plus a summary block, which
 *    is what "Export CSV" in the header offers.
 *  - `stage=entry|replied|link_sent|subscribed` → the threads in that funnel
 *    stage, which is what "Export stage" beside the funnel offers.
 *
 * Scoped by the caller's own session, never by a service key: the RLS-scoped
 * client is the tenancy boundary, and `user_id` is pinned on every query on top
 * of it so a hand-edited `bot` id can't reach another workspace.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  getAnalyticsOverview,
  getStageConversations,
  resolveRange,
  type FunnelStage,
} from "@/lib/analytics";
import { contactDisplayName } from "@/lib/contact";

export const dynamic = "force-dynamic";

const RPC_STAGES: readonly FunnelStage[] = ["entry", "replied", "link_sent"];

/** Escape one CSV field: quote it, and double any quote inside it. */
function cell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  // A leading =, +, - or @ is executed as a formula by Excel and Sheets when the
  // file is opened. Prefixing with a quote keeps the value readable and inert -
  // contact names come from Instagram and are entirely attacker-controlled.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csv(rows: unknown[][]): string {
  // \r\n and a UTF-8 BOM: Excel needs both to open accented names correctly.
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

function filename(parts: (string | null)[]): string {
  return `${parts.filter(Boolean).join("-").replace(/[^a-z0-9-]+/gi, "-")}.csv`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = await createClient();
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const { from, to, rangeKey } = resolveRange(sp);

  // An unknown bot id resolves to nothing rather than to "all bots": every query
  // below also pins user_id, so the worst case is an empty file, never someone
  // else's data.
  const botParam = typeof sp.bot === "string" && sp.bot ? sp.bot : null;
  let chatbotId: string | null = null;
  if (botParam) {
    const { data: bot } = await supabase
      .from("chatbots")
      .select("id")
      .eq("id", botParam)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!bot) {
      return NextResponse.json({ error: "Unknown chatbot" }, { status: 404 });
    }
    chatbotId = bot.id;
  }

  const stage = typeof sp.stage === "string" ? sp.stage : null;

  // ---- Stage export --------------------------------------------------------
  if (stage) {
    let rows: { id: string; name: string; created_at: string }[] = [];

    if (RPC_STAGES.includes(stage as FunnelStage)) {
      const list = await getStageConversations(supabase, {
        stage: stage as FunnelStage,
        from,
        to,
        chatbotId,
        // The funnel's own drill-down pages 8 at a time; an export is the place
        // where you want the whole stage, so ask for a real ceiling instead.
        limit: 5000,
      });
      rows = list.map((r) => ({
        id: r.id,
        name: contactDisplayName(r.contact_name, r.contact_username),
        created_at: r.created_at,
      }));
    } else if (stage === "subscribed") {
      // Bounded and dated by created_at, exactly as the funnel counts and lists
      // it on the page. Filtering on confirmed_at instead would hand back a
      // different set of threads than the stage you clicked to export.
      let q = supabase
        .from("conversations")
        .select("id, contact_name, contact_username, created_at")
        .eq("user_id", user.id)
        .not("confirmed_at", "is", null)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (chatbotId) q = q.eq("chatbot_id", chatbotId);
      const { data } = await q;
      rows = (data ?? []).map((r) => ({
        id: r.id,
        name: contactDisplayName(r.contact_name, r.contact_username),
        created_at: r.created_at,
      }));
    } else {
      return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
    }

    const body = csv([
      ["Contact", "Date", "Conversation ID"],
      ...rows.map((r) => [r.name, r.created_at, r.id]),
    ]);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename(["speedsettr", stage, rangeKey])}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ---- Whole-period export -------------------------------------------------
  const { overview, problem } = await getAnalyticsOverview(supabase, {
    from,
    to,
    chatbotId,
  });

  if (!overview) {
    // Don't hand back an empty spreadsheet that looks like a quiet month.
    return NextResponse.json(
      { error: `Analytics unavailable (${problem ?? "failed"})` },
      { status: 503 }
    );
  }

  const body = csv([
    ["SpeedSettr statistics"],
    ["Range", from, to],
    [],
    ["Metric", "Value"],
    ["Conversations", overview.funnel.entry],
    ["Bot replied", overview.funnel.replied],
    ["Link sent", overview.funnel.link_sent],
    ["AI replies", overview.usage.ai_replies],
    ["Delivery failures", overview.usage.delivery_failures],
    ["Median first response (secs)", overview.response_time.median_secs ?? ""],
    ["Follow-ups sent", overview.followups.followups_sent],
    ["Threads with a follow-up", overview.followups.conv_with_followup],
    [],
    ["Day", "Conversations", "AI replies"],
    ...overview.series.map((d) => [d.day, d.conversations, d.ai_replies]),
  ]);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename(["speedsettr-statistics", rangeKey])}"`,
      "Cache-Control": "no-store",
    },
  });
}
