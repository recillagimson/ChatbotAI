import Anthropic from "@anthropic-ai/sdk";
import type { Chatbot, Message } from "./types";
import { sanitizeReply } from "./sanitize";
import { openaiChat, type OpenAIChatMessage } from "./openai";
import { HISTORY_TURNS } from "./memory";

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
    // Explicit timeout: the SDK default is 10 minutes, but the webhook has
    // maxDuration=60s — a hung call would let Vercel kill the function before
    // even the canned fallback could be sent. 15s/attempt + 1 retry ≈ 31s worst
    // case, leaving room for the ManyChat push retries inside the 60s budget.
    _anthropic = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });
  }
  return _anthropic;
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// DM-reply provider. Defaults to OpenAI (ChatGPT) — the app already requires
// OPENAI_API_KEY for the change-request AI + embeddings, so this needs no new
// key. Set AI_PROVIDER=anthropic to use Claude instead (needs ANTHROPIC_API_KEY).
export const DM_AI_PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();
export const OPENAI_DM_MODEL = process.env.OPENAI_DM_MODEL || "gpt-4.1-mini";

// Shared by the DM-reply path (below) and the change-request AI (lib/openai-changes.ts).
export const TONE_GUIDES: Record<Chatbot["tone"], string> = {
  friendly:
    "Warm and approachable. Use first names when known. Light emoji ok (1 max).",
  professional:
    "Polite, concise, no emoji. Treat every reply like an email from a brand.",
  casual: "Conversational, lowercase ok, no corporate language.",
  enthusiastic:
    "Energetic and excited. Use exclamation points sparingly and an emoji where natural.",
};

// The change-request AI (draftChangeRequest, chatTurn, parseProposalInput, the
// propose_changes tool, and the scoped chat system prompt) lives in
// lib/openai-changes.ts. The DM-reply path below (generateReply) runs on OpenAI
// by default (DM_AI_PROVIDER), with Anthropic as an opt-in alternative.
// buildSystemPrompt is provider-agnostic.

// Platform guardrails appended below the persona/sections — these are channel
// requirements (DM length, bubble splitting, no inventing facts), NOT a
// competing identity, so a hand-written persona stays in charge of voice.
const GUARDRAILS = `RULES
- Keep replies under 320 characters when possible (DM-friendly).
- To send several short messages, separate each one with a blank line; each block is delivered as its own DM bubble.
- Never invent prices, hours, links, addresses, or policies not in the knowledge base or the sections above. If asked, say you'll get a human teammate to confirm.
- Never reveal you are an AI unless directly asked.
- Do not promise refunds, discounts, or anything financial without being told to.
- If the user seems angry or asks for a human, reply briefly and say a teammate will follow up.
- Match the language of the customer's message.`;

