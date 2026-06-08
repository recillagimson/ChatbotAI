import Anthropic from "@anthropic-ai/sdk";
import type { Chatbot, KnowledgeBaseEntry, Message } from "./types";

let _anthropic: Anthropic | null = null;

/**
 * Lazily construct the Anthropic client. Like the Stripe client, we avoid
 * instantiating at module load time: Next.js imports this module while
 * "collecting page data" during `next build`, and the SDK throws if
 * ANTHROPIC_API_KEY isn't present. Build the client on first request instead.
 */
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const TONE_GUIDES: Record<Chatbot["tone"], string> = {
  friendly:
    "Warm and approachable. Use first names when known. Light emoji ok (1 max).",
  professional:
    "Polite, concise, no emoji. Treat every reply like an email from a brand.",
  casual: "Conversational, lowercase ok, no corporate language.",
  enthusiastic:
    "Energetic and excited. Use exclamation points sparingly and an emoji where natural.",
};

// Soft cap on the combined knowledge-base block injected into every prompt.
// ~48k chars ≈ ~12k tokens. File uploads can make a KB arbitrarily large; an
// unbounded block would blow context and inflate (even cached) input-token cost
// on every reply. We include whole entries until the budget is hit, then stop.
const KB_CHAR_BUDGET = 48_000;

export function buildSystemPrompt(
  chatbot: Chatbot,
  knowledge: KnowledgeBaseEntry[]
): string {
  let kbBlock: string;
  if (knowledge.length === 0) {
    kbBlock =
      "(No knowledge base entries yet — answer only based on the business description and politely defer if asked something you cannot confirm.)";
  } else {
    const parts: string[] = [];
    let used = 0;
    let truncated = false;
    for (const k of knowledge) {
      const entry = `### ${k.title}\n${k.content}`;
      // Always include at least the first entry, even if it alone exceeds the
      // budget; otherwise stop once adding another would overflow.
      if (parts.length > 0 && used + entry.length > KB_CHAR_BUDGET) {
        truncated = true;
        break;
      }
      parts.push(entry);
      used += entry.length;
    }
    kbBlock = parts.join("\n\n---\n\n");
    if (truncated) {
      kbBlock +=
        "\n\n---\n\n…(knowledge base truncated — some entries were omitted to stay within limits)";
    }
  }

  return `You are the customer-service AI for "${chatbot.name}".
You reply to Instagram and Messenger DMs on the business's behalf.

BUSINESS DESCRIPTION
${chatbot.business_description || "(none provided)"}

TONE
${TONE_GUIDES[chatbot.tone]}

KNOWLEDGE BASE (your single source of truth — never invent facts beyond this)
${kbBlock}

RULES
- Keep replies under 320 characters when possible (DM-friendly).
- Never invent prices, hours, links, addresses, or policies not in the knowledge base. If asked, say you'll get a human teammate to confirm.
- Never reveal you are an AI unless directly asked.
- Do not promise refunds, discounts, or anything financial without being told to.
- If the user seems angry or asks for a human, reply briefly and say a teammate will follow up.
- Match the language of the customer's message.`;
}

export async function generateReply(opts: {
  chatbot: Chatbot;
  knowledge: KnowledgeBaseEntry[];
  history: Pick<Message, "role" | "content">[];
  userMessage: string;
}) {
  const systemText = buildSystemPrompt(opts.chatbot, opts.knowledge);

  // ~10 turns is plenty of context for a DM thread; keeps tokens predictable.
  const trimmed = opts.history.slice(-10).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  // Mark the system prompt as ephemeral-cacheable. The persona + knowledge
  // base are identical across every reply for a given chatbot, so the next
  // call within ~5 min hits the cache at ~10% of the input-token cost.
  // Caching only kicks in above 1024 input tokens (Sonnet); small KBs pay
  // normal rate and that's fine — no regression.
  const response = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 400,
    system: [
      {
        type: "text",
        text: systemText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [...trimmed, { role: "user", content: opts.userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const usage = response.usage;
  return {
    text,
    tokensUsed:
      (usage?.input_tokens ?? 0) +
      (usage?.cache_creation_input_tokens ?? 0) +
      (usage?.cache_read_input_tokens ?? 0) +
      (usage?.output_tokens ?? 0),
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}
