import { NextResponse, type NextRequest, unstable_after as after } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  verifyManychatSecret,
  sendManychatMessage,
  sendManychatSequencePaced,
  sendManychatMedia,
  sendManychatFlow,
  buildPacedItems,
  pacingEnabled,
  resolveManychatApiKey,
  ManychatKeyError,
  isolateLinkBubbles,
  type OutboundAsset,
  type PacedItem,
} from "@/lib/manychat";
import { generateReply } from "@/lib/anthropic";
import { planLinkFlow, linkSentMarker, planDeliveryBubbles, type LinkFlowDelivery } from "@/lib/link-flow";
import { splitIntoMessages } from "@/lib/message-split";
import { buildKbBlock } from "@/lib/retrieval";
import { renderTrainedResponses } from "@/lib/training";
import { findAssetDirectives } from "@/lib/ai-media";
import {
  fetchFollowupAssets,
  resolveAssetByKey,
  assetToOutbound,
  buildAssetCatalogBlock,
} from "@/lib/followup-assets";
import { firstMatchingGroup, keywordGateBlocks } from "@/lib/keyword-triggers";
import { isSubstantiveInquiry, screenInquiryRelevance, MAX_QUESTION_SCREENS } from "@/lib/question-gate";
import { hasActiveAccess } from "@/lib/access";
import {
  detectExtractionAttempt,
  pickDeflection,
  EXTRACTION_REINFORCEMENT,
  EXTRACTION_STANDDOWN_MESSAGE,
  AUTO_PAUSE_ON_EXTRACTION,
  EXTRACTION_PAUSE_THRESHOLD,
  type ExtractionResult,
} from "@/lib/extraction-detect";
import {
  detectUserControl,
  STOP_CONFIRMATION,
  RESUME_CONFIRMATION,
} from "@/lib/user-controls";
import { sanitizeReply } from "@/lib/sanitize";
import { classifyConversation } from "@/lib/conversation-classify";
import { insertMessageReturningId, markDeliveryFailed } from "@/lib/delivery";
import { retrySupabase } from "@/lib/retry";
import { shouldSendWelcome, coerceKeywords } from "@/lib/welcome";
import { matchesResetKeyword } from "@/lib/reset-keyword";
import { resetConversation } from "@/lib/reset-conversation";
import { screenDisqualify, decideDisqualify } from "@/lib/conversation-screen";
import { syncNoFollowupFlag } from "@/lib/followup-flag";
import { followupBlocked } from "@/lib/followup";
import { resolveTagWrite, CONVERSATION_TAGS, TAG_RANK, type ConversationTag } from "@/lib/conversation-tags";
import {
  checkRateLimit,
  checkMonthlyCap,
  checkDuplicate,
  cacheLastReply,
  incrementMonthlyCount,
  getTrivialReply,
} from "@/lib/limits";
import { type Platform, toPlatform, canPushPlatform } from "@/lib/platforms";
import { cleanContactField } from "@/lib/contact";
import {
  normalizeMediaItems,
  processInboundMedia,
  composeUserMessage,
  stripMediaUrls,
} from "@/lib/inbound-media";
import { HISTORY_TURNS, refreshConversationMemory } from "@/lib/memory";
import { refreshKnownFacts } from "@/lib/lead-facts";
import {
  flowStateEnabled,
  refreshFlowState,
  renderFlowStateBlock,
  extractLastQuestion,
  countRecentAsks,
  countStaleTurns,
} from "@/lib/flow-state";
import { splitBurst, combineBurstText, remainingDebounceMs, clampDebounceSeconds, shouldStandDown } from "@/lib/debounce";
import { suppressionCarry, resolveExternalId } from "@/lib/returning-contact";
import { flattenManychatContact } from "@/lib/manychat-contact";
import { cleanLiveChatUrl } from "@/lib/manual-followups";
import type { Chatbot, Message } from "@/lib/types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Auto-tagging kill-switch. When on (default), each AI turn runs a lightweight
// background classifier that tags the thread (lead/wants_call/needs_human/
// subscribed). Set AUTO_TAG_ENABLED=false to disable all classifier calls.
const AUTO_TAG_ENABLED = process.env.AUTO_TAG_ENABLED !== "false";

// Returning-contact safety cap: if one external_user_id is shared by MORE than this many
// conversations, it is not a per-user identity (e.g. a Page Id mapped into username by
// mistake) - so we skip the suppression carry rather than silence a crowd. A real contact
// accrues one row per delete+recreate cycle, so this leaves ample headroom.
const IDENTITY_MAX_SHARED_ROWS = 10;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s (Vercel Pro ceiling) so the background push can pace a multi-bubble reply
// with a 15–30s human trickle between bubbles (see sendManychatMessagePaced). Must
// be a static literal - Next can't read this from an env var. On the 60s Hobby
// budget this is capped to 60; lower BUBBLE_PACING_BUDGET_MS to match if you revert.
export const maxDuration = 300;

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
  // The IG/FB handle. ManyChat setups send this under different field names
  // depending on which merge field was wired, so we accept any of them and use
  // the first real (non-placeholder) one for the contact's @handle / fallback name.
  username: z.string().optional().nullable(),
  ig_username: z.string().optional().nullable(),
  user_name: z.string().optional().nullable(),
  // Stable per-user platform ID that SURVIVES a ManyChat contact deletion - unlike
  // subscriber_id, which ManyChat reissues when a contact is deleted+recreated (so the
  // fresh row loses any pause and the bot resumes). OPTIONAL dedicated fields: wire ONE
  // to whatever stable id ManyChat exposes (Messenger PSID / Instagram id). If none is
  // mapped, the webhook falls back to `username` on BOTH platforms (owners commonly map
  // the PSID into username on Messenger and the @handle on Instagram); resolveExternalId
  // guards that fallback to a single token so a display name can't be used as an id. The
  // chosen value is stored as conversations.external_user_id to re-identify the contact.
  external_user_id: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  psid: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  ig_id: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  messenger_id: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  // ManyChat's own per-subscriber Live Chat deep link (the "Live Chat URL" system field).
  // OPTIONAL: when a flow maps it we store it verbatim so the Follow-ups queue's "Open in
  // ManyChat" opens the exact thread on any channel (see manychatConversationUrl). Coerced
  // like the sibling system-field ids (page_id/psid/ig_id/...) rather than a strict string:
  // a cosmetic field must NEVER fail-validate the whole inbound, so a stray non-string token
  // (a mis-mapped numeric/boolean merge field) stringifies to a harmless value that
  // cleanLiveChatUrl then discards, instead of 400-ing the lead's real message.
  live_chat_url: z.union([z.string(), z.number(), z.boolean()]).transform(String).optional().nullable(),
  // Optional now: a photo/voice-only DM has no text. Either text or media is required.
  message: z.string().max(4000).optional().nullable(),
  // Inbound media. ManyChat flows map the attachment URL under different field
  // names depending on the setup, so we accept any of these (normalizeMediaItems
  // sorts them out). attachment_urls is a comma/space-separated list.
  attachment_url: z.string().optional().nullable(),
  attachment_type: z.string().optional().nullable(),
  attachment_urls: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  audio_url: z.string().optional().nullable(),
  video_url: z.string().optional().nullable(),
  file_url: z.string().optional().nullable(),
  // Recurring Notifications opt-in (Phase 6). A ManyChat RN opt-in flow sends a
  // truthy `rn_opt_in` (+ optional topic id) when the contact subscribes to
  // multi-day follow-ups. Captured onto the conversation for the cron.
  rn_opt_in: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
  rn_topic_id: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  // Lead tagging (PARKED): `is_leads` is still accepted for backward compatibility
  // with existing ManyChat flows but is now IGNORED - the tag branch was removed so
  // a stray is_leads=1 can no longer silently swallow a real DM. To un-park, restore
  // the branch from git history and re-consult is_lead in the keyword gate (#19).
  is_leads: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
  // Entry point for this inbound. The comment-campaign automation sends
  // entry_point:"comment" (with the comment text in `message`) so the welcome gate
  // force-fires the Welcome VM (a keyword comment IS the opener). Absent for DMs.
  entry_point: z.string().optional().nullable(),
  // ManyChat BOT_OFF tag sync: a tag-change automation posts bot_off=true (tag added)
  // or bot_off=false (tag removed). Sets/clears conversations.bot_off_at.
  bot_off: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
  // ManyChat BOT_ON tag sync (the inverse of BOT_OFF): a tag-change automation posts
  // bot_on=true (tag added) to hand the conversation back to the bot - clears the
  // owner-set pauses (bot_off_at + status ai_paused). Handled just before the 4c BOT_OFF
  // sync; it does NOT clear the lead's own "stopmessage" mute.
  bot_on: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
});

/** Truthy check for a ManyChat boolean flag (rn_opt_in, bot_off, bot_on; accepts "true"/"1"/1/true). */
function isTruthyFlag(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") return ["true", "1", "yes", "on"].includes(v.trim().toLowerCase());
  return false;
}

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
  // isolateLinkBubbles mirrors the push path (buildOutboundMessages): every link
  // sits on its own bubble with the full URL intact.
  const bubbles = text ? splitIntoMessages(text).flatMap(isolateLinkBubbles) : [];
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
 * Best-effort stamp of the ManyChat deep-link ids (used by the Follow-ups queue's
 * "Open in ManyChat" link) on a conversation, as a SEPARATE write from the core
 * upsert/update - the same two-write idiom as the BOT_ON handler below.
 *
 * PostgREST rejects an UPDATE/INSERT that references an un-migrated column ATOMICALLY, so
 * folding these into the core write would, in any deploy-before-migrate window, drop the
 * WHOLE core write: a brand-new lead would get no conversation row and no reply, and an
 * existing thread's last_message_at / unread_count / identity backfill would silently stop.
 * Kept separate + best-effort (errors swallowed) so a missing column fails only THIS write
 * and the deep link simply stays unpopulated until 2026-08-25-conversation-manychat-deeplink
 * .sql lands. Writes only columns that have a value and (when `existing` is supplied) aren't
 * already set - backfill-only, exactly like external_user_id.
 */
async function stampManychatDeepLink(
  supabase: ReturnType<typeof createServiceClient>,
  conversationId: string,
  vals: { pageId: string | null; liveChatUrl: string | null },
  existing?: { manychat_page_id?: string | null; manychat_live_chat_url?: string | null }
): Promise<void> {
  const patch: Record<string, string> = {};
  if (vals.pageId && !existing?.manychat_page_id) patch.manychat_page_id = vals.pageId;
  if (vals.liveChatUrl && !existing?.manychat_live_chat_url) {
    patch.manychat_live_chat_url = vals.liveChatUrl;
  }
  if (Object.keys(patch).length === 0) return;
  await supabase
    .from("conversations")
    .update(patch)
    .eq("id", conversationId)
    .then(() => {}, () => {});
}

/**
 * Helper for canned-reply paths (rate-limit-passed gates that bypass the AI):
 * persists the outbound message in the conversation and pushes via ManyChat.
 * Each side is independent - a ManyChat failure doesn't lose the DB row.
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
  // Insert first so we hold this row's id: if the push then throws, we mark THAT
  // row failed for the reconcile cron to retry (no racy "recent message" guessing).
  const messageId = await insertMessageReturningId(supabase, {
    conversation_id: conversationId,
    role: "assistant",
    content: text,
    ai_generated: false,
    tokens_used: 0,
  });
  if (push) {
    try {
      await sendManychatMessage({ subscriberId, text, apiKey, platform });
    } catch (err) {
      console.error("[manychat-webhook] push send failed", err);
      await logPushFailure(supabase, userId, chatbotId);
      await markDeliveryFailed(supabase, messageId);
    }
  }
}

/**
 * Canned keyword-trigger reply: persists the outbound text (+ an optional saved
 * asset) and delivers it - like persistAndPush but with media support. The asset
 * is OWNER-configured, so it sends regardless of chatbot.ai_media_enabled (that
 * flag only governs AI-emitted [[SEND_ASSET]] directives). Push only on channels
 * with a send API; on response channels (TikTok) the caller returns the text in
 * the body and media is skipped (no send API there). Each side is independent -
 * a ManyChat failure never loses the DB row.
 */
