import { NextResponse, type NextRequest, unstable_after as after } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  verifyManychatSecret,
  sendManychatMessage,
  sendManychatMessagePaced,
  sendManychatMedia,
  pacingEnabled,
  resolveManychatApiKey,
  ManychatKeyError,
  type OutboundAsset,
} from "@/lib/manychat";
import { generateReply } from "@/lib/anthropic";
import { splitIntoMessages } from "@/lib/message-split";
import { buildKbBlock } from "@/lib/retrieval";
import { parseAssetDirectives } from "@/lib/ai-media";
import {
  fetchFollowupAssets,
  resolveAssetByKey,
  assetToOutbound,
  buildAssetCatalogBlock,
} from "@/lib/followup-assets";
import { firstMatchingGroup, keywordGateBlocks } from "@/lib/keyword-triggers";
import {
  detectExtractionAttempt,
  pickDeflection,
  EXTRACTION_REINFORCEMENT,
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
import { detectLeadConfirmed } from "@/lib/confirm-detect";
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
import { splitBurst, combineBurstText, remainingDebounceMs } from "@/lib/debounce";
import type { Chatbot, Message } from "@/lib/types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
});

/** Truthy check for the RN opt-in flag (accepts "true"/"1"/1/true). */
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
  const bubbles = text ? splitIntoMessages(text) : [];
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
 * Helper for canned-reply paths (rate-limit-passed gates that bypass the AI):
 * persists the outbound message in the conversation and pushes via ManyChat.
 * Each side is independent — a ManyChat failure doesn't lose the DB row.
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
  await Promise.all([
    supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: text,
      ai_generated: false,
      tokens_used: 0,
    }),
    push
      ? sendManychatMessage({ subscriberId, text, apiKey, platform }).catch(async (err) => {
          console.error("[manychat-webhook] push send failed", err);
          await logPushFailure(supabase, userId, chatbotId);
        })
      : Promise.resolve(),
  ]);
}

