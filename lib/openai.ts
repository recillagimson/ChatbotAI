// lib/openai.ts
// Minimal OpenAI Chat Completions transport for plain (non-tool) text replies —
// used by the DM-reply path (lib/anthropic.ts generateReply). Raw fetch, no SDK,
// mirroring lib/embeddings.ts / lib/openai-changes.ts which already use
// OPENAI_API_KEY. Tool-calling lives in lib/openai-changes.ts.

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export interface OpenAIChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * One chat completion. Returns the assistant text + total tokens. Throws on a
 * missing key or a non-2xx response (the caller catches and falls back). The
 * timeout keeps us well inside the webhook's 60s budget.
 */
export async function openaiChat(opts: {
  model: string;
  system: string;
  messages: OpenAIChatMessage[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; tokensUsed: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

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
        max_tokens: opts.maxTokens ?? 400,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI chat failed (${res.status}): ${detail.slice(0, 300)}`);
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
