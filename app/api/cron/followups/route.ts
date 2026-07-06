import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  evaluateFollowup,
  sendFollowup,
  IG_WINDOW_DAYS,
  FOLLOWUP_ENABLED,
  RN_ENABLED,
} from "@/lib/followup";
import { resolveManychatApiKey } from "@/lib/manychat";
import { fetchFollowupAssets, resolveAssetByKey } from "@/lib/followup-assets";
import type { Chatbot, Conversation, FollowupAsset } from "@/lib/types";

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
  | "auto_followup_template"
  | "auto_followup_steps"
  | "auto_followup_loop_last"
  | "keyword_gate_enabled"
  | "manychat_api_key_enc"
>;

type CandidateRow = Pick<
  Conversation,
  | "id"
  | "manychat_subscriber_id"
  | "contact_name"
  | "status"
  | "platform"
  | "last_message_at"
  | "last_followup_at"
  | "followup_count"
  | "followup_step_index"
  | "confirmed_at"
  | "rn_opt_in_at"
  | "keyword_fired"
> & { chatbots: FollowupChatbotRow };

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function run() {
  const supabase = createServiceClient();
  const now = new Date();
  // Coarse lookback: any active, unconfirmed conversation whose last inbound is
  // within the widest window we might still send in (IG's 7-day cap; Telegram
  // has no window but a 7-day scan is a sane bound). evaluateFollowup() does the
  // exact per-step, per-platform, 24h-standard-window decision.
  const lookbackStart = new Date(now.getTime() - IG_WINDOW_DAYS * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, manychat_subscriber_id, contact_name, status, platform, last_message_at, last_followup_at, followup_count, followup_step_index, confirmed_at, rn_opt_in_at, keyword_fired, " +
        "chatbots!inner(id, user_id, auto_followup_enabled, auto_followup_days, auto_followup_template, auto_followup_steps, auto_followup_loop_last, keyword_gate_enabled, manychat_api_key_enc)"
    )
    .eq("status", "active")
    .is("confirmed_at", null)
    // Never drip to a lead who self-muted the AI ("stopmessage") — proactive
    // follow-ups would contradict the "I'll hold off" confirmation and risk an
    // IG spam report. NOTE: filtering on this column requires the
    // 2026-07-06-user-mute migration applied (an unknown column errors the whole
    // query, unlike the webhook's fail-open reads).
    .is("user_muted_at", null)
    .eq("chatbots.auto_followup_enabled", true)
    .gte("last_message_at", lookbackStart)
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

  // Per-chatbot asset cache: only fetch when a due step actually references one.
  const assetCache = new Map<string, FollowupAsset[]>();
  const assetsFor = async (chatbotId: string): Promise<FollowupAsset[]> => {
    let cached = assetCache.get(chatbotId);
    if (!cached) {
      cached = await fetchFollowupAssets(supabase, chatbotId);
      assetCache.set(chatbotId, cached);
    }
    return cached;
  };

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
    // Keyword-only reply mode: never proactively drip a contact the gate has
    // been ignoring. keyword_fired non-empty = this contact matched a keyword at
    // least once (engaged); empty = a stranger the bot never answered, so a
    // follow-up would contradict the gate. (Requires the 2026-07-06-keyword-gate
    // migration; the select above already depends on it.) Edge (safe direction):
    // a message-mode group's first match that landed mid-burst or was text-less
    // isn't marked in keyword_fired, so that engaged contact simply gets no
    // proactive drip — never the reverse (a stranger is never dripped).
    if (cb.keyword_gate_enabled && !(Array.isArray(row.keyword_fired) && row.keyword_fired.length)) {
      skipped++;
      bump(reasons, "keyword_gated");
      continue;
    }
    const decision = evaluateFollowup(cb, row, now, { rnEnabled: RN_ENABLED });
    if (!decision.due || !decision.step) {
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
    // Resolve the step's asset (if any) from the chatbot's library. A stale key
    // (asset deleted after the step was saved) degrades to text-only; log it so
    // the owner-facing diagnostics can surface the broken step.
    let asset: FollowupAsset | null = null;
    if (decision.step.asset_key) {
      asset = resolveAssetByKey(await assetsFor(cb.id), decision.step.asset_key);
      if (!asset) {
        bump(reasons, "asset_missing");
        await supabase
          .from("usage_log")
          .insert({
            user_id: cb.user_id,
            chatbot_id: cb.id,
            event_type: "followup_asset_missing",
            tokens_used: 0,
          })
          .then(
            () => {},
            () => {}
          );
      }
    }
    try {
      const content = await sendFollowup(
        supabase,
        row,
        decision.step,
        asset,
        now,
        apiKey,
        decision.nextStepIndex ?? (row.followup_step_index ?? 0) + 1,
        {
          // Past the standard 24h window (RN path only): IG accepts HUMAN_AGENT;
          // other channels take no tag (Telegram has no window, Messenger RN
          // delivery runs through the RN topic flow).
          messageTag:
            decision.outOfWindow && row.platform === "instagram"
              ? "HUMAN_AGENT"
              : undefined,
        }
      );
      if (content === null) {
        // Another concurrent run claimed this conversation first — not an error.
        skipped++;
        bump(reasons, "claim_lost");
      } else {
        sent++;
      }
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
  if (!FOLLOWUP_ENABLED) {
    return NextResponse.json({ ok: true, disabled: "followup_feature_disabled" });
  }
  const result = await run();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
