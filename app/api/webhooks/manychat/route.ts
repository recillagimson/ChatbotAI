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
  buildAssetCatalogBlock,
} from "@/lib/followup-assets";
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
import type { Chatbot, Message } from "@/lib/types";

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
  // in-voice reply from the persona instead of a generic canned line.
  const trivial =
    chatbot.system_prompt || hasMedia ? null : getTrivialReply(baseText);
  if (trivial) {
    await persistAndPush(supabase, conversationId!, body.subscriber_id, trivial, chatbot.user_id, chatbot.id, apiKey, platform);
    return manychatReply(trivial, { ai_skipped: true, reason: "trivial_ack" });
  }

  // 6c. Duplicate-message dedup: same TEXT inside 30s → echo prior reply. Skipped
  // when media is attached (two different photos can share empty/identical text).
  if (!hasMedia) {
    const dup = await checkDuplicate(chatbot.id, body.subscriber_id, baseText);
    if (dup.isDuplicate) {
      const echo = dup.lastReply ?? "Still on that, give me just a sec!";
      await persistAndPush(supabase, conversationId!, body.subscriber_id, echo, chatbot.user_id, chatbot.id, apiKey, platform);
      return manychatReply(echo, { ai_skipped: true, reason: "duplicate" });
    }
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

  // 7–9. Generate the AI reply, persist it + usage, and update Redis side-state.
  // Returns the reply text. Shared by both delivery paths below.
  const generateAndPersistReply = async (): Promise<{ text: string; assets: OutboundAsset[] }> => {
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
    const effectiveMessage = composeUserMessage({ text: baseText, textParts });

    // 7. Fetch recent history. Order desc + limit so we get the newest
    // HISTORY_TURNS prior + the just-inserted user message, not the oldest.
    // Context older than this window is carried by the rolling memory summary.
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS + 1)
      .returns<Pick<Message, "role" | "content">[]>();

    // Desc order: [0] is the just-inserted user msg. Drop it, reverse to chrono.
    const priorHistory = (history ?? []).slice(1).reverse();

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
        memorySummary: existing?.memory_summary ?? null,
        mediaCatalog,
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
    if (chatbot.auto_followup_enabled && !existing?.confirmed_at && canPushPlatform(platform)) {
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
    // PUSH channels (Instagram/Messenger/WhatsApp/Telegram): generate + push in
    // the background and ack instantly so ManyChat's ~10s External Request timeout
    // never trips. Delivery is via the Send Content API on the right channel.
    after(async () => {
      try {
        const { text: replyText, assets } = await generateAndPersistReply();
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
    const result = await generateAndPersistReply();
    replyText = result.text;
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
