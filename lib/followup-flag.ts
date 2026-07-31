/**
 * ManyChat "stop follow-up" flag bridge.
 *
 * SpeedSettr's conversation tags live only in Postgres; a native ManyChat drip
 * can't see them. This module mirrors SpeedSettr's "stop chasing this lead" verdict
 * (followupBlocked) out to ManyChat as a subscriber tag, so a voice-note flow can
 * Condition-exit on it. Fired from the webhook (auto-tag transitions) and the manual
 * inbox route.
 *
 * BEST-EFFORT: syncNoFollowupFlag never throws - a sync failure must not affect a
 * reply, a follow-up, a tag write, or an inbox action.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveManychatApiKey, setSubscriberTag } from "@/lib/manychat";
import { followupBlocked } from "@/lib/followup";
import { toPlatform, canPushPlatform } from "@/lib/platforms";

/** The ManyChat tag customers create + Condition on. Generic (multi-tenant); overridable. */
export const NO_FOLLOWUP_TAG = process.env.MANYCHAT_NO_FOLLOWUP_TAG || "ss_no_followup";

/**
 * Reconcile the `ss_no_followup` ManyChat tag for one conversation to match its
 * current stop-follow-up state. Reads DB truth, so it's safe to call after ANY
 * transition and it never blindly removes a tag that should stay on (e.g. an
 * un-mute on a still-subscribed thread keeps the tag). Idempotent.
 */
export async function syncNoFollowupFlag(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  try {
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("status, confirmed_at, user_muted_at, tag, platform, manychat_subscriber_id, chatbot_id")
      .eq("id", conversationId)
      .single();
    if (convoErr) console.error("[followup-flag] conversation read failed", convoErr);
    if (!convo) return;
    if (!canPushPlatform(toPlatform(convo.platform))) return; // TikTok etc.
    if (!convo.manychat_subscriber_id) return;

    const { data: chatbot, error: chatbotErr } = await supabase
      .from("chatbots")
      .select("manychat_api_key_enc, followup_flag_enabled")
      .eq("id", convo.chatbot_id)
      .single();
    if (chatbotErr) console.error("[followup-flag] chatbot read failed", chatbotErr);
    if (!chatbot || chatbot.followup_flag_enabled !== true) return; // not opted in

    let apiKey: string;
    try {
      apiKey = resolveManychatApiKey(chatbot);
    } catch (err) {
      // Undecryptable key: never fall back to the global key (cross-tenant). Skip.
      console.error("[followup-flag] key resolve failed", err);
      return;
    }

    const on = followupBlocked(convo);
    await setSubscriberTag({
      subscriberId: convo.manychat_subscriber_id,
      tagName: NO_FOLLOWUP_TAG,
      on,
      apiKey,
    });
  } catch (err) {
    console.error("[followup-flag] sync failed", err);
  }
}