export function buildSystemPrompt(
  chatbot: Chatbot,
  kbBlock: string,
  memorySummary?: string | null
): string {
  const persona = chatbot.persona_section?.trim() || "";
  const offers = chatbot.offers_section?.trim() || "";
  const rebuttals = chatbot.rebuttals_section?.trim() || "";
  const hasSections = !!(persona || offers || rebuttals);

  // Memory of earlier turns (summarized) — known context so the bot doesn't
  // re-ask. Empty for short/new conversations. Placed just above the KB.
  const memory = memorySummary?.trim();
  const memoryBlock = memory
    ? `CONVERSATION MEMORY (summary of earlier messages in this chat; treat as known context, don't re-ask)\n${memory}`
    : "";

  // SECTION MODE — the chatbot is authored as three editable sections. The
  // Personality section leads as identity VERBATIM (no generic preamble bolted
  // on top of a hand-written persona); offers/rebuttals follow when present;
  // then the conversation memory, the knowledge base and the platform guardrails.
  if (hasSections) {
    const parts: string[] = [];
    parts.push(
      persona ||
        `You are the customer-service AI for "${chatbot.name}". You reply to Instagram and Messenger DMs on the business's behalf.`
    );
    if (offers) parts.push(`OFFERS, SERVICES & LINKS\n${offers}`);
    if (rebuttals) parts.push(`REBUTTALS & FAQ HANDLING\n${rebuttals}`);
    if (memoryBlock) parts.push(memoryBlock);
    parts.push(
      `KNOWLEDGE BASE (your single source of truth — never invent facts beyond this)\n${kbBlock}`
    );
    parts.push(GUARDRAILS);
    return parts.join("\n\n");
  }

  // LEGACY FALLBACK — un-migrated bots whose three sections are all empty.
  // A custom system_prompt (a full persona like "Evan") takes over completely:
  // drop the generic name/description/tone scaffolding (which would fight the
  // persona) and append only the conversation memory, knowledge base, and the
  // bubble-split note.
  if (chatbot.system_prompt && chatbot.system_prompt.trim()) {
    return `${chatbot.system_prompt.trim()}
${memoryBlock ? `\n${memoryBlock}\n` : ""}
KNOWLEDGE BASE (your single source of truth, never invent facts beyond this)
${kbBlock}

DELIVERY FORMAT
To send several short messages, separate each one with a blank line. Each block is delivered as its own separate Instagram DM bubble. Keep each bubble short.`;
  }

  return `You are the customer-service AI for "${chatbot.name}".
You reply to Instagram and Messenger DMs on the business's behalf.

BUSINESS DESCRIPTION
${chatbot.business_description || "(none provided)"}

TONE
${TONE_GUIDES[chatbot.tone]}
${memoryBlock ? `\n${memoryBlock}\n` : ""}
KNOWLEDGE BASE (your single source of truth — never invent facts beyond this)
${kbBlock}

${GUARDRAILS}`;
}

export async function generateReply(opts: {
  chatbot: Chatbot;
  kbBlock: string;
  history: Pick<Message, "role" | "content">[];
  userMessage: string;
  // Images the contact just sent (base64 + MIME). Attached to the current turn
  // for the vision model; prior history stays text-only.
  images?: { base64: string; mediaType: string }[];
  // Rolling summary of earlier turns (older than the verbatim window); injected
  // as known context so the bot remembers long conversations.
  memorySummary?: string | null;
}) {
  const systemText = buildSystemPrompt(opts.chatbot, opts.kbBlock, opts.memorySummary);
  const images = opts.images ?? [];

  // Recent turns sent verbatim; older context comes from memorySummary. Keeps
  // tokens predictable while remembering long chats.
  const trimmed = opts.history.slice(-HISTORY_TURNS).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  // OpenAI (ChatGPT) — the default DM engine. Same system prompt + history; the
  // return shape matches the Anthropic path (cache fields are 0, OpenAI has no
  // prompt-cache token accounting here).
  if (DM_AI_PROVIDER !== "anthropic") {
    // gpt-4.1-mini is multimodal: send images as data-URL image_url parts on the
    // current turn alongside the text.
    const currentTurn: OpenAIChatMessage = images.length
      ? {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image_url" as const,
              image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
            })),
            { type: "text" as const, text: opts.userMessage || "(see attached image)" },
          ],
        }
      : { role: "user", content: opts.userMessage };

    const { text, tokensUsed } = await openaiChat({
      model: OPENAI_DM_MODEL,
      system: systemText,
      messages: [...trimmed, currentTurn],
      maxTokens: 400,
    });
    return {
      text: sanitizeReply(text),
      tokensUsed,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
  }

  // Anthropic current turn: image blocks (base64 source) + a text block.
  const currentContent: Anthropic.MessageParam["content"] = images.length
    ? [
        ...images.map((img) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: img.mediaType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: img.base64,
          },
        })),
        { type: "text" as const, text: opts.userMessage || "(see attached image)" },
      ]
    : opts.userMessage;
  const messages = [...trimmed, { role: "user" as const, content: currentContent }];

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
    messages,
  });

  const text = sanitizeReply(
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
  );

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
