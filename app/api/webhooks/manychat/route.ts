import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyManychatSecret, sendManychatMessage } from "@/lib/manychat";
import { generateReply } from "@/lib/anthropic";
import {
  checkRateLimit,
  checkMonthlyCap,
  checkDuplicate,
  cacheLastReply,
  incrementMonthlyCount,
  getTrivialReply,
} from "@/lib/limits";
import type { Chatbot, KnowledgeBaseEntry, Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  chatbot_id: z.string().uuid(),
  subscriber_id: z.union([z.string(), z.number()]).transform(String),
  page_id: z.union([z.string(), z.number()]).transform(String).optional(),
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
  return NextResponse.json({
    version: "v2",
    content: { messages: text ? [{ type: "text", text }] : [] },
    reply: text,
    ...extra,
  });
}

/**
 * ManyChat External Request entry point. Returns a ManyChat-format response
 * (version + content.messages) so ManyChat sends the reply back directly.
 */
export async function POST(request: NextRequest) {
  // 1. Authenticate shared secret
  const secret = request.headers.get("x-manychat-secret");
  if (!verifyManychatSecret(secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
  const supabase = createServiceClient();

  // 3. Look up chatbot + verify subscription is active
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("*")
    .eq("id", body.chatbot_id)
    .eq("is_active", true)
    .single<Chatbot>();

  if (!chatbot) {
    return manychatReply("Sorry, this account isn't active right now.");
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
    const { data: created } = await supabase
      .from("conversations")
      .insert({
        chatbot_id: chatbot.id,
        user_id: chatbot.user_id,
        manychat_subscriber_id: body.subscriber_id,
        contact_name: displayName,
        contact_username: body.username ?? null,
        status: "active",
      })
      .select("id, status")
      .single();
    conversationId = created!.id;
    conversationStatus = created!.status;
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
  const trivial = getTrivialReply(body.message);
  if (trivial) {
    await persistAndPush(supabase, conversationId!, body.subscriber_id, trivial);
    return manychatReply(trivial, { ai_skipped: true, reason: "trivial_ack" });
  }

  // 6c. Duplicate-message dedup: same message inside 30s → echo prior reply.
  const dup = await checkDuplicate(chatbot.id, body.subscriber_id, body.message);
  if (dup.isDuplicate) {
    const echo = dup.lastReply ?? "Still on that — give me just a sec!";
    await persistAndPush(supabase, conversationId!, body.subscriber_id, echo);
    return manychatReply(echo, { ai_skipped: true, reason: "duplicate" });
  }

  // 6d. Per-chatbot monthly cap. Over → static fallback, no AI.
  const cap = await checkMonthlyCap(chatbot.id);
  if (!cap.ok) {
    const text = "Thanks for your message! We'll get back to you shortly.";
    await persistAndPush(supabase, conversationId!, body.subscriber_id, text);
    return manychatReply(text, {
      ai_skipped: true,
      reason: "monthly_cap_reached",
      current: cap.current,
      cap: cap.cap,
    });
  }

  // 7. Fetch knowledge + recent history. Order desc + limit so we get the
  // newest 11 (= 10 prior + the just-inserted user message), not the oldest.
  const [{ data: knowledge }, { data: history }] = await Promise.all([
    supabase
      .from("knowledge_base")
      .select("*")
      .eq("chatbot_id", chatbot.id)
      .order("created_at", { ascending: true })
      .returns<KnowledgeBaseEntry[]>(),
    supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: false })
      .limit(11)
      .returns<Pick<Message, "role" | "content">[]>(),
  ]);

  // Desc order: [0] is the just-inserted user msg. Drop it, reverse to chrono.
  const priorHistory = (history ?? []).slice(1).reverse();

  // 8. Generate reply
  let replyText = "Thanks for the message — a teammate will follow up shortly.";
  let tokens = 0;
  try {
    const { text, tokensUsed } = await generateReply({
      chatbot,
      knowledge: knowledge ?? [],
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
  ]);

  // 10. Deliver the reply to the user via ManyChat's Send Content API.
  // The ManyChat flow is a fire-and-forget External Request (no Send Message /
  // dynamic-content node) because dynamic-content rendering is unreliable on
  // Instagram. We push the reply here instead. A failure is non-fatal: the
  // reply is already stored and visible in the dashboard inbox.
  try {
    await sendManychatMessage({
      subscriberId: body.subscriber_id,
      text: replyText,
    });
  } catch (err) {
    console.error("[manychat-webhook] push send failed", err);
  }

  // 11. Return 200. Body kept in ManyChat format for backward-compat and local
  // tooling (chat-test); the actual delivery happened via the push above.
  return manychatReply(replyText);
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "manychat-webhook" });
}
