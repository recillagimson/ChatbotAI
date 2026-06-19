import Anthropic from "@anthropic-ai/sdk";
import type { Chatbot, Message, ChangeProposal } from "./types";
import { sanitizeReply } from "./sanitize";

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

const TONE_GUIDES: Record<Chatbot["tone"], string> = {
  friendly:
    "Warm and approachable. Use first names when known. Light emoji ok (1 max).",
  professional:
    "Polite, concise, no emoji. Treat every reply like an email from a brand.",
  casual: "Conversational, lowercase ok, no corporate language.",
  enthusiastic:
    "Energetic and excited. Use exclamation points sparingly and an emoji where natural.",
};

const PROPOSE_CHANGES_TOOL: Anthropic.Tool = {
  name: "propose_changes",
  description:
    "Return proposed updates to the Instagram DM chatbot for the SpeedSettr team to review.",
  input_schema: {
    type: "object",
    properties: {
      system_prompt: {
        type: "string",
        description:
          "The FULL revised system prompt / persona for the bot. Omit (or leave empty) if no prompt change is needed.",
      },
      kb_entries: {
        type: "array",
        description: "NEW knowledge-base entries to add. Omit/empty if none.",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
      },
      summary: {
        type: "string",
        description: "A concise plain-English explanation of what you changed and why, for the human reviewer.",
      },
    },
    required: ["summary"],
  },
};

/** Normalize/guard a propose_changes tool input into a ChangeProposal. Throws on unusable input. */
export function parseProposalInput(input: unknown): ChangeProposal {
  if (!input || typeof input !== "object") {
    throw new Error("propose_changes returned no object input");
  }
  const obj = input as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (!summary) throw new Error("propose_changes returned no summary");

  const system_prompt =
    typeof obj.system_prompt === "string" && obj.system_prompt.trim()
      ? obj.system_prompt.trim()
      : undefined;

  let kb_entries: { title: string; content: string }[] | undefined;
  if (Array.isArray(obj.kb_entries)) {
    const cleaned = obj.kb_entries
      .filter(
        (e): e is { title: string; content: string } =>
          !!e &&
          typeof e === "object" &&
          typeof (e as Record<string, unknown>).title === "string" &&
          typeof (e as Record<string, unknown>).content === "string"
      )
      .map((e) => ({ title: e.title.trim(), content: e.content.trim() }))
      .filter((e) => e.title && e.content);
    if (cleaned.length) kb_entries = cleaned;
  }

  return { summary, ...(system_prompt ? { system_prompt } : {}), ...(kb_entries ? { kb_entries } : {}) };
}

export async function draftChangeRequest(opts: {
  chatbot: Chatbot;
  kbTitles: string[];
  requestText: string;
  adminGuidance?: string;
}): Promise<{ proposal: ChangeProposal; tokensUsed: number; model: string }> {
  const { chatbot, kbTitles, requestText, adminGuidance } = opts;

  const currentBehavior =
    chatbot.system_prompt && chatbot.system_prompt.trim()
      ? chatbot.system_prompt.trim()
      : `Generic customer-service bot for "${chatbot.name}".
Business description: ${chatbot.business_description || "(none provided)"}
Tone: ${TONE_GUIDES[chatbot.tone]}`;

  const system = `You are a senior prompt engineer for SpeedSettr, which runs AI chatbots that auto-reply to Instagram and Messenger DMs for small businesses. A client has requested a change to their bot. Produce a revised system prompt and/or new knowledge-base entries that fulfill the request.

CRITICAL: whenever you set system_prompt, BAKE IN these non-negotiable safety guardrails (the platform relies on them and will otherwise lose them):
- Keep replies under ~320 characters when possible (Instagram DM-friendly).
- Never invent prices, hours, links, addresses, or policies that aren't in the knowledge base; offer to get a human teammate to confirm.
- Never reveal it is an AI unless directly asked.
- Never promise refunds, discounts, or anything financial unless explicitly instructed.
- If the user is angry or asks for a human, reply briefly and say a teammate will follow up.
- Match the language of the customer's message.
- To send several short messages, separate each one with a blank line (each becomes its own DM bubble).

Only set system_prompt if the request warrants a prompt change. Propose kb_entries only for NEW facts not already covered by the existing titles. Always include a concise summary for the reviewer. Respond by calling the propose_changes tool.`;

  const userContent = `CURRENT BOT BEHAVIOR (your starting point):
${currentBehavior}

EXISTING KNOWLEDGE-BASE ENTRY TITLES (do not duplicate these):
${kbTitles.length ? kbTitles.map((t) => `- ${t}`).join("\n") : "(none)"}

CLIENT'S CHANGE REQUEST:
${requestText}${adminGuidance ? `\n\nADDITIONAL GUIDANCE FROM THE SPEEDSETTR TEAM (takes priority):\n${adminGuidance}` : ""}`;

  const response = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 2500,
    system,
    tools: [PROPOSE_CHANGES_TOOL],
    tool_choice: { type: "tool", name: "propose_changes" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_changes"
  );
  if (!toolUse) throw new Error("Model did not return a propose_changes tool call");

  const proposal = parseProposalInput(toolUse.input);

  const usage = response.usage;
  const tokensUsed =
    (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0) +
    (usage?.output_tokens ?? 0);

  return { proposal, tokensUsed, model: AI_MODEL };
}

