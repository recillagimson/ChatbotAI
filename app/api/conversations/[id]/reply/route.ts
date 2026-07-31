import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { sendManychatMessage, resolveManychatApiKey } from "@/lib/manychat";
import { toPlatform, canPushPlatform, platformLabel } from "@/lib/platforms";
import { supportsHumanAgentTag } from "@/lib/messaging-window";

export const runtime = "nodejs";

const MAX_LEN = 1000; // ManyChat per-message ceiling

/**
 * Human-agent reply: send a manual message to the contact on their channel via
 * ManyChat, and record it in the thread as a `human_agent` message.
 *
 * Used by the conversation composer when the owner has paused the AI to take
 * over a chat. The ManyChat API key is server-only, so the browser can't push
 * directly - it posts here. Auth is the cookie session + RLS: the conversation
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
    .select("id, manychat_subscriber_id, chatbot_id, platform")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const platform = toPlatform(conversation.platform);
  // Channels with no ManyChat send API (TikTok) can't be delivered to from here.
  // Don't leave a phantom "sent" bubble - tell the agent to reply in that app.
  if (!canPushPlatform(platform)) {
    return NextResponse.json(
      {
        error: `${platformLabel(platform)} replies can't be sent from here yet - ManyChat has no ${platformLabel(platform)} sending API. Reply to this contact directly in the ${platformLabel(platform)} app.`,
      },
      { status: 422 }
    );
  }

  // Resolve the ManyChat API key for the conversation's chatbot (RLS lets the
  // owner read their own chatbot). On decrypt/no-key failure we surface a clear
  // 502 instead of silently sending through the wrong (global) account.
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("manychat_api_key_enc, link_buttons_enabled")
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

  // Deliver to the contact's channel first - if ManyChat rejects it, don't leave a
  // phantom "You" bubble in the thread that never actually reached the contact.
  try {
    await sendManychatMessage({
      subscriberId: conversation.manychat_subscriber_id,
      text,
      apiKey,
      platform,
      // A manual reply IS a human-agent response, so carry the HUMAN_AGENT tag on
      // channels that support it (IG/Messenger). Harmless inside the 24h window;
      // required to reach a lead who's been quiet up to 7 days (without it, the send
      // fails outright the moment the standard window closes).
      messageTag: supportsHumanAgentTag(platform) ? "HUMAN_AGENT" : undefined,
      // Per-chatbot: render Messenger links as URL buttons (a pasted link included).
      linkButtons: chatbot?.link_buttons_enabled === true,
    });
  } catch (err) {
    console.error("[conversation-reply] ManyChat send failed", err);
    return NextResponse.json(
      { error: `Couldn't deliver the message to ${platformLabel(platform)}. Please try again.` },
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