/**
 * Canned keyword-trigger reply: persists the outbound text (+ an optional saved
 * asset) and delivers it — like persistAndPush but with media support. The asset
 * is OWNER-configured, so it sends regardless of chatbot.ai_media_enabled (that
 * flag only governs AI-emitted [[SEND_ASSET]] directives). Push only on channels
 * with a send API; on response channels (TikTok) the caller returns the text in
 * the body and media is skipped (no send API there). Each side is independent —
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
  platform: Platform
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
  if (text) {
    await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: "assistant", content: text, ai_generated: false, tokens_used: 0 })
      .then(() => {}, () => {});
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
        await sendManychatMedia({ subscriberId, assets: [asset], text, apiKey, platform });
      } else if (text) {
        await sendManychatMessage({ subscriberId, text, apiKey, platform });
      }
    } catch (err) {
      console.error("[manychat-webhook] keyword push send failed", err);
      await logPushFailure(supabase, userId, chatbotId);
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
    .select("status")
    .eq("user_id", chatbot.user_id)
    .maybeSingle();

  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return manychatReply(
      "Thanks for your message! We'll get back to you shortly.",
      { ai_skipped: true, reason: "subscription_inactive" }
    );
  }

  // 3b. Resolve the ManyChat API key for this chatbot (decrypt the per-chatbot
  // key, or fall back to the global env key for un-migrated owners). A decrypt
  // failure is a HARD error — we NEVER fall back to the env key, which would push
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
  // no reply, no unread bump — a ManyChat re-delivery leaves zero trace, and a
  // rapid re-tap folds into the in-flight run's debounce burst (the first tap's
  // run answers once). Skipped when media is attached (two different photos can
  // share empty/identical text). Control words (stopmessage/resumemessage) are
  // ALSO exempt: they toggle state, so a stop→resume→stop within 30s must not
  // have the 3rd command swallowed as a "duplicate" and leave the lead in the
  // wrong state. Trade-off: a deliberate identical re-send within 30s won't
  // appear in the owner's inbox — the reply would be the same.
  if (!hasMedia && baseText && !detectUserControl(baseText)) {
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

  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("chatbot_id", chatbot.id)
    .eq("manychat_subscriber_id", body.subscriber_id)
    .maybeSingle();

  let conversationId = existing?.id;
  let conversationStatus = existing?.status;

  if (!existing) {
    // Upsert, not insert: two simultaneous FIRST messages from one new
    // subscriber both pass the SELECT above with no row, and a plain INSERT
    // makes the loser violate unique(chatbot_id, manychat_subscriber_id) and
    // 500 with no reply. On conflict the loser merge-updates the winner's row
    // and gets back its real id/status. `status` is deliberately omitted:
    // the schema default covers fresh inserts, and a conflict-update must not
    // un-pause an ai_paused conversation (human takeover).
    const { data: created, error: convError } = await supabase
      .from("conversations")
      .upsert(
        {
          chatbot_id: chatbot.id,
          user_id: chatbot.user_id,
          manychat_subscriber_id: body.subscriber_id,
          platform,
          contact_name: displayName,
          contact_username: username,
        },
        { onConflict: "chatbot_id,manychat_subscriber_id" }
      )
      .select("id, status")
      .single();
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
  } else {
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: (existing.unread_count ?? 0) + 1,
        // Heal old rows too: replace a stored placeholder/empty with a real value.
        contact_name: cleanContactField(existing.contact_name) ?? displayName,
        contact_username: cleanContactField(existing.contact_username) ?? username,
        // The contact replied — re-arm the auto follow-up drip from step 1 for
        // the next silence (a reply reopens the 24h window).
        followup_count: 0,
        followup_step_index: 0,
        last_followup_at: null,
      })
      .eq("id", existing.id);
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

  // 4.5. Nothing to act on (no text and no media): ack without a reply.
  if (!baseText && !hasMedia) {
    return manychatReply("", { ai_skipped: true, reason: "empty_message" });
  }

  // 5. Record inbound message. For media we store a provisional label now and
  // backfill the readable content + durable media pointer after processing
  // (which runs in the background to keep the fast-ack quick).
  const provisionalContent = baseText || "📎 Attachment…";
  const { data: inboundMsg } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId!,
      role: "user",
      content: provisionalContent,
    })
    .select("id")
    .single();
  const inboundId = inboundMsg?.id as string | undefined;

  // 6. If human took over, do not generate AI reply
  if (conversationStatus === "ai_paused") {
    return manychatReply("", { ai_skipped: true, reason: "human_takeover" });
  }

  // 6-gate. Keyword-only reply mode — the OUTERMOST filter for a gated bot (only
  // human-takeover above it). When ON, the bot only engages contacts who have
  // shown intent via a keyword (personal/private accounts that don't want the AI
  // replying to unrelated people). The keyword is an ENTRY qualifier, not a
  // per-message filter: a contact unlocks the bot by matching a keyword once
  // (recorded on keyword_fired at 6c) and is then a possible lead, so every later
  // message — keyword or not — falls through and gets answered, so the bot can
  // carry the conversation it started ("repair or funding?" → the lead's plain
  // answer still gets a reply). A contact who has NEVER matched a keyword stays
  // silent. Deliberately placed ABOVE 6-mute/6a/6b/6c: a gated stranger must get
  // NO automatic reply of ANY kind — not a stop/resume confirmation, not the
  // trivial ack, not the extraction deflection, not the AI. (If the gate sat below
  // 6-mute, a stranger typing "stopmessage" would get an "I'll hold off" bubble —
  // an auto-reply to a non-lead, which is exactly what this feature forbids.)
  // `keywordGroup` is computed here and reused by 6c. baseText only: a media-only
  // DM matches nothing → still gated for a never-engaged contact (an engaged lead
  // falls through). Fail-open: a missing column reads as false (gate off). The
  // inbound is already persisted (step 5) + unread-bumped, so the owner still SEES
  // a gated message in the inbox to answer manually — only the AUTO reply is
  // withheld, like human-takeover.
  const keywordGroup = baseText
    ? firstMatchingGroup(baseText, chatbot.keyword_triggers ?? [])
    : null;
  const alreadyEngaged =
    Array.isArray(existing?.keyword_fired) && existing!.keyword_fired.length > 0;
  if (keywordGateBlocks(chatbot.keyword_gate_enabled ?? false, !!keywordGroup, alreadyEngaged)) {
    return manychatReply("", { ai_skipped: true, reason: "keyword_gate_blocked" });
  }

  // 6-mute. Self-service pause/resume. A lead silences the AI by texting
  // "stopmessage" and turns it back on with "resumemessage". Tracked on
  // conversations.user_muted_at, INDEPENDENT of the owner's human-takeover
  // (status='ai_paused', gated above) so a lead can't resume a chat a human has
  // taken over — and no confirmation bubble fires into a human's conversation.
  // Runs before rate-limit so a control word is never dropped, and returns a
  // muted lead before any AI cost. On a gated bot the 6-gate above has already
  // silenced never-engaged strangers, so this only ever sees engaged leads (or
  // non-gated bots) — a stranger's "stopmessage" never reaches here. Fail-open: a
  // missing column reads as not-muted. Control words are exempt from the 30s dedup
  // gate above (they toggle state), so a duplicate "stopmessage" isn't re-confirmed
  // by the idempotence below (stop-while-already-muted → silent, no second bubble),
  // not by dedup.
  const control = baseText ? detectUserControl(baseText) : null;
  const isMuted = !!existing?.user_muted_at;
  if (control === "resume" && isMuted) {
    // Clear the mute and any stale debounce claim left by the earlier stop.
    await supabase
      .from("conversations")
      .update({ user_muted_at: null, reply_claimed_for: null })
      .eq("id", conversationId!)
      .then(() => {}, () => {});
    await persistAndPush(supabase, conversationId!, body.subscriber_id, RESUME_CONFIRMATION, chatbot.user_id, chatbot.id, apiKey, platform);
    return manychatReply(sanitizeReply(RESUME_CONFIRMATION), { ai_skipped: true, reason: "user_resumed" });
  }
  if (control === "stop" && !isMuted) {
    // Overwrite reply_claimed_for so an in-flight burst run (a question asked
    // seconds earlier, still generating/pushing) fails its single-flight CAS
    // release and discards — the lead doesn't get an answer bubble AFTER the
    // "I'll hold off" confirmation.
    await supabase
      .from("conversations")
      .update({ user_muted_at: new Date().toISOString(), reply_claimed_for: inboundId ?? null })
      .eq("id", conversationId!)
      .then(() => {}, () => {});
    await persistAndPush(supabase, conversationId!, body.subscriber_id, STOP_CONFIRMATION, chatbot.user_id, chatbot.id, apiKey, platform);
    return manychatReply(sanitizeReply(STOP_CONFIRMATION), { ai_skipped: true, reason: "user_paused" });
  }
  // Muted, and this wasn't the resume word → stay silent (no AI). A redundant
  // "stopmessage" while already muted also lands here (no duplicate confirmation).
  if (isMuted) {
    return manychatReply("", { ai_skipped: true, reason: "user_muted" });
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
  // Persona bots (custom system_prompt) skip this so even a "thanks" gets an
  // in-voice reply from the persona instead of a generic canned line. Also
  // skipped while a debounce claim is pending: a "thanks" landing mid-burst
  // must fall through to the AI path (claim + supersede) so the burst's real
  // question still gets answered — a canned ack row would otherwise become a
  // burst boundary and strand it.
  const trivial =
    chatbot.system_prompt || hasMedia || existing?.reply_claimed_for
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
    const flagUpdate: Record<string, unknown> = {
      extraction_attempts: newAttempts,
      flagged_at: new Date().toISOString(),
    };
    // Repeat-attempt auto-handoff (ships OFF; flag-only per owner decision).
    if (AUTO_PAUSE_ON_EXTRACTION && extraction.level === "hard" && newAttempts >= EXTRACTION_PAUSE_THRESHOLD) {
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

    // HARD, not mid-burst → guaranteed no-leak deflection (no AI call). The
    // mid-burst guard mirrors keyword canCanned: a canned row mid-burst would
    // become a burst boundary and strand an earlier unanswered question.
    if (extraction.level === "hard" && !existing?.reply_claimed_for) {
      const text = pickDeflection(body.subscriber_id, baseText.length);
      await persistAndPush(supabase, conversationId!, body.subscriber_id, text, chatbot.user_id, chatbot.id, apiKey, platform);
      return manychatReply(sanitizeReply(text), { ai_skipped: true, reason: "extraction_blocked" });
    }
    // SOFT, or HARD mid-burst → steer this turn and fall through.
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
            chatbot.user_id, chatbot.id, apiKey, platform
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
          chatbot.user_id, chatbot.id, apiKey, platform
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
  // release is harmless — the next message's claim overwrites it anyway.
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
    mode: "burst" | "single" = "single"
  ): Promise<{ text: string; assets: OutboundAsset[] } | null> => {
    // 6e. Process any inbound media (network): transcribe audio/video, read
    // documents, encode images for vision. Runs here (background for push
    // channels) so the fast-ack isn't blocked by downloads/transcription.
    let images: { base64: string; mediaType: string }[] = [];
    const textParts: string[] = [];
    if (hasMedia) {
      const media = await processInboundMedia(mediaItems, {
        supabase,
        userId: chatbot.user_id,
      });
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
    // if this run's claim survived — every newer message OVERWRITES the claim,
    // so its run takes over and answers the whole burst instead. That's the
    // "timer resets while they keep typing" behavior. Media processing above
    // already backfilled this row, so a superseded run still leaves its
    // transcript for the surviving run to fold in.
    let memorySummary: string | null = existing?.memory_summary ?? null;
    let confirmedAt: string | null = existing?.confirmed_at ?? null;
    if (mode === "burst") {
      const waitMs = remainingDebounceMs(performance.now() - startedAt);
      if (waitMs > 0) await sleep(waitMs);
      const { data: fresh } = await supabase
        .from("conversations")
        .select("status, user_muted_at, reply_claimed_for, memory_summary, confirmed_at")
        .eq("id", conversationId!)
        .maybeSingle();
      // Human takeover OR a self-service "stopmessage" during the sleep → stand
      // down and release our claim (don't answer the burst after the lead muted).
      if (fresh?.status === "ai_paused" || fresh?.user_muted_at) {
        await releaseClaim();
        return null;
      }
      // Superseded: a newer message claimed the reply while we slept. (A null
      // `fresh` — transient fetch error — falls through: fail-open to a reply.)
      if (fresh && fresh.reply_claimed_for !== inboundId) return null;
      memorySummary = fresh?.memory_summary ?? memorySummary;
      confirmedAt = fresh?.confirmed_at ?? confirmedAt;
    }

    // 7. Fetch recent history. Order desc + limit so we get the newest
    // HISTORY_TURNS prior + the just-inserted user message, not the oldest.
    // Context older than this window is carried by the rolling memory summary.
    const { data: history } = await supabase
      .from("messages")
      .select("id, role, content")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS + 1)
      .returns<Pick<Message, "id" | "role" | "content">[]>();

    let priorHistory: Pick<Message, "id" | "role" | "content">[];
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
      // contribute their stored content — transcripts/doc text if their runs
      // finished backfilling, else the provisional attachment label. Vision
      // image parts stay this-run-only (known limitation for burst images).
      effectiveMessage = combineBurstText(burst, inboundId, effectiveMessage);
    } else {
      // Desc order: [0] is the just-inserted user msg. Drop it, reverse to chrono.
      priorHistory = (history ?? []).slice(1).reverse();
    }

    // 7a. Follow-up media library — only when the bot may send AI-triggered media.
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
      });
      if (text) {
        replyText = text;
        tokens = tokensUsed;
      }
    } catch (err) {
      console.error("[manychat-webhook] AI error", err);
    }

    // 8a. AI-triggered media: pull [[SEND_ASSET: key]] directives out of the reply
    // and resolve them to library assets. Capped per reply: one asset is the norm,
    // three is plenty — a reply spamming the whole library is never desirable, and
    // the cap keeps a single sendContent call far under ManyChat's 10-message limit.
    const MAX_AI_ASSETS = 3;
    const assets: OutboundAsset[] = [];
    const assetRows: { content: string; media_url: string; media_type: string | null }[] = [];
    if (chatbot.ai_media_enabled) {
      const parsed = parseAssetDirectives(replyText);
      if (parsed.assetKeys.length) {
        for (const key of parsed.assetKeys.slice(0, MAX_AI_ASSETS)) {
          const asset = resolveAssetByKey(assetLib, key);
          if (!asset?.url) continue;
          assets.push({ kind: asset.kind, url: asset.url });
          // media_type stays a real MIME (or null) — the inbox renderer matches
          // on startsWith("image/"|"audio/"|"video/").
          assetRows.push({
            content: `(sent ${asset.kind}: ${asset.key})`,
            media_url: asset.url,
            media_type: asset.mime ?? null,
          });
        }
        replyText = parsed.cleanText;
      }
    }

    // 8b. Single-flight release (burst mode): atomically clear our claim. Zero
    // rows updated means a newer message claimed while we were generating —
    // discard this reply WITHOUT persisting or sending; the newer run's burst
    // covers everything, so the lead gets one consolidated answer instead of
    // two overlapping ones. The occasional wasted generation is the price of
    // never double-replying. (A transient release error falls through to a
    // send — worst case matches today's per-message behavior.)
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
    // A media-only reply has no text to echo — skip the cache (the dedup gate then
    // falls back to its canned ack for an instant repeat, which is acceptable).
    await Promise.all([
      replyText
        ? cacheLastReply(chatbot.id, body.subscriber_id, replyText)
        : Promise.resolve(),
      incrementMonthlyCount(chatbot.id),
    ]);

    // 9a. Auto-confirm detection (best-effort): if the lead clearly converted, stop
    // the drip. Only for bots running a follow-up sequence, only when not already
    // confirmed, and only on push channels (where this runs in the background) so
    // it never adds latency to a synchronous response-channel reply. Never blocks.
    if (chatbot.auto_followup_enabled && !confirmedAt && canPushPlatform(platform)) {
      try {
        const confirmed = await detectLeadConfirmed({
          userMessage: effectiveMessage,
          // A media-only reply has no text; give the classifier a stand-in so a
          // "just paid!" answered with media still gets detected.
          botReply: replyText || (assets.length ? "(sent media)" : ""),
        });
        if (confirmed) {
          await supabase
            .from("conversations")
            .update({ confirmed_at: new Date().toISOString(), confirmed_by: "ai" })
            .eq("id", conversationId!)
            .is("confirmed_at", null);
        }
      } catch (err) {
        console.error("[manychat-webhook] confirm-detect failed", err);
      }
    }

    return { text: replyText, assets };
  };

  // 10. Deliver. Two paths depending on whether the channel has a ManyChat send API:
  if (canPushPlatform(platform) && apiKey) {
    // Single-flight claim: mark THIS message as the one the conversation's next
    // reply answers. Newer messages overwrite the claim (their run takes over —
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
        if (!result) return; // stood down — a newer run owns the consolidated reply
        const { text: replyText, assets } = result;
        const bubbles = splitIntoMessages(replyText);
        try {
          if (pacingEnabled() && bubbles.length > 0) {
            // Paced even for a single bubble: a human-like typing delay before the
            // reply lands (see computeBubbleDelays), then drip-in for extra bubbles.
            await sendManychatMessagePaced({
              subscriberId: body.subscriber_id,
              bubbles,
              startedAt,
              apiKey,
              platform,
            });
          } else if (bubbles.length > 0) {
            await sendManychatMessage({ subscriberId: body.subscriber_id, text: bubbles, apiKey, platform });
          }
          // Then push any AI-triggered media assets (channel-aware; unsupported
          // media on this channel is dropped inside sendManychatMedia).
          if (assets.length > 0) {
            await sendManychatMedia({ subscriberId: body.subscriber_id, assets, apiKey, platform });
          }
        } catch (err) {
          console.error("[manychat-webhook] push send failed", err);
          await logPushFailure(supabase, chatbot.user_id, chatbot.id);
        }
        // Refresh the rolling memory summary for the next reply (best-effort).
        await refreshConversationMemory({ supabase, conversationId: conversationId! });
      } catch (err) {
        // after() runs detached — swallow so nothing crashes the background task.
        console.error("[manychat-webhook] background processing failed", err);
      }
    });
    return manychatReply("", { ai_queued: true });
  }

  // RESPONSE channels (TikTok — no ManyChat send API yet) OR no API key: ManyChat
  // can't be pushed to, so generate synchronously and RETURN the reply in the body
  // for the client's flow to deliver (map `reply`/render the dynamic content). This
  // shares the ~10s timeout risk we avoid for push channels, but TikTok replies are
  // short. Auto-upgrades to the push path once PLATFORM_META gives the channel a
  // sendContent type (canPush=true).
  // Media assets can't be pushed on response channels (no send API), so only the
  // text is returned here; AI media is a push-channel feature.
  let replyText = "Thanks for the message, a teammate will follow up shortly.";
  try {
    // "single" mode never returns null; the guard is just for the type.
    const result = await generateAndPersistReply("single");
    if (result) replyText = result.text;
  } catch (err) {
    console.error("[manychat-webhook] sync processing failed", err);
  }
  // Refresh the rolling memory summary in the background (don't block the reply).
  after(() => refreshConversationMemory({ supabase, conversationId: conversationId! }));
  return manychatReply(replyText, { ai_delivery: "response", platform });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "manychat-webhook" });
}