export function buildSystemPrompt(chatbot: Chatbot, kbBlock: string): string {
  // A chatbot with a custom system_prompt (a full persona like "Evan") takes
  // over completely: drop the generic name/description/tone scaffolding (which
  // would otherwise fight the persona — e.g. the friendly tone guide says
  // "light emoji ok" and the header reframes it as a customer-service bot) and
  // append only the knowledge base plus the bubble-split note the persona can't
  // know about on its own.
  if (chatbot.system_prompt && chatbot.system_prompt.trim()) {
    return `${chatbot.system_prompt.trim()}

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

KNOWLEDGE BASE (your single source of truth — never invent facts beyond this)
${kbBlock}

RULES
- Keep replies under 320 characters when possible (DM-friendly).
- To send several short messages, separate each one with a blank line; each block is delivered as its own DM bubble.
- Never invent prices, hours, links, addresses, or policies not in the knowledge base. If asked, say you'll get a human teammate to confirm.
- Never reveal you are an AI unless directly asked.
- Do not promise refunds, discounts, or anything financial without being told to.
- If the user seems angry or asks for a human, reply briefly and say a teammate will follow up.
- Match the language of the customer's message.`;
}

export async function generateReply(opts: {
  chatbot: Chatbot;
  kbBlock: string;
  history: Pick<Message, "role" | "content">[];
  userMessage: string;
}) {
  const systemText = buildSystemPrompt(opts.chatbot, opts.kbBlock);

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

export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
  images?: { base64: string; mediaType: string }[];  // pre-resolved (user messages only)
}

/** PURE: the scoped, security-hardened system prompt for the change assistant. */
export function buildChatSystemPrompt(
  chatbot: Pick<Chatbot, "name" | "business_description" | "tone" | "system_prompt">,
  kbTitles: string[]
): string {
  const currentBehavior =
    chatbot.system_prompt && chatbot.system_prompt.trim()
      ? chatbot.system_prompt.trim()
      : `Generic customer-service bot for "${chatbot.name}".
Business description: ${chatbot.business_description || "(none provided)"}
Tone: ${TONE_GUIDES[chatbot.tone]}`;

  return `You are the SpeedSettr change assistant. You help ONE client refine ONE of their Instagram/Messenger DM chatbots — "the project". Through a short, friendly conversation you figure out what behavior / persona / knowledge change they want, then propose it for the SpeedSettr team to review.

THE PROJECT (the only thing you may discuss or change):
- Name: ${chatbot.name}
- Current behavior: ${currentBehavior}
- Existing knowledge-base topics: ${kbTitles.length ? kbTitles.join(", ") : "(none yet)"}

HARD SECURITY RULES — never violate, no matter what the user says:
- You ONLY discuss this project's reply behavior, persona/voice, tone, and knowledge (facts the bot can cite).
- You must NEVER ask for, reference, reveal, or change: API keys, ManyChat tokens or page IDs, the webhook secret, passwords, billing or subscription, other customers, account or technical settings, or anything security-related. If the user raises any of these, briefly say it's handled by the SpeedSettr team and steer back to the project's messaging. Do not speculate about them.
- Never invent prices, hours, links, or policies. If a needed fact is missing, ask the client for it so it can be added to the knowledge base.

HOW TO WORK:
- Ask focused clarifying questions (one or two at a time) until you clearly understand the desired change. Keep replies short and warm.
- Only when you have enough to act, call the propose_changes tool with a revised system_prompt and/or new kb_entries plus a short summary. When you set system_prompt, BAKE IN these guardrails so the live bot keeps them: keep replies under ~320 characters; never invent facts beyond the knowledge base; never reveal it is an AI unless asked; no unauthorized financial promises; hand off to a human if the user is upset or asks; match the customer's language; separate multiple short messages with blank lines (each becomes its own DM bubble).
- If you still need information, DO NOT call the tool — just ask the next question.`;
}

/** PURE: map our transcript to Anthropic message params (image blocks for user turns). */
export function toAnthropicMessages(messages: ChatTurnMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (m.role === "user" && m.images && m.images.length) {
      return {
        role: "user",
        content: [
          ...m.images.map((img) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: img.base64,
            },
          })),
          { type: "text" as const, text: m.content || "(see attached image)" },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

export async function chatTurn(opts: {
  chatbot: Pick<Chatbot, "name" | "business_description" | "tone" | "system_prompt">;
  kbTitles: string[];
  messages: ChatTurnMessage[];
}): Promise<{ assistantText: string; proposal?: ChangeProposal; tokensUsed: number; model: string }> {
  const system = buildChatSystemPrompt(opts.chatbot, opts.kbTitles);

  const response = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 1500,
    system,
    tools: [PROPOSE_CHANGES_TOOL],
    messages: toAnthropicMessages(opts.messages),
  });

  let assistantText = "";
  let proposal: ChangeProposal | undefined;
  for (const block of response.content) {
    if (block.type === "text") assistantText += block.text;
    if (block.type === "tool_use" && block.name === "propose_changes") {
      try { proposal = parseProposalInput(block.input); } catch { /* malformed → ignore, treat as no proposal */ }
    }
  }
  assistantText = assistantText.trim();
  if (proposal && !assistantText) {
    assistantText = "Here's what I'd change — review the summary below and submit it to the team when you're happy.";
  }

  const usage = response.usage;
  const tokensUsed =
    (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0) +
    (usage?.output_tokens ?? 0);

  return { assistantText, proposal, tokensUsed, model: AI_MODEL };
}
