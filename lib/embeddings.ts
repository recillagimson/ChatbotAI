// lib/embeddings.ts
// Thin OpenAI embeddings client (fetch-based, no SDK dependency — mirrors
// lib/manychat.ts). Optional: with no OPENAI_API_KEY, isEmbeddingsEnabled()
// is false and the whole retrieval feature stays dormant (full-context only).
import {
  OPENAI_EMBEDDING_MODEL,
  EMBEDDING_DIM,
  EMBED_MAX_BATCH,
  EMBED_TIMEOUT_MS,
} from "./kb-config";

export { EMBEDDING_DIM };

/** True iff an OpenAI key is configured. */
export function isEmbeddingsEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Split an array into sub-batches of at most `size` (pure, order-preserving). */
export function splitBatches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function postEmbeddings(
  inputs: string[],
  timeoutMs: number | null
): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const controller = timeoutMs != null ? new AbortController() : null;
  const timer =
    controller != null ? setTimeout(() => controller.abort(), timeoutMs!) : null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: inputs }),
      signal: controller?.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      // 401 (bad/expired key) and 429 insufficient_quota (out of credit) never
      // succeed on retry — mark them non-retryable so callers fail fast instead
      // of paying for 4 doomed attempts. Retry only transient 5xx / plain 429.
      const fatal =
        res.status === 401 ||
        (res.status === 429 && /insufficient_quota|exceeded.*quota|billing/i.test(body));
      const err = new Error(
        `OpenAI embeddings failed: ${res.status} ${body}`
      ) as Error & { retryable?: boolean };
      err.retryable = !fatal;
      throw err;
    }
    const json = (await res.json()) as {
      data: { index: number; embedding: number[] }[];
    };
    // Re-order by `index` so output aligns positionally with `inputs`.
    return json.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Embed texts. `inputType` is accepted for provider-swappability but is a no-op
 * for OpenAI (one embedding per text). Sub-batches under OpenAI's input cap and
 * retries transient failures with backoff (skipped when a timeout is set, i.e.
 * the latency-sensitive reply path). Returns vectors aligned to `texts` order.
 */
export async function embed(
  texts: string[],
  opts: { inputType?: "query" | "document"; timeoutMs?: number | null } = {}
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const timeoutMs = opts.timeoutMs === undefined ? null : opts.timeoutMs;
  const batches = splitBatches(texts, EMBED_MAX_BATCH);
  const results: number[][] = [];
  for (const batch of batches) {
    let lastErr: unknown;
    const attempts = timeoutMs != null ? 1 : 4; // no retries on the timed reply path
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const vecs = await postEmbeddings(batch, timeoutMs);
        results.push(...vecs);
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        const retryable = (err as { retryable?: boolean }).retryable !== false;
        if (retryable && attempt < attempts - 1) {
          await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        } else {
          break; // non-retryable (bad key / out of credit) or out of attempts
        }
      }
    }
    if (lastErr) throw lastErr;
  }
  return results;
}

/** Embed a single query string with the reply-path timeout applied. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embed([text], {
    inputType: "query",
    timeoutMs: EMBED_TIMEOUT_MS,
  });
  return vec;
}
