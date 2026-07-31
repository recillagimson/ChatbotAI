import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendManychatMessage, resolveManychatApiKey } from "@/lib/manychat";
import { toPlatform, canPushPlatform } from "@/lib/platforms";
import { splitIntoMessages } from "@/lib/message-split";
import { retryStillDeliverable, retryMessageTag } from "@/lib/messaging-window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 7; // widest send window (IG HUMAN_AGENT) - older rows can't deliver anyway
const MAX_ATTEMPTS = 5; // give up after this many reconcile retries
const BATCH = 100;

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Reconcile genuinely-dropped ManyChat pushes: retry messages a send-path threw on
 * (delivery_status='failed') that are STILL deliverable. Safety rules:
 *  - only SINGLE-bubble messages are retried - a multi-bubble reply may have had
 *    some bubbles delivered before the failure, so re-sending would duplicate; those
 *    are marked 'abandoned' (surfaced, not resent).
 *  - only inside the channel's send window (24h, or 7d for a human_agent reply via
 *    HUMAN_AGENT); out-of-window rows are 'abandoned' (Instagram can't deliver them).
 *  - capped at MAX_ATTEMPTS so a permanently-failing row can't loop forever.
 * A success flips the row to 'delivered'; postSendContent's own assume-delivered
 * logic keeps a re-send from duplicating on an ambiguous timeout.
 */
async function run() {
  const supabase = createServiceClient();
  const nowMs = Date.now();
  const lookbackIso = new Date(nowMs - LOOKBACK_DAYS * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, content, role, delivery_attempts, conversation_id, " +
        "conversations!inner(manychat_subscriber_id, platform, chatbots!inner(manychat_api_key_enc))"
    )
    .eq("delivery_status", "failed")
    .lt("delivery_attempts", MAX_ATTEMPTS)
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("[reconcile-pushes] query error", error);
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    content: string | null;
    role: string;
    delivery_attempts: number;
    conversation_id: string;
    conversations: {
      manychat_subscriber_id: string | null;
      platform: string | null;
      chatbots: { manychat_api_key_enc: string | null } | null;
    } | null;
  }>;

  const reasons: Record<string, number> = {};
  let delivered = 0;
  let abandoned = 0;
  let retried = 0;

  const setStatus = (id: string, status: string, attempts?: number) =>
    supabase
      .from("messages")
      .update(attempts == null ? { delivery_status: status } : { delivery_status: status, delivery_attempts: attempts })
      .eq("id", id);

  for (const row of rows) {
    const conv = row.conversations;
    const text = (row.content ?? "").trim();
    const platform = toPlatform(conv?.platform);

    // Nothing deliverable / unrecoverable config → abandon (don't loop).
    if (!text || !conv?.manychat_subscriber_id || !canPushPlatform(platform)) {
      await setStatus(row.id, "abandoned");
      abandoned++; bump(reasons, "not_sendable");
      continue;
    }
    // Multi-bubble reply: some bubbles may already be delivered → re-sending would
    // duplicate. Never auto-retry these.
    if (splitIntoMessages(text).length > 1) {
      await setStatus(row.id, "abandoned");
      abandoned++; bump(reasons, "multi_bubble");
      continue;
    }

    // The contact's last INBOUND is the messaging-window anchor (outbound rows
    // don't reopen the window). Unknown → treat as closed.
    const { data: lastIn } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", row.conversation_id)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastInboundMs = lastIn?.created_at ? Date.parse(lastIn.created_at as string) : null;

    if (!retryStillDeliverable(platform, row.role, lastInboundMs, nowMs)) {
      await setStatus(row.id, "abandoned");
      abandoned++; bump(reasons, "out_of_window");
      continue;
    }

    let apiKey: string;
    try {
      apiKey = resolveManychatApiKey(conv.chatbots ?? {});
    } catch {
      await setStatus(row.id, "abandoned");
      abandoned++; bump(reasons, "no_api_key");
      continue;
    }

    retried++;
    try {
      await sendManychatMessage({
        subscriberId: conv.manychat_subscriber_id,
        text,
        apiKey,
        platform,
        messageTag: retryMessageTag(platform, row.role),
      });
      await setStatus(row.id, "delivered");
      delivered++; bump(reasons, "delivered");
    } catch (err) {
      const attempts = (row.delivery_attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await setStatus(row.id, "abandoned", attempts);
        abandoned++; bump(reasons, "max_attempts");
      } else {
        // Keep 'failed' + bump the counter so the next run retries.
        await setStatus(row.id, "failed", attempts);
        bump(reasons, "retry_failed");
      }
      console.error("[reconcile-pushes] resend failed", row.id, err instanceof Error ? err.message : err);
    }
  }

  return { ok: true, checked: rows.length, retried, delivered, abandoned, reasons };
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Vercel Cron triggers a GET with `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await run());
  } catch (err) {
    console.error("[reconcile-pushes] run error", err);
    return NextResponse.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}
