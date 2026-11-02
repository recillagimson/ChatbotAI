/**
 * Server half of lead contact capture (pure half: lib/lead-contact.ts).
 *
 * When a lead types a new phone number or email: save it on the conversation, flag
 * the thread needs_human ("Needs attention"), and post one alert to THIS chatbot's
 * Slack channel (chatbots.slack_alert_url, an Incoming Webhook; unset = save and tag
 * only). Per bot, so one client's leads never land in another client's channel.
 *
 * The saves are conditional ("only if the stored value differs"), so two messages
 * racing with the same number alert once. Runs in the webhook's after() and never
 * throws: a Slack or DB failure is logged and the lead's reply is unaffected.
 * Before the migration adds the columns the save fails, and nothing is tagged or
 * posted (no repeat alerts on every message).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSlackLeadAlert, isSlackWebhookUrl, phoneKey, type LeadContactAlert } from "@/lib/lead-contact";
import { resolveTagWrite, CONVERSATION_TAGS, TAG_RANK, type ConversationTag } from "@/lib/conversation-tags";

export interface CaptureInput {
  conversationId: string;
  currentTag: string | null;
  savedPhone: string | null;
  phone: string | null;
  email: string | null;
  botName: string | null;
  platform: string | null;
  leadName: string | null;
  handle: string | null;
  message: string;
  slackUrl: string | null;
}

async function saveIfNew(
  supabase: SupabaseClient,
  conversationId: string,
  column: "lead_phone" | "lead_email",
  value: string,
  differsFrom: string[]
): Promise<boolean> {
  // Save only when the row does not already hold this value (in any of the forms
  // in differsFrom); the returned row tells us whether this run was the one to save it.
  const notSame = differsFrom.map((v) => `${column}.neq.${JSON.stringify(v)}`).join(",");
  const { data, error } = await supabase
    .from("conversations")
    .update({ [column]: value, lead_contact_at: new Date().toISOString() })
    .eq("id", conversationId)
    .or(`${column}.is.null,and(${notSame})`)
    .select("id");
  if (error) {
    console.error(`[lead-contact] ${column} save failed`, error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function captureLeadContact(
  supabase: SupabaseClient,
  input: CaptureInput
): Promise<void> {
  try {
    let phoneSaved = false;
    let emailSaved = false;
    if (input.phone) {
      // "+15551234567" and "5551234567" are the same number: neither counts as new.
      const key = phoneKey(input.phone);
      const forms = Array.from(new Set([input.phone, key, `1${key}`, `+1${key}`]));
      // A saved number in yet another form (rare) still differs by key.
      if (!input.savedPhone || phoneKey(input.savedPhone) !== key) {
        phoneSaved = await saveIfNew(supabase, input.conversationId, "lead_phone", input.phone, forms);
      }
    }
    if (input.email) {
      emailSaved = await saveIfNew(supabase, input.conversationId, "lead_email", input.email, [input.email]);
    }
    if (!phoneSaved && !emailSaved) return;

    // Flag the thread for a person. resolveTagWrite keeps subscribed/disqualified/bot
    // as they are; the DB guards stop a concurrent stickier tag from being lowered.
    const current = (input.currentTag as ConversationTag) ?? "lead";
    const next = resolveTagWrite(current, "needs_human");
    if (next !== current) {
      let upd = supabase
        .from("conversations")
        .update({ tag: next, start_on: null, start_note: null })
        .eq("id", input.conversationId)
        .is("confirmed_at", null);
      for (const t of CONVERSATION_TAGS) {
        if (TAG_RANK[t] > TAG_RANK[next]) upd = upd.neq("tag", t);
      }
      const { error } = await upd;
      if (error) console.error("[lead-contact] tag write failed", error);
    }

    await postSlackAlert({
      ...input,
      phone: phoneSaved ? input.phone : null,
      email: emailSaved ? input.email : null,
    });
  } catch (err) {
    console.error("[lead-contact] capture failed", err);
  }
}

async function postSlackAlert(input: CaptureInput): Promise<void> {
  if (!isSlackWebhookUrl(input.slackUrl)) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  await postToSlack(input.slackUrl, {
    botName: input.botName,
    platform: input.platform,
    leadName: input.leadName,
    handle: input.handle,
    phone: input.phone,
    email: input.email,
    message: input.message,
    conversationUrl: appUrl ? `${appUrl}/conversations/${input.conversationId}` : null,
  });
}

/** Posts one alert. Returns whether Slack accepted it; never throws. */
export async function postToSlack(url: string, alert: LeadContactAlert): Promise<boolean> {
  try {
    const res = await fetch(url.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSlackLeadAlert(alert)),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[lead-contact] Slack post failed", res.status, await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (err) {
    console.error("[lead-contact] Slack post failed", err);
    return false;
  }
}
