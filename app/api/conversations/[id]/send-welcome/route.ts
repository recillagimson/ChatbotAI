import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { resolveManychatApiKey, sendManychatFlow } from "@/lib/manychat";
import type { Chatbot, Conversation } from "@/lib/types";

export const runtime = "nodejs";

type WelcomeChatbot = Pick<Chatbot, "welcome_flow_ns" | "manychat_api_key_enc">;

type WelcomeRow = Pick<Conversation, "id" | "manychat_subscriber_id"> & {
  chatbots: WelcomeChatbot;
};

/**
 * ADMIN-ONLY test affordance: fire this conversation's Welcome VM flow right now,
 * bypassing the `shouldSendWelcome` gate (welcomed_at / opener / keyword-gate checks)
 * so any thread can exercise the real ManyChat welcome delivery - the SAME
 * `sendManychatFlow` the webhook triggers on a first-contact greeting. Mirrors the
 * "Send follow-up now" tool. Gated on the REAL superadmin (never the impersonated
 * client); operates cross-tenant via the service client. Never throws to the client.
 *
 * Deliberately IGNORES `welcome_enabled` (an admin override - the only requirement is a
 * configured welcome flow) and IGNORES `welcomed_at` for the send decision, so the
 * button is re-clickable to re-test. But to avoid a double-VM with a concurrent genuine
 * first-contact webhook, it CLAIMS `welcomed_at` the same atomic way the webhook does
 * BEFORE sending, and reverts the claim if the send fails - so a real lead is never left
 * marked "welcomed" without actually receiving the VM.
 *
 * A successful send also HANDS THE THREAD TO THE BOT: it stamps `bot_forced_on_at`, the
 * manual override the BOT_ON tag sets (4b-on in the ManyChat webhook). The keyword gate
 * (6-gate) reads that as engaged, so a keyword-only bot answers this contact's next
 * messages with no keyword match, strict matching or not; without it the owner's own
 * welcome was followed by silence. It lifts ONLY the keyword gate: a paused, BOT_OFF,
 * subscribed or disqualified thread is stopped before that gate, a lead's own opt-out is
 * still honoured after it, and unlike BOT_ON this clears no pause. It does not write
 * keyword_fired, so on a keyword-gated bot the contact is answered but not enrolled in
 * the follow-up drip. Only "Reset conversation" clears the override, so a click made
 * purely to test delivery leaves that contact engaged until then.
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
      "id, manychat_subscriber_id, chatbots!inner(welcome_flow_ns, manychat_api_key_enc)"
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

  // Claim welcomed_at atomically BEFORE sending, the same way the webhook's welcome gate
  // does, so a concurrent genuine first-contact inbound can't ALSO auto-fire the VM
  // (double send). Claim won → this is the first welcome; claim lost → already welcomed
  // (or a concurrent claim), so this is a deliberate admin RE-send - send anyway and
  // leave welcomed_at as-is.
  const { data: claimed, error: claimErr } = await supabase
    .from("conversations")
    .update({ welcomed_at: new Date().toISOString() })
    .eq("id", id)
    .is("welcomed_at", null)
    .select("id");
  if (claimErr) {
    // A DB error here is NOT a lost claim - surface it rather than risk a double-send.
    console.error("[send-welcome] welcome claim failed", id, claimErr);
    return NextResponse.json({ ok: false, reason: "claim_failed" }, { status: 502 });
  }
  const wonClaim = !!claimed?.length;

  try {
    await sendManychatFlow({
      subscriberId: row.manychat_subscriber_id,
      flowNs: cb.welcome_flow_ns,
      apiKey,
    });
  } catch (err) {
    console.error("[send-welcome] flow send failed", id, err);
    // Revert our own claim so the auto-welcome gate can still greet this lead later
    // (never leave them marked welcomed without having received the VM).
    if (wonClaim) {
      await supabase
        .from("conversations")
        .update({ welcomed_at: null })
        .eq("id", id)
        .then(() => {}, () => {});
    }
    return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 502 });
  }

  // Hand the thread to the bot (see the note above). Its own write, after the send: the
  // welcomed_at claim only matches a thread never welcomed before, so an override folded
  // into it would be skipped on every re-send. supabase-js resolves an error instead of
  // throwing, so check it: the welcome is already out, and the owner must not be told
  // the bot took over when it will still wait for a keyword.
  const { error: engageErr } = await supabase
    .from("conversations")
    .update({ bot_forced_on_at: new Date().toISOString() })
    .eq("id", id);
  if (engageErr) console.error("[send-welcome] force-on stamp failed", id, engageErr);

  // Record the send in the transcript so it's visible in the inbox. Best-effort, but log
  // failures (never silently swallow - a missing record is worth seeing in logs).
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: id,
    role: "assistant",
    content: "(sent welcome voice)",
    ai_generated: false,
    tokens_used: 0,
  });
  if (msgErr) console.error("[send-welcome] transcript record failed", id, msgErr);

  return NextResponse.json({ ok: true, sent: true, engaged: !engageErr });
}
