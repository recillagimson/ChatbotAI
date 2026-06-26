import { NextResponse, type NextRequest, unstable_after as after } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  verifyManychatSecret,
  sendManychatMessage,
  sendManychatMessagePaced,
  pacingEnabled,
  resolveManychatApiKey,
  ManychatKeyError,
} from "@/lib/manychat";
import { generateReply } from "@/lib/anthropic";
import { splitIntoMessages } from "@/lib/message-split";
import { buildKbBlock } from "@/lib/retrieval";
import {
  checkRateLimit,
  checkMonthlyCap,
  checkDuplicate,
  cacheLastReply,
  incrementMonthlyCount,
  getTrivialReply,
} from "@/lib/limits";
import { type Platform, toPlatform, canPushPlatform } from "@/lib/platforms";
import type { Chatbot, Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  chatbot_id: z.string().uuid(),
  subscriber_id: z.union([z.string(), z.number()]).transform(String),
  page_id: z.union([z.string(), z.number()]).transform(String).optional(),
  // Channel this flow runs on. One ManyChat flow per channel sends a literal value
  // ("instagram"|"messenger"|"whatsapp"|"telegram"|"tiktok"). Coerced to a known
  // Platform below; the legacy IG flow omits it and defaults to instagram.
  platform: z.union([z.string(), z.number()]).transform(String).optional(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  message: z.string().min(1).max(4000),
});

/**
 * Format a reply in ManyChat's External Request response schema. ManyChat
 * requires a top-level `version` plus `content.messages`; when present it
 * renders those messages directly, so no separate "Send Message" step is
 * needed. We also keep a flat `reply` field for our own tooling (chat-test,
 * docs/API.md). An empty `text` yields no message (used for human takeover).
 */
function manychatReply(text: string, extra: Record<string, unknown> = {}) {
  // Split into bubbles so the response body matches what we push (multiple
  // short DMs instead of one wall of text); an empty `text` yields no message.
  const bubbles = text ? splitIntoMessages(text) : [];
  return NextResponse.json({
    version: "v2",
    content: { messages: bubbles.map((t) => ({ type: "text", text: t })) },
    reply: text,
    ...extra,
  });
}

/**
 * Durable record that a reply was saved but never delivered (ManyChat push
 * failed after retries). usage_log's event_type is free text, so no migration;
 * scripts/diag-noreply.ps1 surfaces these. Best-effort: a logging failure must
 * never break the response.
 */
async function logPushFailure(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  chatbotId: string,
  eventType: string = "push_failed"
): Promise<void> {
  try {
    await supabase.from("usage_log").insert({
      user_id: userId,
      chatbot_id: chatbotId,
      event_type: eventType,
      tokens_used: 0,
    });
  } catch {
    /* never throw from observability */
  }
}

/**
 * Helper for canned-reply paths (rate-limit-passed gates that bypass the AI):
 * persists the outbound message in the conversation and pushes via ManyChat.
 * Each side is independent — a ManyChat failure doesn't lose the DB row.
 */
async function persistAndPush(
  supabase: ReturnType<typeof createServiceClient>,
  conversationId: string,
  subscriberId: string,
  text: string,
  userId: string,
  chatbotId: string,
  apiKey: string | null,
  platform: Platform
): Promise<void> {
  // Push only on channels with a ManyChat send API; on non-pushable channels
  // (TikTok) the caller delivers the same `text` via the webhook response body.
  const push = apiKey && canPushPlatform(platform);
  await Promise.all([
    supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: text,
      ai_generated: false,
      tokens_used: 0,
    }),
    push
      ? sendManychatMessage({ subscriberId, text, apiKey, platform }).catch(async (err) => {
          console.error("[manychat-webhook] push send failed", err);
          await logPushFailure(supabase, userId, chatbotId);
        })
      : Promise.resolve(),
  ]);
}

/**
 * ManyChat External Request entry point. Returns a ManyChat-format response
 * (version + content.messages) so ManyChat sends the reply back directly.
 */
