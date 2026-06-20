import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { sendManychatMessage, resolveManychatApiKey } from "@/lib/manychat";

export const runtime = "nodejs";

const MAX_LEN = 1000; // ManyChat/Instagram per-message ceiling

/**
 * Human-agent reply: send a manual message to the contact on Instagram via
 * ManyChat, and record it in the thread as a `human_agent` message.
 *
 * Used by the conversation composer when the owner has paused the AI to take
 * over a chat. The ManyChat API key is server-only, so the browser can't push
 * directly — it posts here. Auth is the cookie session + RLS: the conversation
 * lookup is scoped to the current user (and double-checked with user_id), so
 * one tenant can never reply into another's conversation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json(
      { error: `Message too long (max ${MAX_LEN} characters).` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  // RLS scopes this to the caller's own conversations; the explicit user_id
  // filter is belt-and-suspenders and gives a clean 404 instead of an RLS empty.
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, manychat_subscriber_id, chatbot_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Resolve the ManyChat API key for the conversation's chatbot (RLS lets the
  // owner read their own chatbot). On decrypt/no-key failure we surface a clear
  // 502 instead of silently sending through the wrong (global) account.
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("manychat_api_key_enc")
    .eq("id", conversation.chatbot_id)
    .single();

  let apiKey: string;
  try {
    apiKey = resolveManychatApiKey(chatbot ?? {});
  } catch {
    return NextResponse.json(
      { error: "ManyChat isn't connected for this chatbot. Add your API key in the chatbot settings." },
      { status: 502 }
    );
  }

  // Deliver to Instagram first — if ManyChat rejects it, don't leave a phantom
  // "You" bubble in the thread that never actually reached the contact.
  try {
    await sendManychatMessage({
      subscriberId: conversation.manychat_subscriber_id,
      text,
      apiKey,
    });
  } catch (err) {
    console.error("[conversation-reply] ManyChat send failed", err);
    return NextResponse.json(
      { error: "Couldn't deliver the message to Instagram. Please try again." },
      { status: 502 }
    );
  }

  // Record the sent reply (amber bubble) and surface it as the latest activity.
  await supabase.from("messages").insert({
    conversation_id: id,
    role: "human_agent",
    content: text,
  });
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), unread_count: 0 })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
