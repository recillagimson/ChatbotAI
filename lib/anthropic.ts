import Anthropic from "@anthropic-ai/sdk";
import type { Chatbot, KnowledgeBaseEntry, Message } from "./types";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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

export function buildSystemPrompt(
  chatbot: Chatbot,
  knowledge: KnowledgeBaseEntry[]
): string {
  const kbBlock =
    knowledge.length === 0
      ? "(No knowledge base entries yet — answer only based on the business description and politely defer if asked something you cannot confirm.)"
      : knowledge
          .map((k) => `### ${k.title}\n${k.content}`)
          .join("\n\n---\n\n");

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
  const system = buildSystemPrompt(opts.chatbot, opts.knowledge);

  // Last ~12 turns is plenty of context for a DM thread.
  const trimmed = opts.history.slice(-12).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 400,
    system,
    messages: [...trimmed, { role: "user", content: opts.userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    text,
    tokensUsed:
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0),
  };
}
