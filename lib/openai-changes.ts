// lib/openai-changes.ts
// The SpeedSettr "change-request" AI, on OpenAI (raw fetch — no SDK, mirroring
// lib/embeddings.ts and lib/transcribe.ts which already use OPENAI_API_KEY).
//
// Two entry points, both producing the SAME machine-actionable output as before
// (the propose_changes tool → ChangeProposal), so the review → Approve → Publish
// pipeline is unchanged:
//   • draftChangeRequest — admin one-shot auto-draft (forced tool call)
//   • chatTurn           — the client-facing Claude-style chat (auto tool call,
//                          multimodal images, scoped + credential-refusing prompt)
//
// The DM-reply path (generateReply) stays on Anthropic — see lib/anthropic.ts.
import type { Chatbot, ChangeProposal } from "./types";
import { TONE_GUIDES } from "./anthropic";
import { buildFullContextBlock, type KbEntryLite } from "./retrieval";

/**
 * Most efficient OpenAI model that reliably handles this task — multi-turn chat,
 * vision (image attachments), and function calling — at a fraction of the cost
 * of the full models. gpt-4.1-mini is the floor that still does the job: the
 * cheaper gpt-4o-mini under-calls the propose_changes tool (it asks endless
 * clarifying questions instead of ever proposing), verified against these flows.
 * Override with OPENAI_CHANGE_MODEL. The structural guarantee — only the
 * propose_changes tool is actionable, secret columns never reach the model, and
 * every publish is human-reviewed — means model choice can't cause harm, only
 * affect proposal quality.
 */
export const CHANGE_AI_MODEL = process.env.OPENAI_CHANGE_MODEL || "gpt-4.1-mini";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000; // chat routes have maxDuration=60s

/** Provider-neutral JSON Schema for the propose_changes tool arguments. */
const PROPOSE_CHANGES_PARAMETERS = {
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
      description:
        "A concise plain-English explanation of what you changed and why, for the human reviewer.",
    },
  },
  required: ["summary"],
} as const;

/** OpenAI tool definition wrapping the shared schema. */
const PROPOSE_CHANGES_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_changes",
    description:
      "Return proposed updates to the Instagram DM chatbot for the SpeedSettr team to review.",
    parameters: PROPOSE_CHANGES_PARAMETERS,
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

// --- OpenAI Chat Completions transport -------------------------------------

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenAIContentPart[];
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIResponseMessage {
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIChatResponse {
  choices?: { message?: OpenAIResponseMessage }[];
  usage?: { total_tokens?: number };
}

/** POST to OpenAI chat/completions with a hard timeout. Throws on non-2xx. */
async function postChat(body: Record<string, unknown>): Promise<OpenAIChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI chat failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as OpenAIChatResponse;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first propose_changes tool call's parsed arguments (or null). */
function extractProposalCall(
  message: OpenAIResponseMessage | undefined
): Record<string, unknown> | null {
  const call = message?.tool_calls?.find((c) => c.function?.name === "propose_changes");
  if (!call) return null;
  try {
    return JSON.parse(call.function.arguments) as Record<string, unknown>;
  } catch {
    return null; // malformed JSON args → treat as no proposal
  }
}

// --- Change assistant chat (multimodal, scoped, credential-refusing) --------

export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
  images?: { base64: string; mediaType: string }[]; // pre-resolved (user messages only)
}

