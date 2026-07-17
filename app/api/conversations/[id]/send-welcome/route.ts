import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { resolveManychatApiKey, sendManychatFlow } from "@/lib/manychat";
import type { Chatbot, Conversation } from "@/lib/types";

export const runtime = "nodejs";

type WelcomeChatbot = Pick<
  Chatbot,
  "id" | "welcome_enabled" | "welcome_flow_ns" | "manychat_api_key_enc"
>;

type WelcomeRow = Pick<
  Conversation,
  "id" | "manychat_subscriber_id" | "platform" | "welcomed_at"
> & { chatbots: WelcomeChatbot };

/**
 * ADMIN-ONLY test affordance: fire this conversation's Welcome VM flow right now,
 * bypassing the `shouldSendWelcome` gate (welcomed_at / opener / keyword-gate checks)
 * so any thread can exercise the real ManyChat welcome delivery — the SAME
 * `sendManychatFlow` the webhook triggers on a first-contact greeting. Mirrors the
 * "Send follow-up now" tool. Gated on the REAL superadmin (never the impersonated
 * client); operates cross-tenant via the service client. Never throws to the client.
 *
 * On success it records a "(sent welcome voice)" message (so the send shows in the
 * transcript) and stamps welcomed_at IF it was unset — so the auto-welcome gate won't
 * later fire a SECOND VM at the same lead. Re-clicking always re-sends (the manual
 * path does not consult welcomed_at before sending).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin(); // real user, never impersonated
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServiceClient(); // admin operates cross-tenant

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, manychat_subscriber_id, platform, welcomed_at, " +
        "chatbots!inner(id, welcome_enabled, welcome_flow_ns, manychat_api_key_enc)"
    )
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const row = data as unknown as WelcomeRow;
  const cb = row.chatbots;

  if (!cb.welcome_flow_ns) {
    return NextResponse.json({ ok: false, reason: "no_welcome_flow" }, { status: 400 });
  }
  if (!row.manychat_subscriber_id) {
    return NextResponse.json({ ok: false, reason: "no_subscriber" }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = resolveManychatApiKey(cb);
  } catch {
    return NextResponse.json(
      { ok: false, reason: "manychat_key_unavailable" },
      { status: 502 }
    );
  }

  try {
    await sendManychatFlow({
      subscriberId: row.manychat_subscriber_id,
      flowNs: cb.welcome_flow_ns,
      apiKey,
    });
  } catch (err) {
    console.error("[send-welcome] flow send failed", id, err);
    return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 502 });
  }

  // Record the send + stamp welcomed_at only if unset (so the auto gate won't ALSO
  // greet later). Both best-effort — a failed bookkeeping write never fails the send.
  await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      role: "assistant",
      content: "(sent welcome voice)",
      ai_generated: false,
      tokens_used: 0,
    })
    .then(() => {}, () => {});
  await supabase
    .from("conversations")
    .update({ welcomed_at: new Date().toISOString() })
    .eq("id", id)
    .is("welcomed_at", null)
    .then(() => {}, () => {});

  return NextResponse.json({ ok: true, sent: true });
}
