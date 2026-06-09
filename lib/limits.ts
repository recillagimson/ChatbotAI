/**
 * Spam / cost-control gates for the ManyChat webhook.
 *
 * Five orthogonal defenses, each fail-OPEN if Upstash Redis is not configured
 * (so local dev keeps working without setting up Redis):
 *
 *   1. Rate limit  — N messages per window per (chatbot, subscriber).
 *   2. Trivial ack — pure thanks/ok/emoji-ack → static canned reply, no AI.
 *   3. Duplicate   — same exact message within 30s → echo prior reply, no AI.
 *   4. Monthly cap — per-chatbot reply ceiling; over → static fallback, no AI.
 *   5. Last-reply cache — used by #3 to echo prior replies and by future ops.
 *
 * Tunables (all optional env vars, sane defaults):
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN   (required for any gate)
 *   RATE_LIMIT_REQUESTS         default 10
 *   RATE_LIMIT_WINDOW           default "60 s"   (any @upstash duration)
 *   MONTHLY_REPLY_CAP           default 10000
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHash } from "crypto";

const RATE_LIMIT_REQUESTS = Number(process.env.RATE_LIMIT_REQUESTS ?? 10);
const RATE_LIMIT_WINDOW =
  (process.env.RATE_LIMIT_WINDOW ?? "60 s") as `${number} ${"s" | "m" | "h" | "d"}`;
const MONTHLY_REPLY_CAP = Number(process.env.MONTHLY_REPLY_CAP ?? 10_000);
const DEDUP_TTL_SECONDS = 30;
const LAST_REPLY_TTL_SECONDS = 300; // 5 min

let _redis: Redis | null = null;
let _ratelimit: Ratelimit | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function getRatelimit(): Ratelimit | null {
  if (_ratelimit) return _ratelimit;
  const redis = getRedis();
  if (!redis) return null;
  _ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW),
    analytics: false,
    prefix: "chatpilot:rl",
  });
  return _ratelimit;
}

/** True if Redis is configured. Useful for log lines / health checks. */
export function limitsEnabled(): boolean {
  return getRedis() !== null;
}

// ---------------------------------------------------------------------------
// 1) Rate limit per (chatbot, subscriber)
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** True if Redis isn't configured — gate was bypassed. */
  bypassed: boolean;
}

export async function checkRateLimit(
  chatbotId: string,
  subscriberId: string
): Promise<RateLimitResult> {
  const limiter = getRatelimit();
  if (!limiter) {
    return { ok: true, limit: RATE_LIMIT_REQUESTS, remaining: RATE_LIMIT_REQUESTS, bypassed: true };
  }
  try {
    const r = await limiter.limit(`${chatbotId}:${subscriberId}`);
    return { ok: r.success, limit: r.limit, remaining: r.remaining, bypassed: false };
  } catch (err) {
    console.error("[limits] rate-limit redis error", err);
    // Fail open — better to let the message through than block a paying customer.
    return { ok: true, limit: RATE_LIMIT_REQUESTS, remaining: RATE_LIMIT_REQUESTS, bypassed: true };
  }
}

// ---------------------------------------------------------------------------
// 2) Trivial-input shortcut (no Redis required)
// ---------------------------------------------------------------------------

/**
 * Plain acknowledgments / closings that don't deserve an AI round-trip.
 * Anything not in these sets falls through to the normal pipeline.
 */
const THANKS_SET = new Set([
  "thanks", "thank you", "ty", "thx", "tysm", "thanks!",
  "thank you!", "thank u", "thankyou", "thank you so much",
  "🙏",
]);
const ACK_SET = new Set([
  "ok", "okay", "k", "kk", "got it", "gotcha", "noted",
  "cool", "great", "perfect", "sounds good", "sg",
  "👍", "✅",
]);

/**
 * Returns a canned reply string if the user's message is a pure ack /
 * thanks, or null to fall through to the AI pipeline. Bypasses Anthropic
 * entirely — typically 10-25% of real DMs in customer-service flows.
 */
