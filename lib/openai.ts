// lib/openai.ts
// Minimal OpenAI Chat Completions transport for plain (non-tool) text replies -
// used by the DM-reply path (lib/anthropic.ts generateReply). Raw fetch, no SDK,
// mirroring lib/embeddings.ts / lib/openai-changes.ts which already use
// OPENAI_API_KEY. Tool-calling lives in lib/openai-changes.ts.
//
// A single attempt THROWS on any non-2xx or timeout, and the DM caller falls back to
// a canned "a teammate will follow up" line when it throws. So a single transient
// provider blip (rate-limit / overload / request timeout) used to can a live reply.
// openaiChat now takes an OPT-IN bounded retry (default 0 = single attempt, identical
// to before) so the reply path can ride out a blip; the latency-sensitive screener /
// classifier callers keep the default and are unchanged.

import { logAiCall, type AiUsageTag, type TokenDetail } from "./usage-log";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/** The `usage` block of a chat completion. */
export interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/** The token split of one completion (missing fields count as 0). */
export function tokenDetail(model: string, usage: OpenAIUsage | undefined): TokenDetail {
  return {
    model,
    inputTokens: usage?.prompt_tokens ?? 0,
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

/** A multimodal content part - text or an image (data: URL or https URL). */
export type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface OpenAIChatMessage {
  role: "user" | "assistant";
  content: string | OpenAIContentPart[];
}

/**
 * Carries the HTTP status so the retry layer can tell a transient provider blip
 * (429 / 5xx / timeout) from a permanent request/config error (4xx, exhausted quota).
 */
export class OpenAIChatError extends Error {
  status?: number;
  /** True when the call returned 2xx but EMPTY content with finish_reason "length" -
   *  a reasoning model spent the whole max_completion_tokens budget on hidden reasoning.
   *  Retryable, but only usefully so with a bigger token budget (see the retry loop). */
  truncated?: boolean;
  constructor(message: string, status?: number, truncated?: boolean) {
    super(message);
    this.name = "OpenAIChatError";
    this.status = status;
    this.truncated = truncated;
  }
}

/**
 * True when a failed attempt is worth retrying: a rate-limit, a server/overload 5xx,
 * a request-timeout, or a network/abort error. A 4xx request error (bad params, auth,
 * unknown model) or an exhausted quota is permanent - retrying only burns latency
 * before the same failure, so those return false.
 */
export function isTransientOpenAIError(err: unknown): boolean {
  if (err instanceof OpenAIChatError) {
    if (err.truncated) return true; // empty-because-truncated: retry with a bigger budget
    const s = err.status;
    if (s === undefined) return true; // no status parsed - bias toward one retry
    // A rate-limit is transient, EXCEPT quota exhaustion (billing, not load): a retry
    // can't fix that, so don't spend attempts on it.
    if (s === 429) return !/insufficient_quota|billing/i.test(err.message);
    return s === 408 || s === 409 || s >= 500;
  }
  // Our own per-attempt timeout surfaces as an AbortError; a fetch network failure as
  // a TypeError. Both are transient - the request may well succeed on a retry.
  const name = (err as { name?: string } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") return true;
  if (err instanceof TypeError) return true;
  return false;
}

/** Per-attempt timeout when the caller gives none. */
const DEFAULT_ATTEMPT_TIMEOUT_MS = 20_000;

/** Under a deadline, no attempt starts with less than this left: a reply rarely lands
 *  faster, and the caller needs the remainder to send its fallback line. */
export const MIN_ATTEMPT_MS = 2_000;

/** A completed chat call. `text` may be "" (see finishReason/refusal for why). */
export interface OpenAIChatResult {
  text: string;
  tokensUsed: number;
  /** Model plus input / cached / output tokens, for usage_log. */
  detail: TokenDetail;
  /** choices[0].finish_reason ("stop", "length", "content_filter", ...), or null. */
  finishReason: string | null;
  /** choices[0].message.refusal: the model's safety decline text, or null. */
  refusal: string | null;
}

/** One chat completion attempt. Throws OpenAIChatError on non-2xx; the timeout keeps
 *  any single attempt bounded so a stalled call can't hang the caller. */
async function openaiChatOnce(
  opts: {
    model: string;
    system: string;
    messages: OpenAIChatMessage[];
    maxTokens?: number;
    timeoutMs?: number;
    promptCacheKey?: string;
  },
  apiKey: string
): Promise<OpenAIChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_completion_tokens: opts.maxTokens ?? 400,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
        // Routing hint so a given bot's requests reuse the same cached static prefix.
        // Purely a cache-hit optimization; ignored by models that don't cache, and it
        // never overrides content matching (a changed prompt is still a fresh miss).
        ...(opts.promptCacheKey ? { prompt_cache_key: opts.promptCacheKey } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new OpenAIChatError(
        `OpenAI chat failed (${res.status}): ${detail.slice(0, 300)}`,
        res.status
      );
    }
    const data = (await res.json()) as {
      choices?: {
        message?: { content?: string | null; refusal?: string | null };
        finish_reason?: string;
      }[];
      usage?: OpenAIUsage;
    };
    const choice = data.choices?.[0];
    const text = (choice?.message?.content ?? "").trim();
    // A reasoning model (gpt-5.x) can spend the WHOLE max_completion_tokens budget on
    // hidden reasoning and return empty visible content with finish_reason "length".
    // That is a truncation, not a real reply - surface it as a retryable error (the
    // retry loop raises the budget) instead of returning "" and letting the DM caller
    // fall through to the canned "a teammate will follow up shortly." fallback.
    if (!text && choice?.finish_reason === "length") {
      throw new OpenAIChatError(
        "OpenAI returned empty content (finish_reason=length): the token budget was consumed by reasoning",
        undefined,
        true
      );
    }
    // Any OTHER empty answer is returned, not thrown: finish_reason "stop" with no text
    // is the model deliberately saying nothing (a persona's "go quiet so the human picks
    // it up"), and a `refusal` is a safety decline. Neither is fixed by a retry. The
    // reason travels with the result so the caller can act on it and log WHY.
    const refusal = choice?.message?.refusal?.trim() || null;
    return {
      text,
      tokensUsed: data.usage?.total_tokens ?? 0,
      detail: tokenDetail(opts.model, data.usage),
      finishReason: choice?.finish_reason ?? null,
      refusal,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One chat completion. Returns the assistant text + total tokens. Throws on a
 * missing key or, after exhausting retries, on the last non-2xx/timeout error (the
 * caller catches and falls back).
 *
 * `retries` is the number of extra attempts BEYOND the first, made only on transient
 * errors (see isTransientOpenAIError). Default 0 = single attempt, byte-for-byte the
 * old behaviour - so every existing caller is unchanged unless it opts in.
 */
export async function openaiChat(opts: {
  model: string;
  system: string;
  messages: OpenAIChatMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  /** Optional cache-routing key (e.g. the chatbot id) so a bot's replies reuse the same
   *  cached static prompt prefix. Optional; unset callers (screener/classifier) unchanged. */
  promptCacheKey?: string;
  /** Extra attempts beyond the first, on transient errors only. Default 0. Clamped to 5. */
  retries?: number;
  /** Backoff before each retry; entry i is the wait before attempt i+2. */
  backoffMs?: number[];
  /** Injectable delay so the retry loop is unit-testable without real waits. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Wall-clock time (`now()` ms) the WHOLE call, retries included, must end by. Each
   * attempt's timeout is cut to the time left, a retry that would start with less than
   * MIN_ATTEMPT_MS left is skipped (the attempt's own error is thrown), and with less
   * than that left before the first attempt nothing is sent (a TimeoutError is thrown),
   * so the caller still has time to send its fallback. Unset = no deadline (unchanged).
   */
  deadlineAt?: number;
  /** Clock for deadlineAt; injectable for tests. Default Date.now. */
  now?: () => number;
  /** Bills this call to a bot: a usage_log row under `usage.event` once it succeeds.
   *  Unset = no row (the DM reply, whose ai_reply row the webhook writes itself). */
  usage?: AiUsageTag;
}): Promise<OpenAIChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const maxAttempts = 1 + Math.max(0, Math.min(opts.retries ?? 0, 5));
  const backoff = opts.backoffMs ?? [400, 800];
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const timeLeft = () => (opts.deadlineAt === undefined ? Infinity : opts.deadlineAt - now());

  let attemptMax = opts.maxTokens ?? 400;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const left = timeLeft();
    if (left < MIN_ATTEMPT_MS) {
      // A retry that ran out of time during its backoff reports what actually failed.
      if (lastErr) throw lastErr;
      throw Object.assign(new Error("OpenAI chat not attempted: the reply deadline is too close"), {
        name: "TimeoutError",
      });
    }
    const timeoutMs = Number.isFinite(left)
      ? Math.min(opts.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS, left)
      : opts.timeoutMs;
    try {
      const result = await openaiChatOnce({ ...opts, maxTokens: attemptMax, timeoutMs }, apiKey);
      if (opts.usage) await logAiCall(opts.usage, result.tokensUsed, result.detail);
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isTransientOpenAIError(err)) throw err;
      const wait = backoff[Math.min(attempt - 1, backoff.length - 1)];
      // No time for another attempt after the backoff: fail now with what happened.
      if (timeLeft() - wait < MIN_ATTEMPT_MS) throw err;
      // A truncation (empty, finish_reason=length) won't fix itself on a same-size retry -
      // the reasoning consumes the same budget again. Give the next attempt materially more
      // room so the visible reply can actually land (capped so a runaway can't balloon).
      if (err instanceof OpenAIChatError && err.truncated) {
        attemptMax = Math.min(Math.round(attemptMax * 2), 4000);
      }
      await sleep(wait);
    }
  }
  throw lastErr; // unreachable: the loop returns or throws inside
}
