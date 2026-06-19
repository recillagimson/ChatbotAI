import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  evaluateFollowup,
  sendFollowup,
  IG_WINDOW_DAYS,
  FOLLOWUP_ENABLED,
} from "@/lib/followup";
import { resolveManychatApiKey } from "@/lib/manychat";
import type { Chatbot, Conversation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

type FollowupChatbotRow = Pick<
  Chatbot,
  | "id"
  | "user_id"
  | "auto_followup_enabled"
  | "auto_followup_days"
  | "auto_followup_repeat"
  | "auto_followup_max"
  | "auto_followup_template"
  | "manychat_api_key_enc"
>;

type CandidateRow = Pick<
  Conversation,
  | "id"
  | "manychat_subscriber_id"
  | "contact_name"
  | "status"
  | "last_message_at"
  | "last_followup_at"
  | "followup_count"
> & { chatbots: FollowupChatbotRow };

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function run() {
  const supabase = createServiceClient();
  const now = new Date();
  const sevenDaysAgo = new Date(
    now.getTime() - IG_WINDOW_DAYS * DAY_MS
  ).toISOString();
  const oneDayAgo = new Date(now.getTime() - DAY_MS).toISOString();

  // Coarse candidates: active conversations whose last inbound is 1–7 days old
  // and whose chatbot has follow-up enabled. evaluateFollowup() does the exact
  // per-row decision (days elapsed, repeat cap, window).
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, manychat_subscriber_id, contact_name, status, last_message_at, last_followup_at, followup_count, " +
        "chatbots!inner(id, user_id, auto_followup_enabled, auto_followup_days, auto_followup_repeat, auto_followup_max, auto_followup_template, manychat_api_key_enc)"
    )
    .eq("status", "active")
    .eq("chatbots.auto_followup_enabled", true)
    .gte("last_message_at", sevenDaysAgo)
    .lte("last_message_at", oneDayAgo)
    .limit(500);

  if (error) {
    console.error("[cron-followups] query failed", error);
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as unknown as CandidateRow[];

  // Only send for owners with an active/trialing subscription.
  const ownerIds = Array.from(new Set(rows.map((r) => r.chatbots.user_id)));
  const activeOwners = new Set<string>();
  if (ownerIds.length) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("user_id, status")
      .in("user_id", ownerIds);
    for (const s of subs ?? []) {
      if (["active", "trialing"].includes(s.status)) activeOwners.add(s.user_id);
    }
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const reasons: Record<string, number> = {};

  for (const row of rows) {
    const cb = row.chatbots;
    if (!activeOwners.has(cb.user_id)) {
      skipped++;
      bump(reasons, "sub_inactive");
      continue;
    }
    const decision = evaluateFollowup(cb, row, now);
    if (!decision.due) {
      skipped++;
      bump(reasons, decision.reason);
      continue;
    }
    let apiKey: string;
    try {
      apiKey = resolveManychatApiKey(cb);
    } catch {
      errors++;
      bump(reasons, "manychat_key_unavailable");
      continue;
    }
    try {
      await sendFollowup(supabase, row, cb.auto_followup_template!, now, apiKey);
      sent++;
    } catch (err) {
      errors++;
      console.error("[cron-followups] send failed for conversation", row.id, err);
    }
  }

  return { ok: true, checked: rows.length, sent, skipped, errors, reasons };
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Vercel Cron triggers a GET and (when CRON_SECRET is set in env) attaches
// `Authorization: Bearer <CRON_SECRET>`. We require that header.
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Parked: Instagram blocks sends >24h after the contact's last message, so
  // there's no point scanning/sending until the Recurring Notifications opt-in
  // exists. Flip FOLLOWUP_ENABLED in lib/followup.ts to activate.
  if (!FOLLOWUP_ENABLED) {
    return NextResponse.json({ ok: true, disabled: "followup_feature_parked" });
  }
  const result = await run();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
