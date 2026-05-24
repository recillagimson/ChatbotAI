import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyManychatSecret } from "@/lib/manychat";
import { generateReply } from "@/lib/anthropic";
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
 * ManyChat External Request entry point.
 * Returns { reply: string } that ManyChat maps to a custom field and sends back.
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
    return NextResponse.json(
      { reply: "Sorry, this account isn't active right now." },
      { status: 200 }
    );
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", chatbot.user_id)
    .maybeSingle();

  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return NextResponse.json(
      {
        reply:
          "Thanks for your message! We'll get back to you shortly.",
        ai_skipped: true,
        reason: "subscription_inactive",
      },
      { status: 200 }
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
    return NextResponse.json(
      { reply: "", ai_skipped: true, reason: "human_takeover" },
      { status: 200 }
    );
  }

  // 7. Fetch knowledge + recent history
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
      .order("created_at", { ascending: true })
      .limit(20)
      .returns<Pick<Message, "role" | "content">[]>(),
  ]);

  const priorHistory = (history ?? []).slice(0, -1); // exclude the just-inserted user msg

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

  // 10. Return reply for ManyChat to send back
  return NextResponse.json({ reply: replyText });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "manychat-webhook" });
}