async function sendKeywordCannedReply(
  supabase: ReturnType<typeof createServiceClient>,
  conversationId: string,
  subscriberId: string,
  text: string,
  assetKey: string | null,
  userId: string,
  chatbotId: string,
  apiKey: string | null,
  platform: Platform,
  linkButtons: boolean
): Promise<void> {
  const push = !!apiKey && canPushPlatform(platform);

  // Resolve the optional asset only when we can actually push it.
  let asset: OutboundAsset | null = null;
  let assetRow: { content: string; media_url: string; media_type: string | null } | null = null;
  if (push && assetKey) {
    const found = resolveAssetByKey(await fetchFollowupAssets(supabase, chatbotId), assetKey);
    asset = assetToOutbound(found);
    if (asset && found?.url) {
      assetRow = {
        content: `(sent ${found.kind}: ${found.key})`,
        media_url: found.url,
        media_type: found.mime ?? null,
      };
    }
  }

  // Persist the text row first, then the media row, so inbox order matches delivery.
  let textMessageId: string | null = null;
  if (text) {
    textMessageId = await insertMessageReturningId(supabase, {
      conversation_id: conversationId, role: "assistant", content: text, ai_generated: false, tokens_used: 0,
    });
  }
  if (assetRow) {
    await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: "assistant", ai_generated: false, tokens_used: 0, ...assetRow })
      .then(() => {}, () => {});
  }

  // Deliver on push channels (response channels get the text via the body).
  if (push && apiKey) {
    try {
      if (asset) {
        await sendManychatMedia({ subscriberId, assets: [asset], text, apiKey, platform, linkButtons });
      } else if (text) {
        await sendManychatMessage({ subscriberId, text, apiKey, platform, linkButtons });
      }
    } catch (err) {
      console.error("[manychat-webhook] keyword push send failed", err);
      await logPushFailure(supabase, userId, chatbotId);
      // Reconcile TEXT-only keyword sends; a media send uses assume-delivered
      // semantics (never re-POST a video), so it's left for the owner to resend.
      if (!asset) await markDeliveryFailed(supabase, textMessageId);
    }
  }
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

  // 2. Parse payload. flattenManychatContact hoists ManyChat "Full Contact Data" (sent
  // as a nested `contact` object) into the flat fields BodySchema expects - the escape-
  // proof way to send a free-text message, since ManyChat won't JSON-escape merge fields
  // in a hand-built body and a newline in the message otherwise makes the request invalid
  // JSON that ManyChat blocks before it reaches us. No-op for the legacy flat body.
  const json = flattenManychatContact(await request.json().catch(() => null));
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

  // Inbound media + the typed text. Either may be empty; we require at least one.
  // A media-CDN URL can arrive inside the message text (IG sends photos that
  // way), so it's pulled into mediaItems and stripped from the text the AI sees.
  const mediaItems = normalizeMediaItems(body as unknown as Record<string, unknown>);
  const hasMedia = mediaItems.length > 0;
  const baseText = stripMediaUrls(body.message).trim();

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
    .select("status, comp_expires_at")
    .eq("user_id", chatbot.user_id)
    .maybeSingle();

  // Access = active/trialing AND (if a comp grant) not past its expiry. A comp
  // that has lapsed reads as no-access here with no scheduled sweep needed.
  if (!hasActiveAccess(subscription)) {
    return manychatReply(
      "Thanks for your message! We'll get back to you shortly.",
      { ai_skipped: true, reason: "subscription_inactive" }
    );
  }

  // 3b. Resolve the ManyChat API key for this chatbot (decrypt the per-chatbot
  // key, or fall back to the global env key for un-migrated owners). A decrypt
  // failure is a HARD error - we NEVER fall back to the env key, which would push
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

  // 3c. Duplicate-message dedup: same TEXT inside 30s → silently absorb. No row,
  // no reply, no unread bump - a ManyChat re-delivery leaves zero trace, and a
  // rapid re-tap folds into the in-flight run's debounce burst (the first tap's
  // run answers once). Skipped when media is attached (two different photos can
  // share empty/identical text). Control words (stopmessage/resumemessage) are
  // ALSO exempt: they toggle state, so a stop→resume→stop within 30s must not
  // have the 3rd command swallowed as a "duplicate" and leave the lead in the
  // wrong state. The reset keyword is exempt for the same reason (a re-reset within
  // 30s must reset, not be absorbed). Trade-off: a deliberate identical re-send
  // within 30s won't appear in the owner's inbox - the reply would be the same.
  if (
    !hasMedia &&
    baseText &&
    !detectUserControl(baseText) &&
    !matchesResetKeyword(baseText, process.env.RESET_KEYWORD)
  ) {
    const dup = await checkDuplicate(chatbot.id, body.subscriber_id, baseText);
    if (dup.isDuplicate) {
      return manychatReply("", { ai_skipped: true, reason: "duplicate" });
    }
  }

  // 4. Upsert conversation. Clean each field: ManyChat sends unresolved merge
  // tags ("{{first_name}}") when fields aren't wired, which we must not store.
  const firstName = cleanContactField(body.first_name);
  const lastName = cleanContactField(body.last_name);
  // Use whichever username field actually carries a real handle.
  const username =
    cleanContactField(body.username) ??
    cleanContactField(body.ig_username) ??
    cleanContactField(body.user_name);
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || username || null;
  // Stable identity that survives a ManyChat contact deletion (see BodySchema). Prefer
  // an explicitly-mapped platform id; else fall back to `username` when the owner has
  // mapped a stable id into it (Messenger PSID / Instagram @handle) - the single-token
  // guard in resolveExternalId keeps a free-text display name from being used as an id.
  // Null = we cannot re-identify a returning contact (no carry-over, behaves as new).
  // ManyChat routing ids, stored on the conversation so the Follow-ups queue can deep-link
  // "Open in ManyChat" straight to the thread (manychatConversationUrl). pageId is reused
  // by resolveExternalId below; liveChatUrl is ManyChat's ready-made per-contact link.
  const pageId = cleanContactField(body.page_id);
  const liveChatUrl = cleanLiveChatUrl(body.live_chat_url);

  const externalId = resolveExternalId({
    externalUserId: cleanContactField(body.external_user_id),
    psid: cleanContactField(body.psid),
    igId: cleanContactField(body.ig_id),
    messengerId: cleanContactField(body.messenger_id),
    username,
    pageId,
  });

  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("chatbot_id", chatbot.id)
    .eq("manychat_subscriber_id", body.subscriber_id)
    .maybeSingle();

  // is_leads lead-tagging is PARKED (owner decision). A ManyChat flow may still send
  // is_leads=1; it is now accepted and IGNORED here - no tag, no silent short-circuit
  // - so a real DM is never swallowed. To un-park: restore this tag branch from git
  // history and re-add `is_lead` to `alreadyEngaged` at 6-gate below. See CLAUDE.md #19.

  let conversationId = existing?.id;
  let conversationStatus = existing?.status;
  // Set when a fresh row inherited a prior thread's silence state (returning contact
  // whose ManyChat contact was deleted+recreated). Stays silent this turn, after the
  // inbound is recorded, so the owner still sees the returning message.
  let carriedSuppression = false;

  if (!existing) {
    // Upsert, not insert: two simultaneous FIRST messages from one new
    // subscriber both pass the SELECT above with no row, and a plain INSERT
    // makes the loser violate unique(chatbot_id, manychat_subscriber_id) and
    // 500 with no reply. On conflict the loser merge-updates the winner's row
    // and gets back its real id/status. `status` is deliberately omitted:
    // the schema default covers fresh inserts, and a conflict-update must not
    // un-pause an ai_paused conversation (human takeover).
    // Retry a few times: a transient DB/network blip here would otherwise drop the
    // inbound entirely (no conversation → no message persisted). Upsert is idempotent,
    // so a retry is safe.
    const { data: created, error: convError } = await retrySupabase(
      (signal) =>
        supabase
          .from("conversations")
          .upsert(
            {
              chatbot_id: chatbot.id,
              user_id: chatbot.user_id,
              manychat_subscriber_id: body.subscriber_id,
              platform,
              contact_name: displayName,
              contact_username: username,
              external_user_id: externalId,
            },
            { onConflict: "chatbot_id,manychat_subscriber_id" }
          )
          .select("id, status")
          .abortSignal(signal)
          .single(),
      { label: "conversation upsert" }
    );
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

    // Deep-link ids in a separate best-effort write (see stampManychatDeepLink) so a
    // pre-migration deploy can never cost this new lead their conversation row or reply.
    await stampManychatDeepLink(supabase, conversationId, { pageId, liveChatUrl });

    // Returning contact: a deleted+recreated ManyChat contact arrives as a BRAND-NEW
    // subscriber_id, so this fresh row has none of the prior thread's silence state and
    // the bot would resume. If we can re-identify the person (stable external_user_id)
    // and their most-recent prior thread is still silenced, carry ONLY that silence
    // state onto this row (never the transcript - "keep the pause", not a merge) so the
    // pause survives the deletion. Persisting it means the normal 6-* gates handle every
    // LATER turn; carriedSuppression silences THIS turn (below, after the inbound is
    // recorded). Best-effort: a lookup/update failure must not break the reply path.
    if (externalId) {
      // Fetch a few prior threads sharing this identity (most-recent first). A genuine
      // per-user id maps to at most a handful of rows (one per deletion cycle); if it's
      // on MANY rows it's a shared/bogus id (e.g. a Page Id mapped by mistake) and using
      // it would silence a crowd - so bail rather than carry. IDENTITY_MAX_SHARED_ROWS+1
      // is fetched to detect the overflow.
      const { data: priors } = await supabase
        .from("conversations")
        .select("status, user_muted_at, bot_off_at, confirmed_at, tag")
        .eq("chatbot_id", chatbot.id)
        .eq("external_user_id", externalId)
        .neq("id", conversationId!)
        .order("last_message_at", { ascending: false })
        .limit(IDENTITY_MAX_SHARED_ROWS + 1);
      if (priors && priors.length > IDENTITY_MAX_SHARED_ROWS) {
        console.warn(
          "[manychat-webhook] external_user_id shared across too many contacts - skipping suppression carry (likely a non-unique id such as a Page Id)",
          { chatbotId: chatbot.id, count: priors.length }
        );
      } else {
        // Most-recent prior reflects the owner's latest intent for this person.
        const carry = suppressionCarry(priors?.[0]);
        if (Object.keys(carry).length > 0) {
          await supabase
            .from("conversations")
            .update(carry)
            .eq("id", conversationId!)
            .then(() => {}, (err) => console.error("[manychat-webhook] suppression carry failed", err));
          conversationStatus = carry.status ?? conversationStatus;
          carriedSuppression = true;
        }
      }
    }
  } else {
    // A reply RE-ARMS the drip timing but KEEPS the sequence position, so the lead
    // advances to the NEXT step the next time they go quiet - never a repeat of
    // step 1. (Resetting followup_step_index here was a bug: a lead who replied
    // briefly then went quiet kept getting the same first follow-up over and over,
    // and the later steps the owner configured never fired.) Loop mode governs only
    // what happens AFTER the last step (stop / repeat_last / cycle), matching its UI
    // label - it is NOT a "restart on reply" switch. Clearing last_followup_at
    // re-arms the timing (the next step's delay is measured from this reply) and the
    // fresh last_message_at reopens the 24h send window.
    //
    // A muted lead's inbound must NOT re-arm the drip: freeze last_followup_at so the
    // sequence resumes cleanly from where it was once they un-mute. (The cron already
    // skips muted leads via the user_muted_at filter, so this is inert while muted -
    // but freezing it keeps the timing correct for resume.)
    const muted = !!existing.user_muted_at;
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: (existing.unread_count ?? 0) + 1,
        // Heal old rows too: replace a stored placeholder/empty with a real value.
        contact_name: cleanContactField(existing.contact_name) ?? displayName,
        contact_username: cleanContactField(existing.contact_username) ?? username,
        // Backfill the stable identity once so a FUTURE contact deletion can carry this
        // thread's pause. Only set when currently empty (never overwrite a good value).
        ...(existing.external_user_id || !externalId ? {} : { external_user_id: externalId }),
        ...(muted ? {} : { last_followup_at: null }),
      })
      .eq("id", existing.id);

    // The ManyChat deep-link ids are stamped SEPARATELY (backfill-only) rather than folded
    // into the update above: an un-migrated column would otherwise fail that whole update
    // ATOMICALLY, silently freezing last_message_at / unread_count / identity backfill. Old
    // rows predate these columns and fill in here on their next inbound. See
    // stampManychatDeepLink.
    await stampManychatDeepLink(supabase, existing.id, { pageId, liveChatUrl }, existing);
  }

  // Reset keyword (testing tool). A universal, admin-set control word (RESET_KEYWORD
  // env var; blank/unset = feature OFF) that wipes THIS conversation back to a
  // brand-new state so the full funnel (welcome VM, keyword triggers, follow-ups) can
  // be re-tested. Runs right after the step-4 upsert but BEFORE the inbound is recorded
  // (step 5), BEFORE the "4a" RN opt-in below, and BEFORE every silencing gate
  // (human-takeover/subscribed/disqualified/keyword-gate/mute) - so it can recover a
  // stuck (subscribed/muted/paused) thread and leaves no trace of the reset word.
  // Scoped to the sender's OWN conversation. Universal admin secret, not a tenant
  // literal (like the stop/resume words). Fail-open: on any error it returns an honest
  // "couldn't reset" (still ai_skipped, so the magic word never reaches the AI).
  if (conversationId && matchesResetKeyword(baseText, process.env.RESET_KEYWORD)) {
    const RESET_ACK = "Conversation reset. Send your opener to start fresh.";
    const RESET_FAILED = "Couldn't reset the conversation, please try again.";
    try {
      // Wipe the transcript + restore fresh-conversation defaults via the shared
      // helper - the SAME reset the admin "Reset conversation" button runs, so the
      // two can never drift. It returns ok:false (not a throw) on a silent RLS deny /
      // transient error, which would otherwise read as a false "reset done" on the
      // exact stuck thread this tool exists to recover - surface it honestly.
      const { ok: resetOk, error: resetErr } = await resetConversation(
        supabase,
        conversationId
      );
      if (!resetOk) {
        console.error("[manychat-webhook] reset gate DB error", resetErr);
        return manychatReply(sanitizeReply(RESET_FAILED), { ai_skipped: true, reason: "reset_failed" });
      }
      // Best-effort ack - NOT persisted, so the thread stays empty. On push channels
      // this is the visible confirmation; the response body below covers other channels.
      if (apiKey && canPushPlatform(platform)) {
        await sendManychatMessage({
          subscriberId: body.subscriber_id,
          text: RESET_ACK,
          apiKey,
          platform,
        }).catch((err) => console.error("[manychat-webhook] reset ack push failed", err));
      }
    } catch (err) {
      // Any unexpected throw → honest failure, not a false success.
      console.error("[manychat-webhook] reset gate error", err);
      return manychatReply(sanitizeReply(RESET_FAILED), { ai_skipped: true, reason: "reset_failed" });
    }
    return manychatReply(sanitizeReply(RESET_ACK), { ai_skipped: true, reason: "conversation_reset" });
  }

  // 4a. Recurring Notifications opt-in (Phase 6): if this inbound carries the RN
  // opt-in flag, stamp it on the conversation so the cron can follow up past the
  // 24h window. Best-effort; never blocks the reply.
  if (conversationId && isTruthyFlag(body.rn_opt_in)) {
    await supabase
      .from("conversations")
      .update({
        rn_opt_in_at: new Date().toISOString(),
        rn_topic_id: body.rn_topic_id ?? null,
      })
      .eq("id", conversationId)
      .then(
        () => {},
        () => {}
      );
  }

  // 4b-on. ManyChat BOT_ON tag sync - the inverse of the 4c BOT_OFF handler below, and
  // checked FIRST so an explicit resume wins even if a stray `bot_off` field rides along
  // in the same payload (a cloned tag-sync template can carry both). bot_on=true HANDS
  // THE CONVERSATION BACK TO THE BOT: clear the OWNER pauses - bot_off_at (BOT_OFF tag)
  // and status ai_paused→active (dashboard human-takeover) - AND stamp bot_forced_on_at,
  // a persistent manual override that force-engages the contact so the keyword-only gate
  // (6-gate) is bypassed: the bot then replies to this contact regardless of whether
  // their message matches a keyword. This is the "ignore the keywords I set" behavior -
  // a keyword-gated bot would otherwise silence a never-matched contact forever. The
  // reply lands on the contact's NEXT inbound (this tag-sync request carries no message),
  // symmetric with how BOT_OFF silences the next message. It deliberately does NOT clear
  // the lead's own user_muted_at ("stopmessage" opt-out; the lead re-enables with
  // "resumemessage"), nor business/safety states (subscribed confirmed_at,
  // disqualified/flagged) - so BOT_ON never re-engages a converted customer, a detected
  // bot, or someone who opted out; those gates (6-subscribed/6-disqualified) sit above
  // 6-gate and still silence. (status→active DOES clear an extraction auto-pause - now
  // ON by default, EXTRACTION_AUTO_STANDDOWN - which is intended: BOT_ON is an explicit
  // owner override to hand a paused thread back to the bot. The pause carries its own
  // marker, conversations.extraction_hard_attempts, so it stays distinguishable from a
  // manual takeover in the inbox/stats.) reply_claimed_for is left untouched so a concurrent
  // in-flight burst reply's single-flight claim isn't dropped. Runs before the
  // empty-message ack. Fail-open: a DB error is logged, still acked.
  if (conversationId && isTruthyFlag(body.bot_on)) {
    // TWO writes on purpose. PostgREST rejects an UPDATE that references an un-migrated
    // column ATOMICALLY, so folding bot_forced_on_at into the resume update would ALSO
    // drop bot_off_at:null + status:active in any deploy-before-migrate window - silently
    // regressing BOT_ON's pre-existing resume. Do the resume first (always-present columns,
    // order-independent), then stamp the override separately + best-effort so a missing
    // column fails THIS write alone and leaves the resume standing (same fail-soft idiom
    // as the keyword_fired bridge / markFired below).
    const { error: botOnErr } = await supabase
      .from("conversations")
      .update({ bot_off_at: null, status: "active" })
      .eq("id", conversationId);
    if (botOnErr) console.error("[manychat-webhook] bot_on sync error", botOnErr);
    await supabase
      .from("conversations")
      .update({ bot_forced_on_at: new Date().toISOString() })
      .eq("id", conversationId)
      .then(() => {}, () => {});
    // Resuming may re-allow follow-ups - reconcile the ManyChat no-followup flag.
    after(() => syncNoFollowupFlag(supabase, conversationId!));
    return manychatReply("", { ai_skipped: true, reason: "bot_on_set" });
  }

  // 4c. ManyChat BOT_OFF tag sync. A tag-change automation posts bot_off=true (tag
  // added) or bot_off=false (tag removed), with no message. Set/clear the per-subscriber
  // silence flag and ack - the flag never reaches the AI. Runs before the empty-message
  // ack so a no-message control request is handled here. When bot_off is absent (a normal
  // message) this is skipped; a bot-off subscriber's later DMs are silenced by the
  // 6-bot-off gate below. Fail-open: a DB error is logged, the request is still acked.
  if (conversationId && body.bot_off != null) {
    const off = isTruthyFlag(body.bot_off);
    const { error: botOffErr } = await supabase
      .from("conversations")
      .update({ bot_off_at: off ? new Date().toISOString() : null })
      .eq("id", conversationId);
    if (botOffErr) console.error("[manychat-webhook] bot_off sync error", botOffErr);
    return manychatReply("", { ai_skipped: true, reason: off ? "bot_off_set" : "bot_off_cleared" });
  }

  // 4.5. Nothing to act on (no text and no media): ack without a reply.
  if (!baseText && !hasMedia) {
    return manychatReply("", { ai_skipped: true, reason: "empty_message" });
  }

  // 5. Record inbound message. For media we store a provisional label now and
  // backfill the readable content + durable media pointer after processing
  // (which runs in the background to keep the fast-ack quick).
  const provisionalContent = baseText || "📎 Attachment…";
  // Retry the inbound record a few times: this row IS the "message received on
  // SpeedSettr", so a transient DB blip here must not silently lose it. Retrying a
  // failed insert is safe (a query error means nothing was written).
  const { data: inboundMsg } = await retrySupabase(
    (signal) =>
      supabase
        .from("messages")
        .insert({
          conversation_id: conversationId!,
          role: "user",
          content: provisionalContent,
        })
        .select("id")
        .abortSignal(signal)
        .single(),
    { label: "inbound message insert" }
  );
  const inboundId = inboundMsg?.id as string | undefined;

  // 5b. Returning-contact pause. This fresh row inherited a prior thread's silence
  // state (step 4: the person's ManyChat contact was deleted+recreated). The inbound is
  // now persisted + unread-bumped, so the owner SEES the returning message - we just
  // withhold the auto-reply, exactly like the 6-* gates. Every LATER turn is covered by
  // those gates on the fields we carried onto the row.
  if (carriedSuppression) {
    return manychatReply("", { ai_skipped: true, reason: "returning_contact_paused" });
  }

  // 6. If human took over, do not generate AI reply
  if (conversationStatus === "ai_paused") {
    return manychatReply("", { ai_skipped: true, reason: "human_takeover" });
  }

  // When this bot opts to keep replying through classifier tags, the 6-subscribed,
  // 6-disqualified, and step-7b silencers are skipped (BOT_OFF / takeover / opt-out
  // still win). Fail-safe: a missing column reads false.
  const keepRepliesWhenTagged = chatbot.keep_replies_when_tagged === true;

  // 6-subscribed. A confirmed customer/subscriber gets NO automated messages - the
  // bot goes fully silent (a teammate handles them from here). Mirrors human-
  // takeover, and sits above the keyword/mute/trivial/AI paths so a customer never
  // gets a reply of any kind. The inbound is already persisted + unread-bumped
  // (step 5) so the owner still SEES the message. Note: the CONVERTING turn is not
  // silenced - confirmed_at is null when that message reaches here; 9a sets it
  // afterward, so a final reply lands and only the NEXT message is silenced. The
  // follow-up cron already excludes confirmed_at, so the drip is stopped too.
  if (existing?.confirmed_at && !keepRepliesWhenTagged) {
    return manychatReply("", { ai_skipped: true, reason: "subscribed_stopped" });
  }

  // 6-bot-off. A subscriber tagged BOT_OFF in ManyChat (synced to bot_off_at by the
  // 4c handler) gets NO automated messages - fully silent, same as subscribed/human-
  // takeover. The inbound is already persisted + unread-bumped (step 5) so the owner
  // sees it to answer by hand. Fail-open: a missing column reads as not-off.
  if (existing?.bot_off_at) {
    return manychatReply("", { ai_skipped: true, reason: "bot_off_stopped" });
  }

  // 6-disqualified. A disqualified / detected-bot thread gets NO automated
  // messages - same full silence as a subscribed customer (gate 6 above). This
  // catches every turn AFTER the first; the first offending message is silenced
  // by the pre-reply screen (step 7b below). The owner reopens by changing the
  // tag in the inbox; this gate reads existing.tag, so replies resume the moment
  // it changes.
  if ((existing?.tag === "disqualified" || existing?.tag === "bot") && !keepRepliesWhenTagged) {
    return manychatReply("", { ai_skipped: true, reason: "disqualified_stopped" });
  }

  // 6-gate. Keyword-only reply mode - the OUTERMOST filter for a gated bot (only
  // human-takeover above it). When ON, the bot only engages contacts who have
  // shown intent via a keyword (personal/private accounts that don't want the AI
  // replying to unrelated people). The keyword is an ENTRY qualifier, not a
  // per-message filter: a contact unlocks the bot by matching a keyword once
  // (recorded on keyword_fired at 6c) and is then a possible lead, so every later
  // message - keyword or not - falls through and gets answered, so the bot can
  // carry the conversation it started ("repair or funding?" → the lead's plain
  // answer still gets a reply). A contact who has NEVER matched a keyword stays
  // silent. Deliberately placed ABOVE 6-mute/6a/6b/6c: a gated stranger must get
  // NO automatic reply of ANY kind - not a stop/resume confirmation, not the
  // trivial ack, not the extraction deflection, not the AI. (If the gate sat below
  // 6-mute, a stranger typing "stopmessage" would get an "I'll hold off" bubble -
  // an auto-reply to a non-lead, which is exactly what this feature forbids.)
  // `keywordGroup` is computed here and reused by 6c. baseText only: a media-only
  // DM matches nothing → still gated for a never-engaged contact (an engaged lead
  // falls through). Fail-open: a missing column reads as false (gate off). The
  // inbound is already persisted (step 5) + unread-bumped, so the owner still SEES
  // a gated message in the inbox to answer manually - only the AUTO reply is
  // withheld, like human-takeover.
  const keywordGroup = baseText
    ? firstMatchingGroup(baseText, chatbot.keyword_triggers ?? [], chatbot.keyword_strict_enabled ?? false)
    : null;
  // Engaged = matched a keyword before (keyword_fired non-empty). Lead-tagging via
  // is_leads is PARKED (see the note where the branch was), so is_lead is no longer
  // consulted here - engagement is keyword-only.
  const alreadyEngaged =
    Array.isArray(existing?.keyword_fired) && existing!.keyword_fired.length > 0;
  // BOT_ON manual override (4b-on): the owner tagged this contact BOT_ON to force the bot
  // to engage them regardless of the keyword gate - treat them as engaged so a
  // never-matched contact still gets a reply. Fail-open: a missing column reads as off.
  const forcedOn = !!existing?.bot_forced_on_at;
  // Answer-opener-questions softening: a stranger who was screened as a genuine inquiry
  // on an earlier turn is engaged from then on (a SEPARATE sticky flag from keyword_fired).
  const questionEngaged = !!existing?.question_engaged_at;
  if (keywordGateBlocks(chatbot.keyword_gate_enabled ?? false, !!keywordGroup, alreadyEngaged || forcedOn || questionEngaged)) {
    // The gate WOULD silence this stranger. Opt-in softening: if they OPENED with a
    // genuine business question, answer it and start the conversation instead of going
    // silent. Two-stage + bounded, fail-CLOSED at every step (any miss/error → stay
    // gated, i.e. the pre-feature silence - the safe direction for a privacy gate):
    //   1. keyword_gate_answer_questions must be on for this bot;
    //   2. question_screen_count < MAX_QUESTION_SCREENS caps the paid screens per contact;
    //   3. Stage 1 isSubstantiveInquiry (free) rejects greetings/acks/control/probes/noise;
    //   4. Stage 2 screenInquiryRelevance (cheap AI) confirms it's a real prospect inquiry.
    // On a pass we stamp question_engaged_at (best-effort) and FALL THROUGH to the normal
    // welcome/AI path - normally the AI answers the question, though if their opener ALSO
    // matches a welcome_keyword or is a comment opt-in the Welcome VM greets them instead
    // (still "starts the conversation", just via the VM). We deliberately do NOT write
    // keyword_fired (keeps keyword/lead analytics clean) and
    // the follow-up cron keys off keyword_fired, so these contacts are answered reactively
    // but never auto-enrolled in the proactive drip.
    const priorScreens =
      typeof existing?.question_screen_count === "number" ? existing.question_screen_count : 0;
    let answerAsInquiry = false;
    if (
      (chatbot.keyword_gate_answer_questions ?? false) &&
      priorScreens < MAX_QUESTION_SCREENS &&
      isSubstantiveInquiry(baseText)
    ) {
      // Count the screen attempt up-front (best-effort) so a flood of substantive-but-
      // irrelevant messages can't run the classifier unboundedly.
      await supabase
        .from("conversations")
        .update({ question_screen_count: priorScreens + 1 })
        .eq("id", conversationId!)
        .then(() => {}, () => {});
      answerAsInquiry = await screenInquiryRelevance({
        text: baseText,
        botName: chatbot.name,
        businessContext: chatbot.business_description || (chatbot.system_prompt ?? "").slice(0, 400),
      });
      if (answerAsInquiry) {
        await supabase
          .from("conversations")
          .update({ question_engaged_at: new Date().toISOString() })
          .eq("id", conversationId!)
          .then(() => {}, () => {});
      }
    }
    if (!answerAsInquiry) {
      return manychatReply("", { ai_skipped: true, reason: "keyword_gate_blocked" });
    }
    // else: fall through to the welcome/AI path - the inquiry gets answered.
  }

  // 6-mute. Self-service pause/resume. A lead silences the AI by texting
  // "stopmessage" and turns it back on with "resumemessage". Tracked on
  // conversations.user_muted_at, INDEPENDENT of the owner's human-takeover
  // (status='ai_paused', gated above) so a lead can't resume a chat a human has
  // taken over - and no confirmation bubble fires into a human's conversation.
  // Runs before rate-limit so a control word is never dropped, and returns a
  // muted lead before any AI cost. On a gated bot the 6-gate above has already
  // silenced never-engaged strangers, so this only ever sees engaged leads (or
  // non-gated bots) - a stranger's "stopmessage" never reaches here. Fail-open: a
  // missing column reads as not-muted. Control words are exempt from the 30s dedup
  // gate above (they toggle state), so a duplicate "stopmessage" isn't re-confirmed
  // by the idempotence below (stop-while-already-muted → silent, no second bubble),
  // not by dedup.
  const control = baseText ? detectUserControl(baseText) : null;
  const isMuted = !!existing?.user_muted_at;
  if (control === "resume" && isMuted) {
    // Clear the mute and any stale debounce claim left by the earlier stop.
    const { error: unmuteErr } = await supabase
      .from("conversations")
      .update({ user_muted_at: null, reply_claimed_for: null })
      .eq("id", conversationId!);
    if (unmuteErr) console.error("[manychat-webhook] unmute write failed", unmuteErr);
    await persistAndPush(supabase, conversationId!, body.subscriber_id, RESUME_CONFIRMATION, chatbot.user_id, chatbot.id, apiKey, platform);
    // Un-mute may un-block the lead; reconcile the ManyChat flag post-response
    // (reads truth - keeps the tag if the thread is still subscribed/disqualified).
    after(() => syncNoFollowupFlag(supabase, conversationId!));
    return manychatReply(sanitizeReply(RESUME_CONFIRMATION), { ai_skipped: true, reason: "user_resumed" });
  }
  if (control === "stop" && !isMuted) {
    // Overwrite reply_claimed_for so an in-flight burst run (a question asked
    // seconds earlier, still generating/pushing) fails its single-flight CAS
    // release and discards - the lead doesn't get an answer bubble AFTER the
    // "I'll hold off" confirmation.
    const { error: muteErr } = await supabase
      .from("conversations")
      .update({ user_muted_at: new Date().toISOString(), reply_claimed_for: inboundId ?? null })
      .eq("id", conversationId!);
    if (muteErr) console.error("[manychat-webhook] mute write failed", muteErr);
    await persistAndPush(supabase, conversationId!, body.subscriber_id, STOP_CONFIRMATION, chatbot.user_id, chatbot.id, apiKey, platform);
    // A self-mute blocks follow-ups - mirror to ManyChat post-response.
    after(() => syncNoFollowupFlag(supabase, conversationId!));
    return manychatReply(sanitizeReply(STOP_CONFIRMATION), { ai_skipped: true, reason: "user_paused" });
  }
  // Muted, and this wasn't the resume word → stay silent (no AI). A redundant
  // "stopmessage" while already muted also lands here (no duplicate confirmation).
  if (isMuted) {
    return manychatReply("", { ai_skipped: true, reason: "user_muted" });
  }

  // 6-welcome. First-contact greeting decision - opted-in bots only, and placed
  // below the subscribed/disqualified/keyword-gate/mute floors so we never greet
  // those. If the opener is a bare greeting/keyword (or a comment-campaign opt-in)
  // fire the native ManyChat Welcome VM flow and skip the AI; a substantive opener
  // (image/detail/question) falls through to the AI, which reads it. welcomed_at is
  // set either way, making this a one-time decision per contact (the fix for the old
  // ManyChat behaviour that re-greeted whenever the VM wasn't sent). The flow trigger
  // runs in after() so the webhook still fast-acks. Fail-open: any error → AI path.
  if (chatbot.welcome_enabled && chatbot.welcome_flow_ns) {
    try {
      const sendWelcome = shouldSendWelcome({
        welcomedAt: existing?.welcomed_at ?? null,
        entryPoint: body.entry_point ?? null,
        hasMedia,
        text: baseText,
        // Reuse the keyword-gate's own match (computed above) so the welcome fires on the
        // SAME rule as the Keywords tab when welcome_use_keyword_triggers is on.
        keywordMatched: !!keywordGroup,
        chatbot: {
          welcome_enabled: chatbot.welcome_enabled,
          welcome_flow_ns: chatbot.welcome_flow_ns,
          welcome_keywords: coerceKeywords(chatbot.welcome_keywords),
          welcome_use_keyword_triggers: !!chatbot.welcome_use_keyword_triggers,
        },
      });
      if (sendWelcome && apiKey) {
        // Race-safe claim so a first-message burst fires the VM at most once.
        const { data: claimed, error: claimError } = await supabase
          .from("conversations")
          .update({ welcomed_at: new Date().toISOString() })
          .eq("id", conversationId!)
          .is("welcomed_at", null)
          .select("id");
        // supabase-js resolves a DB failure as { data: null, error } instead of
        // throwing, which would look EXACTLY like a lost claim below and silently
        // drop this message (no VM, no AI). Throw so the catch falls through to the
        // normal AI path - fail-open.
        if (claimError) throw new Error(`welcome claim failed: ${claimError.message}`);
        if (claimed?.length) {
          await supabase.from("messages").insert({
            conversation_id: conversationId!,
            role: "assistant",
            content: "(sent welcome voice)",
            ai_generated: false,
            tokens_used: 0,
          });
          // Engagement bridge for keyword-gated bots. The welcome path returns before
          // 6c (the only place keyword_fired is written), so a welcomed contact whose
          // opener matched a keyword group would otherwise be stranded: their next
          // non-keyword message is silenced at 6-gate and the follow-up cron skips them
          // (both key off keyword_fired). Record the match here, mirroring 6c's markFired,
          // so a welcomed lead stays "engaged". Best-effort: a lost update just leaves
          // them gated - the same failure mode 6c already tolerates. Only the welcome-FIRED
          // path needs this; the substantive fall-through still reaches 6c normally.
          if (keywordGroup) {
            const firedIds: string[] = Array.isArray(existing?.keyword_fired)
              ? (existing!.keyword_fired as string[])
              : [];
            if (!firedIds.includes(keywordGroup.id)) {
              await supabase
                .from("conversations")
                .update({ keyword_fired: Array.from(new Set([...firedIds, keywordGroup.id])) })
                .eq("id", conversationId!)
                .then(() => {}, () => {});
            }
          }
          const welcomeFlowNs = chatbot.welcome_flow_ns;
          const welcomeSubId = body.subscriber_id;
          const welcomeKey = apiKey;
          after(() =>
            sendManychatFlow({ subscriberId: welcomeSubId, flowNs: welcomeFlowNs, apiKey: welcomeKey }).catch(
              (err) => console.error("[manychat-webhook] welcome flow send failed", err)
            )
          );
          return manychatReply("", { ai_skipped: true, reason: "welcome_sent" });
        }
        // Lost the claim → another run already welcomed. No AI, no second VM.
        return manychatReply("", { ai_skipped: true, reason: "welcome_duplicate" });
      }
      if (!sendWelcome && !existing?.welcomed_at) {
        // First contact, but substantive / non-opener → mark the decision resolved so
        // a later greeting can't re-trigger the VM, then fall through to the AI.
        await supabase
          .from("conversations")
          .update({ welcomed_at: new Date().toISOString() })
          .eq("id", conversationId!)
          .is("welcomed_at", null);
      }
      // sendWelcome && !apiKey → can't trigger the flow; fall through to the AI
      // WITHOUT marking welcomed_at, so a later turn with a working key can still greet.
    } catch (err) {
      console.error("[manychat-webhook] welcome gate error (falling through to AI)", err);
    }
  }

  // 6a. Rate limit per (chatbot, subscriber). Silent drop on flood - no push,
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
  // in-voice reply from the persona instead of a generic canned line. Also
  // skipped while a debounce claim is pending: a "thanks" landing mid-burst
  // must fall through to the AI path (claim + supersede) so the burst's real
  // question still gets answered - a canned ack row would otherwise become a
  // burst boundary and strand it.
  // A bot counts as a "persona bot" if it has a custom voice in EITHER form: the
  // legacy `system_prompt` column OR the newer editable sections (persona / offers
  // / rebuttals). Section-mode bots - which is most current clients - have an EMPTY
  // system_prompt, so checking only that let the generic English ack leak into
  // bilingual / non-English personas (e.g. a Spanish chat getting "Got it! Let me
  // know if there's anything else." on a bare "ok"). Mirror buildSystemPrompt's own
  // persona detection so ANY customized bot skips the canned ack and instead answers
  // in-voice and in-language through the AI (its language rule then applies).
  const hasPersona = !!(
    chatbot.system_prompt?.trim() ||
    chatbot.persona_section?.trim() ||
    chatbot.offers_section?.trim() ||
    chatbot.rebuttals_section?.trim()
  );
  const trivial =
    hasPersona || hasMedia || existing?.reply_claimed_for
      ? null
      : getTrivialReply(baseText);
  if (trivial) {
    await persistAndPush(supabase, conversationId!, body.subscriber_id, trivial, chatbot.user_id, chatbot.id, apiKey, platform);
    return manychatReply(trivial, { ai_skipped: true, reason: "trivial_ack" });
  }

  // 6b-shield. Anti-prompt-extraction (Layer 2; Layer 1 is the always-on
  // CONFIDENTIALITY block in buildSystemPrompt). Runs for ALL bots (persona
  // included) on baseText only, BEFORE keyword triggers so a hard attack can't
  // also fire a keyword canned reply. Tiered: HARD (blatant) → static
  // deflection, the attacker's text never reaches the model; SOFT (ambiguous)
  // or HARD mid-burst → fall through steered by a per-turn reinforcement, the
  // AI still answers. Every detection flags the conversation for the owner
  // (extraction_attempts/flagged_at + usage_log) best-effort. Fail-open: a
  // throwing detector or missing column must never break a normal reply.
  let securityInstruction: string | null = null;
  let extraction: ExtractionResult = { level: "none", patterns: [] };
  try {
    if (baseText) extraction = detectExtractionAttempt(baseText);
  } catch {
    /* fail-open */
  }
  if (extraction.level !== "none") {
    const priorAttempts =
      typeof existing?.extraction_attempts === "number" ? existing.extraction_attempts : 0;
    const newAttempts = priorAttempts + 1;
    const priorHard =
      typeof existing?.extraction_hard_attempts === "number" ? existing.extraction_hard_attempts : 0;
    const newHard = priorHard + (extraction.level === "hard" ? 1 : 0);
    const flagUpdate: Record<string, unknown> = {
      extraction_attempts: newAttempts,      // all tiers → inbox "Flagged" badge
      extraction_hard_attempts: newHard,     // blatant only → stand-down gate + pause marker
      flagged_at: new Date().toISOString(),
    };
    // Repeat-attempt graceful auto-handoff: pause the thread for owner takeover on
    // the Nth BLATANT (HARD) attempt (EXTRACTION_PAUSE_THRESHOLD, default 2). Gated
    // on the HARD-only counter so a curious SOFT probe ("are you chatgpt?") never
    // accrues toward a pause. Enabled by default (EXTRACTION_AUTO_STANDDOWN).
    const standingDown =
      AUTO_PAUSE_ON_EXTRACTION &&
      extraction.level === "hard" &&
      newHard >= EXTRACTION_PAUSE_THRESHOLD;
    if (standingDown) {
      flagUpdate.status = "ai_paused";
    }
    await supabase
      .from("conversations")
      .update(flagUpdate)
      .eq("id", conversationId!)
      .then(() => {}, () => {});
    await supabase
      .from("usage_log")
      .insert({
        user_id: chatbot.user_id,
        chatbot_id: chatbot.id,
        event_type: "extraction_attempt",
        tokens_used: 0,
      })
      .then(() => {}, () => {});

    // HARD → guaranteed no-leak deflection (no AI call). Normally skipped mid-burst
    // (a canned row would become a burst boundary and strand an earlier question),
    // BUT when standing down we send the graceful sign-off even mid-burst: the
    // thread is being paused (no burst to preserve), and falling through would drop
    // the reply silently with no sign-off.
    if (extraction.level === "hard" && (standingDown || !existing?.reply_claimed_for)) {
      const text = standingDown
        ? EXTRACTION_STANDDOWN_MESSAGE
        : pickDeflection(body.subscriber_id, baseText.length);
      await persistAndPush(supabase, conversationId!, body.subscriber_id, text, chatbot.user_id, chatbot.id, apiKey, platform);
      return manychatReply(sanitizeReply(text), {
        ai_skipped: true,
        reason: standingDown ? "extraction_standdown" : "extraction_blocked",
      });
    }
    // SOFT, or HARD mid-burst (not standing down) → steer this turn and fall through.
    securityInstruction = EXTRACTION_REINFORCEMENT;
  }

  // 6c. Keyword triggers (per-chatbot, data-driven). Match the inbound text against
  // the owner's keyword groups (case-insensitive whole-word contains). The FIRST
  // match for this contact sends the group's canned reply (text + optional saved
  // asset) and records the group id on conversations.keyword_fired; later matches
  // run the group's on_repeat action. Matches baseText only (media captions aren't
  // available yet). Fires for ALL bots (persona bots included). Fail-open: a missing
  // column reads as no triggers. `keywordInstruction` is captured by the AI closure
  // below for on_repeat="instruction". `keywordGroup` was matched once at 6-gate above.
  let keywordInstruction: string | null = null;
  if (keywordGroup) {
    const firedIds: string[] = Array.isArray(existing?.keyword_fired)
      ? (existing!.keyword_fired as string[])
      : [];
    const alreadyFired = firedIds.includes(keywordGroup.id);
    // The canned paths (first reply / repeat "message") insert an assistant row and
    // return immediately, so they must skip mid-burst (a pending claim): a canned
    // row would become a burst boundary and strand an earlier unanswered question.
    // Mid-burst they fall through to the AI's debounce consolidation instead.
    const canCanned = !existing?.reply_claimed_for;
    // Mark the group delivered to this contact (best-effort; a lost update just
    // re-runs the first reply once, never strands the contact with no reply).
    const markFired = () =>
      supabase
        .from("conversations")
        .update({ keyword_fired: Array.from(new Set([...firedIds, keywordGroup.id])) })
        .eq("id", conversationId!)
        .then(() => {}, () => {});

    if (!alreadyFired) {
      const firstMode = keywordGroup.first_reply_mode ?? "message";
      if (firstMode === "message") {
        // Canned first reply (text + optional asset). Guarding on `text` means a
        // text-less group (e.g. its only asset was later deleted) falls through to
        // the AI rather than silently sending nothing yet marking itself fired.
        const text = keywordGroup.first_reply_text?.trim() ?? "";
        if (canCanned && text) {
          await sendKeywordCannedReply(
            supabase, conversationId!, body.subscriber_id, text,
            keywordGroup.first_reply_asset_key ?? null,
            chatbot.user_id, chatbot.id, apiKey, platform, chatbot.link_buttons_enabled === true
          );
          await markFired();
          // Sanitize the response-body copy (raw stays in the DB row): on response
          // channels (TikTok) the body IS the delivery, so owner em dashes must be
          // stripped just like AI replies; on push channels the send layer sanitizes.
          return manychatReply(sanitizeReply(text), { ai_skipped: true, reason: "keyword_trigger" });
        }
        // mid-burst or no text → fall through to the AI (canned deferred, not marked).
      } else {
        // "ai" / "instruction": the AI handles the first reply. Steer it (instruction
        // mode) and mark fired so the NEXT match runs on_repeat, then fall through.
        if (firstMode === "instruction") {
          keywordInstruction = keywordGroup.first_reply_instruction?.trim() || null;
        }
        await markFired();
      }
    } else if (keywordGroup.on_repeat === "message") {
      const text = keywordGroup.repeat_text?.trim() ?? "";
      if (canCanned && text) {
        await sendKeywordCannedReply(
          supabase, conversationId!, body.subscriber_id, text, null,
          chatbot.user_id, chatbot.id, apiKey, platform, chatbot.link_buttons_enabled === true
        );
        return manychatReply(sanitizeReply(text), { ai_skipped: true, reason: "keyword_repeat" });
      }
    } else if (keywordGroup.on_repeat === "instruction") {
      keywordInstruction = keywordGroup.instruction?.trim() || null;
    }
    // First-reply "ai"/"instruction", on_repeat="ai", or a canned path skipped
    // mid-burst → fall through to the AI (with keywordInstruction if set).
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

  // Best-effort claim release for abort paths (human takeover / burst already
  // answered): clears our claim so the trivial-ack shortcut re-arms. A failed
  // release is harmless - the next message's claim overwrites it anyway.
  const releaseClaim = async (): Promise<void> => {
    if (!inboundId) return;
    await supabase
      .from("conversations")
      .update({ reply_claimed_for: null })
      .eq("id", conversationId!)
      .eq("reply_claimed_for", inboundId)
      .then(
        () => {},
        () => {}
      );
  };

  // 7–9. Generate the AI reply, persist it + usage, and update Redis side-state.
  // Returns the reply text, or null when this run stood down (burst mode only:
  // superseded by a newer message, human takeover, or nothing left to answer).
  // Shared by both delivery paths below; the RESPONSE path always runs "single"
  // mode, which never returns null and behaves exactly as before.
  const generateAndPersistReply = async (
    mode: "burst" | "single" = "single",
    // synchronous: this runs on the RESPONSE path (reply returned in the HTTP body
    // under ManyChat's ~10s timeout, no debounce to absorb latency). When true we
    // skip the extra per-image vision-describe call - the current turn still gets
    // the raw image as vision; we just don't persist a text description.
    synchronous = false
  ): Promise<{
    text: string;
    deliver: LinkFlowDelivery[];
    /** Media directive keys resolved to sendable assets, keyed by (lower-cased) asset key.
     *  The delivery block looks each `media` step's key up here; unresolved keys are absent
     *  and simply skipped. */
    resolvedAssets: Record<string, OutboundAsset>;
    tagWork?: Promise<void>;
  } | null> => {
    // 6e. Process any inbound media (network): transcribe audio/video, read
    // documents, encode images for vision. Runs here (background for push
    // channels) so the fast-ack isn't blocked by downloads/transcription.
    let images: { base64: string; mediaType: string }[] = [];
    const textParts: string[] = [];
    if (hasMedia) {
      const media = await processInboundMedia(
        mediaItems,
        { supabase, userId: chatbot.user_id },
        { describeImages: !synchronous }
      );
      images = media.images;
      textParts.push(...media.textParts);
      // Backfill the inbound row: readable content + durable media pointer.
      if (inboundId) {
        await supabase
          .from("messages")
          .update({
            content: composeUserMessage({ text: baseText, textParts }),
            media_url: media.stored[0]?.url ?? null,
            media_type: media.stored[0]?.type ?? null,
          })
          .eq("id", inboundId);
      }
      // Observability: how many attachments came in (free-text event_type).
      await supabase
        .from("usage_log")
        .insert({
          user_id: chatbot.user_id,
          chatbot_id: chatbot.id,
          event_type: "media_in",
          tokens_used: mediaItems.length,
        })
        .then(
          () => {},
          () => {}
        );
    }
    // The text the AI reasons over: typed text + transcripts/doc text/notes.
    let effectiveMessage = composeUserMessage({ text: baseText, textParts });

    // 6f. Debounce (burst mode): sleep out the quiet period, then only proceed
    // if this run's claim survived - every newer message OVERWRITES the claim,
    // so its run takes over and answers the whole burst instead. That's the
    // "timer resets while they keep typing" behavior. Media processing above
    // already backfilled this row, so a superseded run still leaves its
    // transcript for the surviving run to fold in.
    let memorySummary: string | null = existing?.memory_summary ?? null;
    let confirmedAt: string | null = existing?.confirmed_at ?? null;
    // Read through LOCALS, not `existing`, for everything the prompt consumes: the
    // run-start snapshot predates the debounce sleep, during which the PREVIOUS turn's
    // background extractors land. Injecting the pre-sleep snapshot is what makes the
    // bot re-ask a question the last turn already recorded as answered.
    let knownFacts: string | null = existing?.known_facts ?? null;
    let flowState: string | null = existing?.flow_state ?? null;
    let flowStateAt: string | null = existing?.flow_state_at ?? null;
    if (mode === "burst") {
      // Per-chatbot wait window (chatbots.reply_debounce_seconds, default 60s),
      // clamped 0..120. A MISSING column (pre-migration) reads as undefined →
      // fall back to REPLY_DEBOUNCE_MS via the default arg (fail-open, no wait
      // regression). The claim overwrite already makes this window resettable.
      const perBot = chatbot.reply_debounce_seconds;
      const overrideMs =
        typeof perBot === "number" && Number.isFinite(perBot)
          ? clampDebounceSeconds(perBot) * 1000
          : undefined;
      const waitMs = remainingDebounceMs(performance.now() - startedAt, overrideMs);
      if (waitMs > 0) await sleep(waitMs);
      // known_facts is unconditional (it had the same staleness bug memory_summary was
      // already fixed for). flow_state is conditional: this select also gates supersede
      // detection, so turning the flag on BEFORE the migration must not be able to
      // error it. Migration first, flag second. The columns are built as a runtime
      // string, so the row shape is declared explicitly rather than inferred.
      const freshCols = flowStateEnabled(chatbot.id)
        ? "status, user_muted_at, reply_claimed_for, memory_summary, confirmed_at, known_facts, flow_state, flow_state_at"
        : "status, user_muted_at, reply_claimed_for, memory_summary, confirmed_at, known_facts";
      const { data: fresh } = await supabase
        .from("conversations")
        .select(freshCols)
        .eq("id", conversationId!)
        .maybeSingle()
        .returns<{
          status: string | null;
          user_muted_at: string | null;
          reply_claimed_for: string | null;
          memory_summary: string | null;
          confirmed_at: string | null;
          known_facts: string | null;
          // Absent from the row whenever the flag is off (see freshCols above).
          flow_state?: string | null;
          flow_state_at?: string | null;
        } | null>();
      // Human takeover OR a self-service stop during the sleep → stand down and
      // release our claim (don't answer the burst after the lead muted).
      if (shouldStandDown(fresh)) {
        await releaseClaim();
        return null;
      }
      // Superseded: a newer message claimed the reply while we slept. (A null
      // `fresh` - transient fetch error - falls through: fail-open to a reply.)
      if (fresh && fresh.reply_claimed_for !== inboundId) return null;
      memorySummary = fresh?.memory_summary ?? memorySummary;
      confirmedAt = fresh?.confirmed_at ?? confirmedAt;
      knownFacts = fresh?.known_facts ?? knownFacts;
      flowState = fresh?.flow_state ?? flowState;
      flowStateAt = fresh?.flow_state_at ?? flowStateAt;
    }

    // 7. Fetch recent history. Order desc + limit so we get the newest
    // HISTORY_TURNS prior + the just-inserted user message, not the oldest.
    // Context older than this window is carried by the rolling memory summary.
    const { data: history } = await supabase
      .from("messages")
      // created_at + media_url are for the flow-state Layer A computation below;
      // splitBurst/combineBurstText read only id/role/content, so they are inert here.
      .select("id, role, content, created_at, media_url")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS + 1)
      .returns<Pick<Message, "id" | "role" | "content" | "created_at" | "media_url">[]>();

    let priorHistory: Pick<Message, "id" | "role" | "content" | "created_at" | "media_url">[];
    if (mode === "burst") {
      // The leading run of unanswered user rows (this message + any that piled
      // up around it, including rate-limited ones that never got their own run)
      // is THIS reply's subject; everything older is prior context.
      const { burst, prior } = splitBurst(history ?? []);
      if (!burst.length) {
        // A human agent or a canned path answered everything during the sleep.
        await releaseClaim();
        return null;
      }
      priorHistory = prior;
      // One consolidated user turn for the whole burst. This run's own row uses
      // the in-memory text (fresher if its media backfill failed); earlier rows
      // contribute their stored content - transcripts/doc text if their runs
      // finished backfilling, else the provisional attachment label. Vision
      // image parts stay this-run-only (known limitation for burst images).
      effectiveMessage = combineBurstText(burst, inboundId, effectiveMessage);
    } else {
      // Desc order: [0] is the just-inserted user msg. Drop it, reverse to chrono.
      priorHistory = (history ?? []).slice(1).reverse();
    }

    // 7b. Disqualify screen (best-effort, PRE-reply). If the lead is abusive, has
    // clearly rejected the service, or is itself a bot, go silent on THIS message:
    // write the tag and stop before generating/pushing anything (also skips the
    // step-9a classifier, since we return before it). Runs before KB/reply so a
    // disqualified turn does no extra work. Same gate conditions as auto-tagging.
    // Fail-open: screenDisqualify swallows errors -> 'none' -> a normal reply, so
    // an API blip never wrongly silences a lead.
    if (AUTO_TAG_ENABLED && !confirmedAt && canPushPlatform(platform)) {
      const lastBotMessage =
        [...priorHistory].reverse().find((m) => m.role === "assistant")?.content ?? "";
      let { outcome } = await screenDisqualify({ message: effectiveMessage, lastBotMessage });
      // A `bot` (automated-sender) verdict only makes sense at first contact. Once the
      // assistant has had genuine back-and-forth with this person (a prior assistant
      // reply exists), they are a human, not a spam bot - so a late `bot` flag is almost
      // always a false positive (e.g. they shared their website or re-sent a message
      // after getting no reply). Downgrade it to none. `disqualified` (abuse / clear
      // rejection) and `spam` (a promotional/scam-advertisement blast, e.g. a crypto-
      // casino "claim your bonus" screenshot) CAN legitimately arrive mid-conversation,
      // so they are deliberately NOT downgraded here - only the `bot` automation verdict is.
      if (outcome === "bot" && lastBotMessage) {
        console.warn("[manychat-webhook] suppressed late 'bot' screen verdict for an engaged lead", { conversationId });
        outcome = "none";
      }

      // Two-strike backstop for the TERMINAL `disqualified` tag. A false disqualify
      // silences a good lead forever, and the one-word screen model can misfire on an
      // ENGAGED lead venting or describing a past failure ("I've tried before, no
      // success"). So an engaged lead's FIRST disqualify signal is a soft strike (no
      // tag, keep replying); only a SECOND consecutive one silences. First-contact
      // abuse/rejection and `bot` still stop immediately. Pre-migration (no
      // disqualify_strikes column) → immediate silence, identical to before, so this
      // is safe to deploy before the migration lands (decideDisqualify).
      const engaged = Boolean(lastBotMessage);
      const priorStrikes =
        typeof existing?.disqualify_strikes === "number" ? existing.disqualify_strikes : undefined;
      const action = decideDisqualify({ outcome, engaged, strikes: priorStrikes });

      if (action.kind === "clear") {
        // The lead re-engaged after an earlier lone strike - forgive it (best-effort;
        // a missing column just no-ops). Strikes must be CONSECUTIVE to silence.
        await supabase
          .from("conversations")
          .update({ disqualify_strikes: 0 })
          .eq("id", conversationId!)
          .is("confirmed_at", null)
          .then(() => {}, () => {});
      } else if (action.kind === "soft") {
        // Engaged lead's 1st disqualify signal: DO NOT tag, DO NOT stand down - one
        // model misfire must never be terminal. Record the strike (best-effort) and
        // reply as normal; a 2nd consecutive signal silences. Drip left running, not
        // mirrored to ManyChat - the thread is still a live lead.
        console.warn("[manychat-webhook] soft disqualify (engaged lead, strike 1) - replying anyway", { conversationId });
        await supabase
          .from("conversations")
          .update({ disqualify_strikes: action.strikes })
          .eq("id", conversationId!)
          .is("confirmed_at", null)
          .then(() => {}, () => {});
      } else if (action.kind === "silence") {
        const { error: tagErr } = await supabase
          .from("conversations")
          .update({ tag: action.tag, start_on: null, start_note: null })
          .eq("id", conversationId!)
          .is("confirmed_at", null); // never overwrite a just-confirmed customer
        if (tagErr) {
          // Surface a rejected write (e.g. the 2026-07-14 migration not yet applied,
          // so the tag CHECK rejects disqualified/bot) instead of silently no-opping -
          // otherwise the bot keeps replying to abuse with nothing in the logs (gotcha #15).
          console.error("[manychat-webhook] disqualify tag write failed", tagErr);
        }
        // Disqualified/bot blocks follow-ups regardless (drip unchanged) - mirror to
        // ManyChat (already in the after() background window, so await it; never throws).
        await syncNoFollowupFlag(supabase, conversationId!);
        if (!keepRepliesWhenTagged) {
          await releaseClaim(); // mirror the stand-down path (single-flight CAS release)
          return null; // no reply pushed; the step-9a classifier is never reached
        }
        // keep_replies_when_tagged: thread is tagged (visibility) + drip blocked,
        // but we DO NOT stand down - fall through and reply as normal.
      }
    }

    // 7a. Follow-up media library - only when the bot may send AI-triggered media.
    // Fetched once here so the same list feeds the system-prompt catalog AND the
    // directive resolution below.
    const assetLib = chatbot.ai_media_enabled
      ? await fetchFollowupAssets(supabase, chatbot.id)
      : [];
    const mediaCatalog = assetLib.length ? buildAssetCatalogBlock(assetLib) : "";

    // 8. Resolve KB (adaptive: full-context or vector retrieval) then generate.
    const kb = await buildKbBlock({
      supabase,
      chatbot,
      history: priorHistory,
      userMessage: effectiveMessage,
    });

    // 8b. Flow state (the question ledger). Layer A is pure and computed from the
    // persisted transcript on THIS turn, so it can never be stale: the exact question
    // the bot last sent, and how many of its last 3 messages carried it. Layer B (the
    // stored ledger) is one turn behind by construction and says so in its own header.
    // renderFlowStateBlock returns "" when the feature is off for this bot, so every
    // line below is inert until the flag is set.
    const assistantTexts = priorHistory
      .filter((m) => m.role !== "user" && !m.media_url)
      .map((m) => m.content)
      .reverse(); // newest first
    const lastQuestion = assistantTexts[0] ? extractLastQuestion(assistantTexts[0]) : null;
    const askCount = lastQuestion ? countRecentAsks(assistantTexts.slice(0, 3), lastQuestion) : 0;
    // Counted over the WHOLE window, not priorHistory: the message being answered is
    // itself newer than the stored ledger, and leaving it out would under-report the
    // block's age by one. countStaleTurns owns the row filter so this count and
    // refreshFlowState's fold window stay the same set of rows (outbound asset rows
    // are in neither - they are written after the assistant text row in step 9, so
    // counting them aged the ledger past FLOW_STATE_MAX_STALE_TURNS on the very turn
    // it was written).
    const staleTurns = countStaleTurns(history ?? [], flowStateAt);
    const flowStateBlock = renderFlowStateBlock({
      chatbotId: chatbot.id,
      stored: flowState,
      staleTurns,
      lastQuestion,
      askCount,
    });

    let replyText = "Thanks for the message, a teammate will follow up shortly.";
    let tokens = 0;
    try {
      const { text, tokensUsed } = await generateReply({
        chatbot,
        kbBlock: kb.block,
        history: priorHistory,
        userMessage: effectiveMessage,
        images,
        memorySummary,
        mediaCatalog,
        // Security reinforcement outranks a keyword steer when both fire on
        // the same turn (single channel; the keyword steer is sacrificed for
        // that one flagged reply only).
        turnInstruction: securityInstruction || keywordInstruction,
        // Remember a deferred start date the lead named (starting_later), so the
        // bot references it and doesn't re-pitch. Run-start snapshot is fine.
        scheduledStart:
          existing?.start_note || existing?.start_on
            ? { note: existing.start_note ?? null, on: existing.start_on ?? null }
            : null,
        // Owner-trained scenario corrections (Bot Trainer). chatbot is select("*").
        trainedResponses: renderTrainedResponses(chatbot.training_pairs),
        // Durable "already told you" facts so the bot never re-asks the lead's
        // score/goals/etc. Read from the post-debounce local, not the run-start
        // snapshot, so a refresh that landed during our own sleep is honoured.
        knownFacts,
        // Which questions this bot has already asked and what is still owed.
        flowStateBlock,
        // Retry a transient provider blip (429 / 5xx overload / request timeout)
        // before falling back to the canned "a teammate will follow up" line below:
        // 2 extra tries on the background push path (300s maxDuration), 1 on the
        // synchronous response path - whose tighter 8s per-attempt timeout keeps both
        // tries inside ManyChat's ~10s window. A permanent 4xx/quota error still fails
        // fast to the fallback (see isTransientOpenAIError).
        retries: synchronous ? 1 : 2,
        timeoutMs: synchronous ? 8_000 : undefined,
      });
      if (text) {
        replyText = text;
        tokens = tokensUsed;
      }
    } catch (err) {
      console.error("[manychat-webhook] AI error", err);
    }

    // 8a. AI media + link-via-ManyChat, in ONE ordered pass. Both the [[SEND_ASSET: key]]
    // media directives and the link-flow token(s) are detected against the SAME reply text
    // so each lands at the position the model wrote it - a photo/link interleaved with the
    // text, not batched at the end. planLinkFlow strips both from `cleanText` and returns an
    // ordered `deliver` plan (text | flow | media). Media detection runs only when the bot
    // has AI media enabled; otherwise directives are left untouched, exactly as before. The
    // link path is a no-op unless link_flow_enabled. Tokens/directives are always stripped
    // so none leaks to the lead; on response channels the flow can't fire but is stripped.
    const mediaMatches = chatbot.ai_media_enabled ? findAssetDirectives(replyText) : [];
    const linkPlan = planLinkFlow({ replyText, chatbot, platform, mediaMatches });
    replyText = linkPlan.cleanText;

    // Resolve each first-seen media key (the plan already de-duplicated them and kept text
    // order) to a sendable library asset, capped per reply so one turn can't spam the whole
    // library. The cap default allows a full "numbered set" (name_1..name_N, which the model
    // is told to send together) without truncating it mid-set; raise MAX_AI_ASSETS via env
    // only if a bot registers larger sets. Two invisible-failure guards are preserved: a
    // warn when the cap drops keys, and a warn when a key resolves to nothing (the single
    // most common cause of "the bot isn't sending its images" - see the numbered-key gotcha,
    // where bulk upload names files name_1/name_2 so a prompt against the bare `name` matches
    // nothing). resolvedAssets is looked up by the delivery block at each media step.
    const MAX_AI_ASSETS = Math.max(1, Math.min(10, Number(process.env.MAX_AI_ASSETS) || 6));
    const mediaKeys = linkPlan.deliver.flatMap((s) => (s.kind === "media" ? [s.key] : []));
    const resolvedAssets: Record<string, OutboundAsset> = {};
    const assetRows: { content: string; media_url: string; media_type: string | null }[] = [];
    if (mediaKeys.length > MAX_AI_ASSETS) {
      console.warn(
        "[manychat-webhook] asset cap hit - dropping keys",
        mediaKeys.slice(MAX_AI_ASSETS),
        `(cap=${MAX_AI_ASSETS}, set MAX_AI_ASSETS to raise)`
      );
    }
    for (const key of mediaKeys.slice(0, MAX_AI_ASSETS)) {
      const asset = resolveAssetByKey(assetLib, key);
      if (!asset?.url) {
        console.warn(
          "[manychat-webhook] SEND_ASSET key not found in library",
          key,
          `(chatbot=${chatbot.id})`
        );
        continue;
      }
      resolvedAssets[key] = { kind: asset.kind, url: asset.url };
      // media_type stays a real MIME (or null) - the inbox renderer matches on
      // startsWith("image/"|"audio/"|"video/").
      assetRows.push({
        content: `(sent ${asset.kind}: ${asset.key})`,
        media_url: asset.url,
        media_type: asset.mime ?? null,
      });
    }

    // 8b. Single-flight release (burst mode): atomically clear our claim. Zero
    // rows updated means a newer message claimed while we were generating -
    // discard this reply WITHOUT persisting or sending; the newer run's burst
    // covers everything, so the lead gets one consolidated answer instead of
    // two overlapping ones. The occasional wasted generation is the price of
    // never double-replying. (A transient release error falls through to a
    // send - worst case matches today's per-message behavior.)
    if (mode === "burst" && inboundId) {
      const { data: released, error: releaseError } = await supabase
        .from("conversations")
        .update({ reply_claimed_for: null })
        .eq("id", conversationId!)
        .eq("reply_claimed_for", inboundId)
        .select("id");
      if (releaseError) {
        console.error("[manychat-webhook] claim release failed", releaseError);
      } else if (!released?.length) {
        return null; // superseded mid-generate
      }
    }

    // 8c. Final mute/pause re-check (ALL modes). The burst guard above only
    // covers burst runs and only catches a mute set DURING the debounce sleep;
    // a stop that lands while the AI is generating - or ANY mute in single /
    // response mode, which skip the burst guards - would otherwise still push.
    // Re-read right before persisting and stand down if the lead muted or the
    // owner took over. Retry once on a null fetch, then fail-open (never drop a
    // legitimate reply on a transient blip).
    {
      let recheck = (
        await supabase
          .from("conversations")
          .select("status, user_muted_at")
          .eq("id", conversationId!)
          .maybeSingle()
      ).data;
      if (!recheck) {
        recheck = (
          await supabase
            .from("conversations")
            .select("status, user_muted_at")
            .eq("id", conversationId!)
            .maybeSingle()
        ).data;
      }
      if (shouldStandDown(recheck)) {
        await releaseClaim();
        return null;
      }
      if (!recheck) {
        console.warn(
          "[manychat-webhook] pre-push mute re-check fetch failed; proceeding (fail-open)"
        );
      }
    }

    // 9. Persist outbound + usage. The text row is inserted BEFORE the asset rows
    // so inbox chronology matches delivery order (text bubbles, then media).
    console.log(
      `[manychat-webhook] kb mode=${kb.mode} chunks=${kb.chunks} topSim=${kb.topSimilarity ?? "-"} bot=${chatbot.id} platform=${platform}`
    );
    if (replyText) {
      await supabase.from("messages").insert({
        conversation_id: conversationId!,
        role: "assistant",
        content: replyText,
        ai_generated: true,
        tokens_used: tokens,
      });
    }
    for (const row of assetRows) {
      await supabase.from("messages").insert({
        conversation_id: conversationId!,
        role: "assistant",
        ai_generated: true,
        tokens_used: 0,
        ...row,
      });
    }
    // Each fired link flow leaves a marker row. The token is stripped from the stored
    // text above, so without this the model's history shows "use this link" with no
    // link attached and it re-sends on the next nudge (live double-link, 2026-08-20).
    for (const f of linkPlan.fired) {
      await supabase.from("messages").insert({
        conversation_id: conversationId!,
        role: "assistant",
        content: linkSentMarker(f.name),
        ai_generated: true,
        tokens_used: 0,
      });
    }
    await Promise.all([
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
    // A media-only reply has no text to echo - skip the cache (the dedup gate then
    // falls back to its canned ack for an instant repeat, which is acceptable).
    await Promise.all([
      replyText
        ? cacheLastReply(chatbot.id, body.subscriber_id, replyText)
        : Promise.resolve(),
      incrementMonthlyCount(chatbot.id),
    ]);

    // 9a. Auto-tag (best-effort): classify the thread into lead/wants_call/
    // starting_later/needs_human/subscribed. `subscribed` stamps confirmed_at (stops
    // the drip AND, via gate 6-subscribed, silences the bot next message);
    // `starting_later` records the start date + note (pauses the drip via
    // evaluateFollowup - AI replies stay on). Push channels only (background - no
    // latency on a synchronous response-channel reply), only while not already
    // confirmed (a confirmed thread is silenced upstream). Never blocks.
    let tagWork: Promise<void> | undefined;
    if (AUTO_TAG_ENABLED && !confirmedAt && canPushPlatform(platform)) {
      const userMessage = effectiveMessage;
      // A media-only reply has no text; give the classifier a stand-in so a
      // "just paid!" answered with media still gets detected.
      const botReply =
        replyText ||
        (Object.keys(resolvedAssets).length
          ? "(sent media)"
          : linkPlan.fireFlowNs.length
            ? "(sent link)"
            : "");
      const today = new Date().toISOString().slice(0, 10); // UTC; lets the model resolve "Wednesday"
      // KICK OFF but don't await here - the classify OpenAI round-trip is a pure
      // side-effect (writes tag/confirmed_at/start_*) not needed to build or deliver
      // the reply. The caller awaits `tagWork` AFTER the push, so tagging runs
      // concurrently with delivery instead of delaying the first bubble, yet still
      // finishes inside the after() window (a bare fire-and-forget could be dropped
      // when the serverless instance freezes). Never throws.
      tagWork = (async () => {
        try {
          const { tag, startOn, startNote } = await classifyConversation({ userMessage, botReply, today });
          if (tag === "subscribed") {
            await supabase
              .from("conversations")
              .update({
                confirmed_at: new Date().toISOString(),
                confirmed_by: "ai",
                tag: "subscribed",
                start_on: null,
                start_note: null, // they started - clear any scheduled-start
              })
              .eq("id", conversationId!)
              .is("confirmed_at", null);
            // Subscribed blocks follow-ups. Sync only if the run-start state wasn't
            // already blocked (avoids a redundant ManyChat call every confirmed turn).
            if (!followupBlocked(existing ?? {})) {
              await syncNoFollowupFlag(supabase, conversationId!);
            }
          } else {
            // Sticky/precedence write against a run-start snapshot; the DB guards do
            // the real protection against a concurrent manual change landing mid-turn:
            // `.is(confirmed_at, null)` never clobbers a just-confirmed customer, and a
            // `.neq(tag, t)` for every STICKIER tag never auto-clears a needs_human /
            // starting_later set concurrently. resolveTagWrite applies the same rules
            // to the snapshot.
            const next = resolveTagWrite((existing?.tag as ConversationTag) ?? "lead", tag);
            // Write when the tag changes, or to refresh a new start date on an
            // already-starting_later thread ("actually make it Friday").
            const startChanged = next === "starting_later" && (startOn !== null || startNote !== null);
            if (next !== existing?.tag || startChanged) {
              const payload: Record<string, unknown> = { tag: next };
              if (next === "starting_later") {
                // Only overwrite the date when the classifier produced one (don't
                // clobber an existing date with nulls on a plain re-tag).
                if (startOn !== null) payload.start_on = startOn;
                if (startNote !== null) payload.start_note = startNote;
              } else {
                // Moving off starting_later (only needs_human can, via rank) - clear the
                // scheduled-start so the badge/AI don't reference a stale date. Keeps the
                // invariant: start fields set ⇔ tag = starting_later.
                payload.start_on = null;
                payload.start_note = null;
              }
              let upd = supabase
                .from("conversations")
                .update(payload)
                .eq("id", conversationId!)
                .is("confirmed_at", null);
              for (const t of CONVERSATION_TAGS) {
                if (t !== "subscribed" && TAG_RANK[t] > TAG_RANK[next]) upd = upd.neq("tag", t);
              }
              await upd;
              // Mirror to ManyChat only when the new tag actually flips the
              // stop-follow-up verdict (e.g. lead→starting_later).
              const blockedBefore = followupBlocked(existing ?? {});
              const blockedAfter = followupBlocked({ ...(existing ?? {}), tag: next });
              if (blockedBefore !== blockedAfter) {
                await syncNoFollowupFlag(supabase, conversationId!);
              }
            }
          }
        } catch (err) {
          console.error("[manychat-webhook] classify failed", err);
        }
      })();
    }

    return { text: replyText, deliver: linkPlan.deliver, resolvedAssets, tagWork };
  };

  // 10. Deliver. Two paths depending on whether the channel has a ManyChat send API:
  if (canPushPlatform(platform) && apiKey) {
    // Single-flight claim: mark THIS message as the one the conversation's next
    // reply answers. Newer messages overwrite the claim (their run takes over -
    // the debounce "timer reset"); the background run below only proceeds if its
    // claim survived the sleep. Fail-open: on any error (e.g. the migration not
    // yet applied) fall back to per-message replies exactly as before.
    let claimed = false;
    if (inboundId) {
      const { error: claimError } = await supabase
        .from("conversations")
        .update({ reply_claimed_for: inboundId })
        .eq("id", conversationId!);
      if (claimError) {
        console.error("[manychat-webhook] reply claim failed", claimError);
      } else {
        claimed = true;
      }
    }

    // PUSH channels (Instagram/Messenger/WhatsApp/Telegram): generate + push in
    // the background and ack instantly so ManyChat's ~10s External Request timeout
    // never trips. Delivery is via the Send Content API on the right channel.
    after(async () => {
      try {
        const result = await generateAndPersistReply(claimed ? "burst" : "single");
        if (!result) return; // stood down - a newer run owns the consolidated reply
        // Kick the state refreshes NOW so they overlap the paced trickle instead of
        // queueing behind it. Pacing is budgeted to 280s of a 300s maxDuration
        // (BUBBLE_PACING_BUDGET_MS / PACING_DEADLINE_MS in lib/manychat.ts), so a job
        // appended after the push is the platform's first casualty on exactly the long
        // multi-bubble conversations these layers exist for. None of them depend on
        // delivery - the assistant row is already persisted. allSettled so one
        // rejection can't skip the other two.
        const stateJobs = Promise.allSettled([
          refreshConversationMemory({ supabase, conversationId: conversationId! }),
          refreshKnownFacts({ supabase, conversationId: conversationId! }),
          refreshFlowState({ supabase, conversationId: conversationId!, chatbotId: chatbot.id }),
        ]);
        const { deliver, resolvedAssets } = result;
        // Per-chatbot: render Messenger links as tappable URL buttons (default off).
        const linkButtons = chatbot.link_buttons_enabled === true;
        // Build ONE ordered delivery sequence: each text segment expands to its bubbles,
        // and each link flow AND each media asset sits at its authored position in the reply.
        // Walked in order so a link/photo lands exactly where the model wrote its token/
        // directive (not after all text) and is fully delivered before the next item.
        // planDeliveryBubbles splits each text segment into bubbles (whole-reply MAX_BUBBLES
        // spam-flag bound preserved across segments) and keeps flow/media steps in place;
        // buildPacedItems resolves each media step's key to its asset (unresolved/over-cap
        // keys are absent from resolvedAssets, so they collapse into the surrounding text)
        // and coalesces consecutive media into one send so a "numbered set" still lands in a
        // single ManyChat message.
        const items: PacedItem[] = buildPacedItems(planDeliveryBubbles(deliver), resolvedAssets);
        try {
          if (items.length > 0) {
            // Paced even for a single item: a human-like typing delay before the reply
            // lands, then a length-scaled trickle for the rest (a flow/media item waits the
            // follow-on floor). Because the trickle can span minutes, re-check before each
            // follow-on item - bubble, flow, OR media - whether the lead muted / the owner
            // took over / a newer run superseded this one, and stop the rest if so (mirrors
            // the pre-push re-check at 8c). Read-once, retry-once on null, fail-open.
            // pace=false (pacing disabled) still delivers in order with no gaps.
            const shouldAbort = async (): Promise<boolean> => {
              const read = async () =>
                (
                  await supabase
                    .from("conversations")
                    .select("status, user_muted_at, reply_claimed_for")
                    .eq("id", conversationId!)
                    .maybeSingle()
                ).data;
              let fresh = await read();
              if (!fresh) fresh = await read();
              if (!fresh) return false; // transient blip → keep sending (fail-open)
              if (shouldStandDown(fresh)) return true; // lead muted or owner took over
              // Superseded: this run released its own claim before pacing, so a
              // non-null token that isn't ours means a newer inbound now owns the reply.
              if (fresh.reply_claimed_for && fresh.reply_claimed_for !== inboundId) {
                return true;
              }
              return false;
            };
            await sendManychatSequencePaced({
              subscriberId: body.subscriber_id,
              items,
              startedAt,
              apiKey,
              platform,
              linkButtons,
              pace: pacingEnabled(),
              shouldAbort,
            });
          }
        } catch (err) {
          console.error("[manychat-webhook] push send failed", err);
          await logPushFailure(supabase, chatbot.user_id, chatbot.id);
        }
        // Auto-tag ran concurrently with the push (kicked off in step 9a); await it
        // here so the tag/confirm write completes within the after() window. Never throws.
        if (result.tagWork) await result.tagWork;
        // Collect the state refreshes kicked off above (rolling memory summary, known
        // facts, question ledger) so they complete inside the after() window. All three
        // are best-effort and never throw, so the bot doesn't re-ask what's now recorded.
        await stateJobs;
      } catch (err) {
        // after() runs detached - swallow so nothing crashes the background task.
        console.error("[manychat-webhook] background processing failed", err);
      }
    });
    return manychatReply("", { ai_queued: true });
  }

  // RESPONSE channels (TikTok - no ManyChat send API yet) OR no API key: ManyChat
  // can't be pushed to, so generate synchronously and RETURN the reply in the body
  // for the client's flow to deliver (map `reply`/render the dynamic content). This
  // shares the ~10s timeout risk we avoid for push channels, but TikTok replies are
  // short. Auto-upgrades to the push path once PLATFORM_META gives the channel a
  // sendContent type (canPush=true).
  // Media assets can't be pushed on response channels (no send API), so only the
  // text is returned here; AI media is a push-channel feature.
  let replyText = "Thanks for the message, a teammate will follow up shortly.";
  try {
    // On a normal response (non-push) channel the pre-reply disqualify screen is
    // skipped (it's gated by canPushPlatform). It could still evaluate on the rare
    // misconfig where a push-capable platform reaches this path with no API key -
    // but a null (stood-down) result just falls back to the default replyText
    // below, so this path never wrongly silences a lead.
    const result = await generateAndPersistReply("single", true);
    if (result) replyText = result.text;
  } catch (err) {
    console.error("[manychat-webhook] sync processing failed", err);
  }
  // Refresh the rolling memory summary + known-facts list in the background (don't
  // block the reply).
  after(async () => {
    await Promise.allSettled([
      refreshConversationMemory({ supabase, conversationId: conversationId! }),
      refreshKnownFacts({ supabase, conversationId: conversationId! }),
      refreshFlowState({ supabase, conversationId: conversationId!, chatbotId: chatbot.id }),
    ]);
  });
  return manychatReply(replyText, { ai_delivery: "response", platform });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "manychat-webhook" });
}