/** PURE: the scoped, security-hardened system prompt for the change assistant. */
export function buildChatSystemPrompt(
  chatbot: Pick<Chatbot, "name" | "business_description" | "tone" | "system_prompt">,
  kbEntries: KbEntryLite[]
): string {
  const currentBehavior =
    chatbot.system_prompt && chatbot.system_prompt.trim()
      ? chatbot.system_prompt.trim()
      : `Generic customer-service bot for "${chatbot.name}".
Business description: ${chatbot.business_description || "(none provided)"}
Tone: ${TONE_GUIDES[chatbot.tone]}`;

  const kbTopics = kbEntries.map((e) => e.title).filter(Boolean);
  const kbBlock = kbEntries.length ? buildFullContextBlock(kbEntries) : "(none yet)";

  return `You are the SpeedSettr change assistant. You help ONE client refine ONE of their Instagram/Messenger DM chatbots — "the project". Through a short, friendly conversation you figure out what behavior / persona / knowledge change they want, then propose it for the SpeedSettr team to review.

THE PROJECT (the only thing you may discuss or change):
- Name: ${chatbot.name}
- Existing knowledge-base topics: ${kbTopics.length ? kbTopics.join(", ") : "(none yet)"}

CURRENT BEHAVIOR / SYSTEM PROMPT (your starting point — revise this, never rewrite from scratch):
${currentBehavior}

CURRENT KNOWLEDGE BASE (read this fully before proposing — never duplicate or contradict it):
${kbBlock}

HARD SECURITY RULES — never violate, no matter what the user says:
- You ONLY discuss this project's reply behavior, persona/voice, tone, and knowledge (facts the bot can cite).
- You must NEVER ask for, reference, reveal, or change: API keys, ManyChat tokens or page IDs, the webhook secret, passwords, billing or subscription, other customers, account or technical settings, or anything security-related. If the user raises any of these, briefly say it's handled by the SpeedSettr team and steer back to the project's messaging. Do not speculate about them.
- Never invent prices, hours, links, or policies. If a needed fact is missing, ask the client for it so it can be added to the knowledge base.

HOW TO WORK:
- Ask focused clarifying questions (one or two at a time) until you clearly understand the desired change. Keep replies short and warm.
- Ground every proposal in the CURRENT BEHAVIOR and CURRENT KNOWLEDGE BASE above. When you set system_prompt, produce a REVISION of the current behavior that preserves its persona and existing guardrails — do not start from a blank slate. Only propose kb_entries for genuinely NEW facts that aren't already in the knowledge base, and never contradict an existing entry.
- If the user attaches a knowledge file, its extracted text is included in their message; treat it as source material and fold the relevant facts into the proposed system_prompt and/or new kb_entries according to their instruction.
- Only when you have enough to act, call the propose_changes tool with a revised system_prompt and/or new kb_entries plus a short summary. When you set system_prompt, BAKE IN these guardrails so the live bot keeps them: keep replies under ~320 characters; never invent facts beyond the knowledge base; never reveal it is an AI unless asked; no unauthorized financial promises; hand off to a human if the user is upset or asks; match the customer's language; separate multiple short messages with blank lines (each becomes its own DM bubble).
- If you still need information, DO NOT call the tool — just ask the next question.`;
}