export async function POST(request: NextRequest) {
  const startedAt = performance.now(); // for the bubble-pacing deadline guard
  // 1. Read the shared secret header; it's verified AFTER the chatbot lookup
  // against that chatbot's own webhook_secret (with a legacy env fallback).
  const secret = request.headers.get("x-manychat-secret");

  // 2. Parse payload
  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const platform = toPlatform(body.platform);
  const supabase = createServiceClient();

  // 3. Look up chatbot + verify subscription is active.
  // Auth is the per-chatbot webhook_secret (verified in 3a). We no longer hard-
  // match page_id: a single chatbot now spans channels (IG/Messenger/etc.) each
  // with its OWN ManyChat page_id, so a single stored page_id can't gate them all.
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("*")
    .eq("id", body.chatbot_id)
    .eq("is_active", true)
    .maybeSingle<Chatbot>();

  // 3a. Authenticate: verify the secret against THIS chatbot's webhook_secret
  // (legacy env secret as fallback for un-migrated bots). A missing chatbot and
  // a bad secret return an identical 401 so a caller can't probe which case it is.
  if (!chatbot) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secretOk =
    verifyManychatSecret(secret, chatbot.webhook_secret) ||
    verifyManychatSecret(secret, process.env.MANYCHAT_WEBHOOK_SECRET);
  if (!secretOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", chatbot.user_id)
    .maybeSingle();

  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return manychatReply(
      "Thanks for your message! We'll get back to you shortly.",
      { ai_skipped: true, reason: "subscription_inactive" }
    );
  }

  // 3b. Resolve the ManyChat API key for this chatbot (decrypt the per-chatbot
  // key, or fall back to the global env key for un-migrated owners). A decrypt
  // failure is a HARD error — we NEVER fall back to the env key, which would push
  // this tenant's reply through the owner's account. On failure we log a distinct
  // event and leave apiKey null so pushes are skipped but messages still persist.
  let apiKey: string | null = null;
  try {
    apiKey = resolveManychatApiKey(chatbot);
  } catch (err) {
    const code = err instanceof ManychatKeyError ? err.code : "no_manychat_api_key";
    console.error("[manychat-webhook] api key unavailable", code);
    await logPushFailure(supabase, chatbot.user_id, chatbot.id, code);
  }

  // 4. Upsert conversation
  const displayName =
    [body.first_name, body.last_name].filter(Boolean).join(" ").trim() ||
    body.username ||
    null;

  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("chatbot_id", chatbot.id)
    .eq("manychat_subscriber_id", body.subscriber_id)
    .maybeSingle();

  let conversationId = existing?.id;
  let conversationStatus = existing?.status;

  if (!existing) {
    // Upsert, not insert: two simultaneous FIRST messages from one new
    // subscriber both pass the SELECT above with no row, and a plain INSERT
    // makes the loser violate unique(chatbot_id, manychat_subscriber_id) and
    // 500 with no reply. On conflict the loser merge-updates the winner's row
    // and gets back its real id/status. `status` is deliberately omitted:
    // the schema default covers fresh inserts, and a conflict-update must not
    // un-pause an ai_paused conversation (human takeover).
    const { data: created, error: convError } = await supabase
      .from("conversations")
      .upsert(
        {
          chatbot_id: chatbot.id,
          user_id: chatbot.user_id,
          manychat_subscriber_id: body.subscriber_id,
          platform,
          contact_name: displayName,
          contact_username: body.username ?? null,
        },
        { onConflict: "chatbot_id,manychat_subscriber_id" }
      )
      .select("id, status")
      .single();
    if (convError || !created) {
      // Any DB failure here must still produce a 200 + reply, never a 500.
      console.error("[manychat-webhook] conversation upsert failed", convError);
      return manychatReply(
        "Thanks for your message! We'll get back to you shortly.",
        { ai_skipped: true, reason: "conversation_error" }
      );
    }
    conversationId = created.id;
    conversationStatus = created.status;
  } else {
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: (existing.unread_count ?? 0) + 1,
        contact_name: existing.contact_name ?? displayName,
        contact_username: existing.contact_username ?? body.username ?? null,
        // The contact replied — re-arm auto follow-up for the next silence.
        followup_count: 0,
        last_followup_at: null,
      })
      .eq("id", existing.id);
  }

  // 5. Record inbound message
  await supabase.from("messages").insert({
    conversation_id: conversationId!,
    role: "user",
    content: body.message,
  });

  // 6. If human took over, do not generate AI reply
  if (conversationStatus === "ai_paused") {
    return manychatReply("", { ai_skipped: true, reason: "human_takeover" });
  }

  // 6a. Rate limit per (chatbot, subscriber). Silent drop on flood — no push,
  // no AI cost. The inbound message is already recorded so a spamming user is
  // still visible in the dashboard inbox.
  const rl = await checkRateLimit(chatbot.id, body.subscriber_id);
  if (!rl.ok) {
    return manychatReply("", {
      ai_skipped: true,
      reason: "rate_limited",
      limit: rl.limit,
    });
  }

  // 6b. Trivial-input shortcut: "thanks" / "ok" / 👍 → static ack, no AI.
  // Persona bots (custom system_prompt) skip this so even a "thanks" gets an
  // in-voice reply from the persona instead of a generic canned line.
  const trivial = chatbot.system_prompt ? null : getTrivialReply(body.message);
  if (trivial) {
    await persistAndPush(supabase, conversationId!, body.subscriber_id, trivial, chatbot.user_id, chatbot.id, apiKey, platform);
    return manychatReply(trivial, { ai_skipped: true, reason: "trivial_ack" });
  }

  // 6c. Duplicate-message dedup: same message inside 30s → echo prior reply.
  const dup = await checkDuplicate(chatbot.id, body.subscriber_id, body.message);
  if (dup.isDuplicate) {
    const echo = dup.lastReply ?? "Still on that, give me just a sec!";
    await persistAndPush(supabase, conversationId!, body.subscriber_id, echo, chatbot.user_id, chatbot.id, apiKey, platform);
    return manychatReply(echo, { ai_skipped: true, reason: "duplicate" });
  }

  // 6d. Per-chatbot monthly cap. Over → static fallback, no AI.
  const cap = await checkMonthlyCap(chatbot.id);
  if (!cap.ok) {
    const text = "Thanks for your message! We'll get back to you shortly.";
    await persistAndPush(supabase, conversationId!, body.subscriber_id, text, chatbot.user_id, chatbot.id, apiKey, platform);
    return manychatReply(text, {
      ai_skipped: true,
      reason: "monthly_cap_reached",
      current: cap.current,
      cap: cap.cap,
    });
  }

  // 7–9. Generate the AI reply, persist it + usage, and update Redis side-state.
  // Returns the reply text. Shared by both delivery paths below.
  const generateAndPersistReply = async (): Promise<string> => {
    // 7. Fetch recent history. Order desc + limit so we get the newest 11
    // (= 10 prior + the just-inserted user message), not the oldest.
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: false })
      .limit(11)
      .returns<Pick<Message, "role" | "content">[]>();

    // Desc order: [0] is the just-inserted user msg. Drop it, reverse to chrono.
    const priorHistory = (history ?? []).slice(1).reverse();

    // 8. Resolve KB (adaptive: full-context or vector retrieval) then generate.
    const kb = await buildKbBlock({
      supabase,
      chatbot,
      history: priorHistory,
      userMessage: body.message,
    });

    let replyText = "Thanks for the message, a teammate will follow up shortly.";
    let tokens = 0;
    try {
      const { text, tokensUsed } = await generateReply({
        chatbot,
        kbBlock: kb.block,
        history: priorHistory,
        userMessage: body.message,
      });
      if (text) {
        replyText = text;
        tokens = tokensUsed;
      }
    } catch (err) {
      console.error("[manychat-webhook] AI error", err);
    }

    // 9. Persist outbound + usage
    console.log(
      `[manychat-webhook] kb mode=${kb.mode} chunks=${kb.chunks} topSim=${kb.topSimilarity ?? "-"} bot=${chatbot.id} platform=${platform}`
    );
    await Promise.all([
      supabase.from("messages").insert({
        conversation_id: conversationId!,
        role: "assistant",
        content: replyText,
        ai_generated: true,
        tokens_used: tokens,
      }),
      supabase.from("usage_log").insert({
        user_id: chatbot.user_id,
        chatbot_id: chatbot.id,
        event_type: "ai_reply",
        tokens_used: tokens,
      }),
      supabase.from("usage_log").insert({
        user_id: chatbot.user_id,
        chatbot_id: chatbot.id,
        event_type: "kb_retrieval",
        tokens_used: kb.chunks,
      }),
    ]);

    // Redis side-state: cache for dedup echo + bump monthly counter (best-effort).
    await Promise.all([
      cacheLastReply(chatbot.id, body.subscriber_id, replyText),
      incrementMonthlyCount(chatbot.id),
    ]);

    return replyText;
  };

  // 10. Deliver. Two paths depending on whether the channel has a ManyChat send API:
  if (canPushPlatform(platform) && apiKey) {
    // PUSH channels (Instagram/Messenger/WhatsApp/Telegram): generate + push in
    // the background and ack instantly so ManyChat's ~10s External Request timeout
    // never trips. Delivery is via the Send Content API on the right channel.
    after(async () => {
      try {
        const replyText = await generateAndPersistReply();
        const bubbles = splitIntoMessages(replyText);
        try {
          if (pacingEnabled() && bubbles.length > 0) {
            // Paced even for a single bubble: a human-like typing delay before the
            // reply lands (see computeBubbleDelays), then drip-in for extra bubbles.
            await sendManychatMessagePaced({
              subscriberId: body.subscriber_id,
              bubbles,
              startedAt,
              apiKey,
              platform,
            });
          } else {
            await sendManychatMessage({ subscriberId: body.subscriber_id, text: bubbles, apiKey, platform });
          }
        } catch (err) {
          console.error("[manychat-webhook] push send failed", err);
          await logPushFailure(supabase, chatbot.user_id, chatbot.id);
        }
      } catch (err) {
        // after() runs detached — swallow so nothing crashes the background task.
        console.error("[manychat-webhook] background processing failed", err);
      }
    });
    return manychatReply("", { ai_queued: true });
  }

  // RESPONSE channels (TikTok — no ManyChat send API yet) OR no API key: ManyChat
  // can't be pushed to, so generate synchronously and RETURN the reply in the body
  // for the client's flow to deliver (map `reply`/render the dynamic content). This
  // shares the ~10s timeout risk we avoid for push channels, but TikTok replies are
  // short. Auto-upgrades to the push path once PLATFORM_META gives the channel a
  // sendContent type (canPush=true).
  let replyText = "Thanks for the message, a teammate will follow up shortly.";
  try {
    replyText = await generateAndPersistReply();
  } catch (err) {
    console.error("[manychat-webhook] sync processing failed", err);
  }
  return manychatReply(replyText, { ai_delivery: "response", platform });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "manychat-webhook" });
}
