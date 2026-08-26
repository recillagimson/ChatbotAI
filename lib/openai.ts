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

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

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
  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenAIChatError";
    this.status = status;
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

/** One chat completion attempt. Throws OpenAIChatError on non-2xx; the timeout keeps
 *  any single attempt bounded so a stalled call can't hang the caller. */
async function openaiChatOnce(
  opts: {
    model: string;
    system: string;
    messages: OpenAIChatMessage[];
    maxTokens?: number;
    timeoutMs?: number;
  },
  apiKey: string
): Promise<{ text: string; tokensUsed: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
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
      choices?: { message?: { content?: string | null } }[];
      usage?: { total_tokens?: number };
    };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    return { text, tokensUsed: data.usage?.total_tokens ?? 0 };
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
  /** Extra attempts beyond the first, on transient errors only. Default 0. Clamped to 5. */
  retries?: number;
  /** Backoff before each retry; entry i is the wait before attempt i+2. */
  backoffMs?: number[];
  /** Injectable delay so the retry loop is unit-testable without real waits. */
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ text: string; tokensUsed: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const maxAttempts = 1 + Math.max(0, Math.min(opts.retries ?? 0, 5));
  const backoff = opts.backoffMs ?? [400, 800];
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await openaiChatOnce(opts, apiKey);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isTransientOpenAIError(err)) throw err;
      await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)]);
    }
  }
  throw lastErr; // unreachable: the loop returns or throws inside
}
