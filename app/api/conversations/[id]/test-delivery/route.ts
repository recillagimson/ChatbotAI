import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { sendManychatMessage, resolveManychatApiKey } from "@/lib/manychat";
import { toPlatform, canPushPlatform, platformLabel } from "@/lib/platforms";

export const runtime = "nodejs";

// A clearly-labelled probe DM. Sending SOMETHING is unavoidable - you can't test
// real delivery without a real send - so keep it obviously a system check.
const TEST_MESSAGE =
  "✅ SpeedSettr delivery test - please ignore. If you can see this, replies are being delivered.";

/**
 * Admin delivery probe: push a real test DM to THIS conversation's contact via the
 * ManyChat Send Content API and report ManyChat's ACTUAL verdict - so the owner can
 * see, per contact, whether a send is accepted, refused (closed 24h window, blocked
 * user, account restriction), or errored, instead of guessing from the ManyChat
 * "Test the request" panel (which only ever shows SpeedSettr's fast-ack, never the
 * pushed reply). Because postSendContent now validates the response BODY, a ManyChat
 * refusal surfaces here as a real error message rather than a phantom success.
 *
 * Admin-only (requireSuperadmin) - it sends a real DM to a real contact.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await requireSuperadmin())) {
    return NextResponse.json({ ok: false, error: "not allowed" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, manychat_subscriber_id, chatbot_id, platform")
    .eq("id", id)
    .single();
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });
  }

  const platform = toPlatform(conversation.platform);
  const label = platformLabel(platform);
  if (!canPushPlatform(platform)) {
    return NextResponse.json(
      { ok: false, error: `${label} has no ManyChat send API - can't push from here.` },
      { status: 200 }
    );
  }
  if (!conversation.manychat_subscriber_id) {
    return NextResponse.json(
      { ok: false, error: "No ManyChat subscriber on this conversation." },
      { status: 200 }
    );
  }

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
      { ok: false, error: "ManyChat isn't connected for this chatbot (no/invalid API key)." },
      { status: 200 }
    );
  }

  try {
    const result = await sendManychatMessage({
      subscriberId: conversation.manychat_subscriber_id,
      text: TEST_MESSAGE,
      apiKey,
      platform,
    });
    return NextResponse.json({
      ok: true,
      platform: label,
      manychat: result,
      note:
        `ManyChat ACCEPTED the send. Now check the contact's ${label} thread - ` +
        `if the test DM does NOT appear there, the contact's 24-hour messaging window is ` +
        `closed (they must message the account first), which Instagram enforces and no code can bypass.`,
    });
  } catch (err) {
    // With the response-body validation in postSendContent, err.message carries
    // ManyChat's real refusal reason (closed window, "can't message this user",
    // account restriction) instead of a phantom success.
    return NextResponse.json(
      {
        ok: false,
        platform: label,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }
    );
  }
}