export function getTrivialReply(text: string): string | null {
  // Normalize: trim, lowercase, strip trailing punctuation, collapse spaces.
  const n = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
  if (!n) return null;
  if (THANKS_SET.has(n)) return "You're welcome, happy to help! Reach out anytime.";
  if (ACK_SET.has(n)) return "Got it! Let me know if there's anything else.";
  return null;
}

// ---------------------------------------------------------------------------
// 3) Duplicate-message dedup + last-reply cache
// ---------------------------------------------------------------------------

function hashMessage(text: string): string {
  return createHash("sha1")
    .update(text.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

export interface DuplicateResult {
  isDuplicate: boolean;
  lastReply: string | null;
  bypassed: boolean;
}

/**
 * Atomic check-and-mark: SET NX. If the same (chatbot, subscriber, message)
 * was seen within DEDUP_TTL_SECONDS, returns the last cached AI reply if any.
 */
export async function checkDuplicate(
  chatbotId: string,
  subscriberId: string,
  message: string
): Promise<DuplicateResult> {
  const redis = getRedis();
  if (!redis) return { isDuplicate: false, lastReply: null, bypassed: true };
  try {
    const hash = hashMessage(message);
    const dedupKey = `chatpilot:dedup:${chatbotId}:${subscriberId}:${hash}`;
    const set = await redis.set(dedupKey, "1", { nx: true, ex: DEDUP_TTL_SECONDS });
    if (set === null) {
      const lastKey = `chatpilot:last:${chatbotId}:${subscriberId}`;
      const lastReply = (await redis.get<string>(lastKey)) ?? null;
      return { isDuplicate: true, lastReply, bypassed: false };
    }
    return { isDuplicate: false, lastReply: null, bypassed: false };
  } catch (err) {
    console.error("[limits] dedup redis error", err);
    return { isDuplicate: false, lastReply: null, bypassed: true };
  }
}

/** Cache the latest AI reply so a near-duplicate inbound can echo it. */
export async function cacheLastReply(
  chatbotId: string,
  subscriberId: string,
  reply: string
): Promise<void> {
  const redis = getRedis();
  if (!redis || !reply) return;
  try {
    const lastKey = `chatpilot:last:${chatbotId}:${subscriberId}`;
    await redis.set(lastKey, reply, { ex: LAST_REPLY_TTL_SECONDS });
  } catch (err) {
    console.error("[limits] cacheLastReply redis error", err);
  }
}

// ---------------------------------------------------------------------------
// 4) Per-chatbot monthly reply cap
// ---------------------------------------------------------------------------

function monthBucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function secondsUntilMonthEnd(): number {
  const d = new Date();
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(60, Math.floor((next - d.getTime()) / 1000));
}

export interface MonthlyCapResult {
  ok: boolean;
  current: number;
  cap: number;
  bypassed: boolean;
}

export async function checkMonthlyCap(chatbotId: string): Promise<MonthlyCapResult> {
  const redis = getRedis();
  if (!redis) {
    return { ok: true, current: 0, cap: MONTHLY_REPLY_CAP, bypassed: true };
  }
  try {
    const key = `chatpilot:replies:${chatbotId}:${monthBucket()}`;
    const current = Number((await redis.get<number | string>(key)) ?? 0);
    return {
      ok: current < MONTHLY_REPLY_CAP,
      current,
      cap: MONTHLY_REPLY_CAP,
      bypassed: false,
    };
  } catch (err) {
    console.error("[limits] monthly cap redis error", err);
    return { ok: true, current: 0, cap: MONTHLY_REPLY_CAP, bypassed: true };
  }
}

/** Increment the monthly reply counter; call AFTER a successful AI reply. */
export async function incrementMonthlyCount(chatbotId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = `chatpilot:replies:${chatbotId}:${monthBucket()}`;
    const v = await redis.incr(key);
    if (v === 1) {
      await redis.expire(key, secondsUntilMonthEnd());
    }
  } catch (err) {
    console.error("[limits] monthly count incr error", err);
  }
}