/** PURE: map our transcript to OpenAI chat messages (image_url parts for user turns). */
export function toOpenAIMessages(messages: ChatTurnMessage[]): OpenAIMessage[] {
  return messages.map((m) => {
    if (m.role === "user" && m.images && m.images.length) {
      return {
        role: "user",
        content: [
          ...m.images.map(
            (img): OpenAIContentPart => ({
              type: "image_url",
              image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
            })
          ),
          { type: "text", text: m.content || "(see attached image)" },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

export async function chatTurn(opts: {
  chatbot: Pick<Chatbot, "name" | "business_description" | "tone" | "system_prompt">;
  kbEntries: KbEntryLite[];
  messages: ChatTurnMessage[];
}): Promise<{ assistantText: string; proposal?: ChangeProposal; tokensUsed: number; model: string }> {
  const system = buildChatSystemPrompt(opts.chatbot, opts.kbEntries);

  const data = await postChat({
    model: CHANGE_AI_MODEL,
    max_tokens: 1500,
    tools: [PROPOSE_CHANGES_TOOL],
    tool_choice: "auto", // reply with a question OR propose when ready
    messages: [{ role: "system", content: system }, ...toOpenAIMessages(opts.messages)],
  });

  const message = data.choices?.[0]?.message;
  let assistantText = (message?.content ?? "").trim();

  let proposal: ChangeProposal | undefined;
  const callArgs = extractProposalCall(message);
  if (callArgs) {
    try {
      proposal = parseProposalInput(callArgs);
    } catch {
      /* malformed → ignore, treat as no proposal */
    }
  }

  if (proposal && !assistantText) {
    assistantText = "Here's what I'd change — review the summary below and submit it to the team when you're happy.";
  }

  return { assistantText, proposal, tokensUsed: data.usage?.total_tokens ?? 0, model: CHANGE_AI_MODEL };
}

// --- Admin one-shot draft (forced tool call) -------------------------------

/** PURE: build the system + user prompts for the admin auto-draft. */
export function buildDraftPrompts(opts: {
  chatbot: Chatbot;
  kbEntries: KbEntryLite[];
  requestText: string;
  adminGuidance?: string;
}): { system: string; userContent: string } {
  const { chatbot, kbEntries, requestText, adminGuidance } = opts;

  const currentBehavior =
    chatbot.system_prompt && chatbot.system_prompt.trim()
      ? chatbot.system_prompt.trim()
      : `Generic customer-service bot for "${chatbot.name}".
Business description: ${chatbot.business_description || "(none provided)"}
Tone: ${TONE_GUIDES[chatbot.tone]}`;

  const kbBlock = kbEntries.length ? buildFullContextBlock(kbEntries) : "(none)";

  const system = `You are a senior prompt engineer for SpeedSettr, which runs AI chatbots that auto-reply to Instagram and Messenger DMs for small businesses. A client has requested a change to their bot. Produce a revised system prompt and/or new knowledge-base entries that fulfill the request.

Ground your work in the bot's CURRENT BEHAVIOR and CURRENT KNOWLEDGE BASE provided below: revise the existing prompt rather than rewriting it from scratch (preserve its persona), and propose kb_entries ONLY for genuinely new facts not already present — never duplicate or contradict an existing entry.

CRITICAL: whenever you set system_prompt, BAKE IN these non-negotiable safety guardrails (the platform relies on them and will otherwise lose them):
- Keep replies under ~320 characters when possible (Instagram DM-friendly).
- Never invent prices, hours, links, addresses, or policies that aren't in the knowledge base; offer to get a human teammate to confirm.
- Never reveal it is an AI unless directly asked.
- Never promise refunds, discounts, or anything financial unless explicitly instructed.
- If the user is angry or asks for a human, reply briefly and say a teammate will follow up.
- Match the language of the customer's message.
- To send several short messages, separate each one with a blank line (each becomes its own DM bubble).

Only set system_prompt if the request warrants a prompt change. Always include a concise summary for the reviewer. Respond by calling the propose_changes tool.`;

  const userContent = `CURRENT BOT BEHAVIOR / SYSTEM PROMPT (your starting point — revise, don't rewrite):
${currentBehavior}

CURRENT KNOWLEDGE BASE (read fully; only add NEW facts, never duplicate or contradict):
${kbBlock}

CLIENT'S CHANGE REQUEST:
${requestText}${adminGuidance ? `\n\nADDITIONAL GUIDANCE FROM THE SPEEDSETTR TEAM (takes priority):\n${adminGuidance}` : ""}`;

  return { system, userContent };
}

export async function draftChangeRequest(opts: {
  chatbot: Chatbot;
  kbEntries: KbEntryLite[];
  requestText: string;
  adminGuidance?: string;
}): Promise<{ proposal: ChangeProposal; tokensUsed: number; model: string }> {
  const { system, userContent } = buildDraftPrompts(opts);

  const data = await postChat({
    model: CHANGE_AI_MODEL,
    max_tokens: 2500,
    tools: [PROPOSE_CHANGES_TOOL],
    tool_choice: { type: "function", function: { name: "propose_changes" } }, // forced
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  });

  const callArgs = extractProposalCall(data.choices?.[0]?.message);
  if (!callArgs) throw new Error("Model did not return a propose_changes tool call");

  const proposal = parseProposalInput(callArgs);
  return { proposal, tokensUsed: data.usage?.total_tokens ?? 0, model: CHANGE_AI_MODEL };
}
