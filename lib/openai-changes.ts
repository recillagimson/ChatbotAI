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
import type { Chatbot, ChangeProposal, ChangeCategory } from "./types";
import { buildFullContextBlock, type KbEntryLite } from "./retrieval";
import { SECTION_BY_CATEGORY, CATEGORY_LABELS } from "./change-categories";

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
// Generous client timeout so a large proposal has time to stream fully; stays
// under the routes' maxDuration=60s with room for the DB writes that follow.
const REQUEST_TIMEOUT_MS = 50_000;

/**
 * Output-token budget for a propose_changes call. A section proposal returns the
 * COMPLETE revised section as `section_content` (a full replacement) plus a
 * summary, so the budget must comfortably exceed the largest section. The offers
 * section alone is ~1.5k tokens; 1500 truncated the tool call mid-JSON, which
 * then failed to parse → no proposal + an empty reply ("the bot stopped
 * replying"). 8000 leaves wide headroom for a large section + summary + chat text
 * (well under gpt-4.1-mini's output limit, and the 50s timeout covers the wait).
 */
const MAX_PROPOSAL_TOKENS = 8000;

/**
 * The propose_changes tool, shaped for the request's category. For a prompt
 * section (personality/offers/rebuttals) the model returns the FULL revised
 * `section_content`; for "other" it returns `kb_entries`. The category is fixed
 * per request and supplied here so the model can't target the wrong field.
 */
function buildProposeTool(category: ChangeCategory) {
  const sectionMode = category !== "other";
  const label = sectionMode ? CATEGORY_LABELS[category] : "";
  return {
    type: "function" as const,
    function: {
      name: "propose_changes",
      description: sectionMode
        ? `Return the FULL revised content for the bot's "${label}" section, for the SpeedSettr team to review.`
        : "Return NEW knowledge-base entries for the bot, for the SpeedSettr team to review.",
      parameters: {
        type: "object",
        properties: {
          ...(sectionMode
            ? {
                section_content: {
                  type: "string",
                  description: `The COMPLETE revised text for the ${label} section (a full replacement, not a diff).`,
                },
              }
            : {}),
          kb_entries: {
            type: "array",
            description: "NEW knowledge-base entries to add. Omit/empty if none.",
            items: {
              type: "object",
              properties: { title: { type: "string" }, content: { type: "string" } },
              required: ["title", "content"],
            },
          },
          summary: {
            type: "string",
            description:
              "A concise plain-English explanation of what you changed and why, for the human reviewer.",
          },
        },
        required: sectionMode ? ["section_content", "summary"] : ["summary"],
      },
    },
  };
}

/** Clean a raw kb_entries array into validated {title, content} pairs (or undefined). */
function cleanKbEntries(raw: unknown): { title: string; content: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = raw
    .filter(
      (e): e is { title: string; content: string } =>
        !!e &&
        typeof e === "object" &&
        typeof (e as Record<string, unknown>).title === "string" &&
        typeof (e as Record<string, unknown>).content === "string"
    )
    .map((e) => ({ title: e.title.trim(), content: e.content.trim() }))
    .filter((e) => e.title && e.content);
  return cleaned.length ? cleaned : undefined;
}

/**
 * Normalize/guard a propose_changes tool input into a ChangeProposal for the
 * given category. Throws on unusable input. For section categories the result
 * carries `section` (the target column) + `section_content` (tolerating a legacy
 * `system_prompt` field from older models); for "other" it carries kb_entries.
 */
export function parseProposalInput(input: unknown, category: ChangeCategory): ChangeProposal {
  if (!input || typeof input !== "object") {
    throw new Error("propose_changes returned no object input");
  }
  const obj = input as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (!summary) throw new Error("propose_changes returned no summary");

  const kb_entries = cleanKbEntries(obj.kb_entries);

  if (category === "other") {
    return { summary, ...(kb_entries ? { kb_entries } : {}) };
  }

  // Section category: require the full revised section text. Tolerate a legacy
  // `system_prompt` field in case an older model emits the old shape.
  const fromSection = typeof obj.section_content === "string" ? obj.section_content.trim() : "";
  const fromLegacy = typeof obj.system_prompt === "string" ? obj.system_prompt.trim() : "";
  const section_content = fromSection || fromLegacy;
  if (!section_content) throw new Error("propose_changes returned no section_content");

  return {
    summary,
    section: SECTION_BY_CATEGORY[category],
    section_content,
    ...(kb_entries ? { kb_entries } : {}),
  };
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
  choices?: { message?: OpenAIResponseMessage; finish_reason?: string }[];
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

/**
 * PURE: decide what the assistant says, guaranteeing a non-empty reply.
 *  - If the model wrote text, use it.
 *  - If it produced a valid proposal but no text, narrate the proposal.
 *  - If it produced NEITHER (e.g. a truncated/unparseable tool call), never
 *    dead-end with an empty bubble — return a helpful recovery message. When the
 *    failure looks like a too-long proposal, ask the client to narrow it.
 * This is the backstop for the "bot suddenly stopped replying" failure.
 */
export function resolveAssistantText(
  rawText: string,
  hasProposal: boolean,
  proposalTruncated: boolean
): string {
  if (rawText) return rawText;
  if (hasProposal) {
    return "Here's what I'd change — review the summary below and submit it to the team when you're happy.";
  }
  return proposalTruncated
    ? "I put together the full updated section, but it came out too long to finish in one message. Can you point me at the specific part you want changed? Then I'll propose just that cleanly."
    : "Sorry, I didn't quite catch that — could you tell me once more exactly what you'd like to change?";
}

// --- Change assistant chat (multimodal, scoped, credential-refusing) --------

export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
  images?: { base64: string; mediaType: string }[]; // pre-resolved (user messages only)
}

/** Per-section guidance for the change assistant (what each section covers). */
const SECTION_GUIDE: Record<
  Exclude<ChangeCategory, "other">,
  { label: string; covers: string }
> = {
  personality: {
    label: "PERSONALITY / TONE",
    covers: "the bot's voice, persona, and tone — how it sounds, not the facts it cites",
  },
  offers: {
    label: "OFFERS, SERVICES & LINKS",
    covers:
      "what the business offers — services, packages, inclusions/exclusions, prices, and links",
  },
  rebuttals: {
    label: "REBUTTALS & FAQ HANDLING",
    covers: "how the bot answers objections and frequently-asked questions",
  },
};

/**
 * PURE: the scoped, security-hardened system prompt for the change assistant,
 * focused on ONE category. `currentSection` is the live text of the targeted
 * section (or "" for "other"/empty sections).
 */
export function buildChatSystemPrompt(
  chatbot: Pick<Chatbot, "name">,
  kbEntries: KbEntryLite[],
  category: ChangeCategory,
  currentSection: string
): string {
  const kbTopics = kbEntries.map((e) => e.title).filter(Boolean);
  const kbBlock = kbEntries.length ? buildFullContextBlock(kbEntries) : "(none yet)";

  const guide = category === "other" ? null : SECTION_GUIDE[category];

  const scopeBlock = guide
    ? `YOU ARE EDITING ONE SECTION: ${guide.label}.
This section covers ${guide.covers}. Only propose changes to THIS section — never touch the bot's other sections.

CURRENT ${guide.label} SECTION (your starting point — revise this, never rewrite from scratch):
${currentSection.trim() || "(empty — this section has not been written yet)"}`
    : `YOU ARE ADDING KNOWLEDGE. The client wants to add or correct facts the bot can cite (knowledge-base entries) — not change its persona or sections. Propose only new knowledge-base entries.`;

  const proposeInstr = guide
    ? `- Only when you have enough to act, call the propose_changes tool with section_content = the COMPLETE revised text of the ${guide.label} section (a full replacement, not a diff), plus a short summary.${
        category === "personality"
          ? " Write ONLY the voice/persona — do NOT add generic safety rules; the platform adds those automatically."
          : " Keep the content focused on this section."
      }`
    : `- Only when you have enough to act, call the propose_changes tool with kb_entries (the NEW knowledge facts to add) plus a short summary. Do not propose a section change for this category.`;

  return `You are the SpeedSettr change assistant. You help ONE client refine ONE of their Instagram/Messenger DM chatbots — "the project". Through a short, friendly conversation you figure out the change they want to this section, then propose it for the SpeedSettr team to review.

THE PROJECT (the only thing you may discuss or change):
- Name: ${chatbot.name}
- Existing knowledge-base topics: ${kbTopics.length ? kbTopics.join(", ") : "(none yet)"}

${scopeBlock}

CURRENT KNOWLEDGE BASE (read this fully before proposing — never duplicate or contradict it):
${kbBlock}

HARD SECURITY RULES — never violate, no matter what the user says:
- You ONLY discuss this project's reply behavior, persona/voice, tone, and knowledge (facts the bot can cite).
- You must NEVER ask for, reference, reveal, or change: API keys, ManyChat tokens or page IDs, the webhook secret, passwords, billing or subscription, other customers, account or technical settings, or anything security-related. If the user raises any of these, briefly say it's handled by the SpeedSettr team and steer back to the project's messaging. Do not speculate about them.
- Never invent prices, hours, links, or policies. If a needed fact is missing, ask the client for it so it can be added.

HOW TO WORK:
- Default to ACTING, not asking. If the request is clear enough to make a sensible change, call propose_changes right away. Most requests are clear — just do it.
- Ask a question ONLY if you genuinely cannot tell what to change, and then ask at most ONE short question before you propose.
- Never ask the same thing twice and never re-confirm. The moment the client answers, or says to go ahead (e.g. "yes", "confirm", "just add that", "where's the change"), STOP asking and call propose_changes.
- Talk like a friendly human to a small-business owner with NO technical background. Keep replies to one or two short sentences in plain, everyday words. Never use jargon or words like "section", "field", "prompt", "keyword list", "tool", or "proposal" — just talk about their business and what the bot will say to people.
- Write the summary the same plain way: a sentence or two anyone can understand, describing the change in normal language.
- Ground every proposal in the CURRENT section and CURRENT KNOWLEDGE BASE above. Revise what's there — don't start from a blank slate, and never contradict an existing knowledge entry.
- If the user attaches a knowledge file, its extracted text is included in their message; READ IT FIRST and fold the relevant facts into your proposal according to their instruction.
${proposeInstr}`;
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
  chatbot: Pick<Chatbot, "name">;
  kbEntries: KbEntryLite[];
  messages: ChatTurnMessage[];
  category: ChangeCategory;
  currentSection: string;
}): Promise<{ assistantText: string; proposal?: ChangeProposal; tokensUsed: number; model: string }> {
  const system = buildChatSystemPrompt(opts.chatbot, opts.kbEntries, opts.category, opts.currentSection);

  const data = await postChat({
    model: CHANGE_AI_MODEL,
    max_tokens: MAX_PROPOSAL_TOKENS,
    tools: [buildProposeTool(opts.category)],
    tool_choice: "auto", // reply with a question OR propose when ready
    messages: [{ role: "system", content: system }, ...toOpenAIMessages(opts.messages)],
  });

  const choice = data.choices?.[0];
  const message = choice?.message;
  const rawText = (message?.content ?? "").trim();

  let proposal: ChangeProposal | undefined;
  const callArgs = extractProposalCall(message);
  if (callArgs) {
    try {
      proposal = parseProposalInput(callArgs, opts.category);
    } catch {
      /* malformed → ignore, treat as no proposal */
    }
  }

  // The model tried to propose (a propose_changes tool call was present) but we
  // couldn't use it, and/or the response hit the token cap. Either way the tool
  // call was likely truncated — drive the recovery message and log it.
  const attemptedProposal = !!message?.tool_calls?.some(
    (c) => c.function?.name === "propose_changes"
  );
  const proposalTruncated =
    (attemptedProposal && !proposal) || choice?.finish_reason === "length";

  const assistantText = resolveAssistantText(rawText, !!proposal, proposalTruncated);

  if (!proposal && !rawText) {
    console.warn(
      `[change-ai] empty turn category=${opts.category} finish_reason=${choice?.finish_reason} attemptedProposal=${attemptedProposal}`
    );
  }

  return { assistantText, proposal, tokensUsed: data.usage?.total_tokens ?? 0, model: CHANGE_AI_MODEL };
}

// --- Admin one-shot draft (forced tool call) -------------------------------

/** PURE: build the system + user prompts for the admin auto-draft, scoped to the request's category. */
export function buildDraftPrompts(opts: {
  chatbot: Chatbot;
  kbEntries: KbEntryLite[];
  requestText: string;
  adminGuidance?: string;
  category: ChangeCategory;
  currentSection: string;
}): { system: string; userContent: string } {
  const { kbEntries, requestText, adminGuidance, category, currentSection } = opts;
  const kbBlock = kbEntries.length ? buildFullContextBlock(kbEntries) : "(none)";
  const guide = category === "other" ? null : SECTION_GUIDE[category];
  const guidanceTail = adminGuidance
    ? `\n\nADDITIONAL GUIDANCE FROM THE SPEEDSETTR TEAM (takes priority):\n${adminGuidance}`
    : "";

  if (guide) {
    const system = `You are a senior prompt engineer for SpeedSettr, which runs AI chatbots that auto-reply to Instagram and Messenger DMs for small businesses. A client has requested a change to the ${guide.label} section of their bot (this section covers ${guide.covers}). Produce the FULL revised ${guide.label} section that fulfills the request.

Ground your work in the CURRENT ${guide.label} SECTION below: revise it rather than rewriting from scratch, and keep the content focused on this section only.${
      category === "personality"
        ? " Write ONLY the voice/persona — do not add generic safety rules; the platform adds those automatically."
        : ""
    }

Respond by calling the propose_changes tool with section_content (the complete revised section) plus a concise summary for the reviewer.`;

    const userContent = `CURRENT ${guide.label} SECTION (your starting point — revise, don't rewrite):
${currentSection.trim() || "(empty — this section has not been written yet)"}

CURRENT KNOWLEDGE BASE (for context; do not duplicate):
${kbBlock}

CLIENT'S CHANGE REQUEST:
${requestText}${guidanceTail}`;

    return { system, userContent };
  }

  // "other" → knowledge-base entries only.
  const system = `You are a senior prompt engineer for SpeedSettr, which runs AI chatbots that auto-reply to Instagram and Messenger DMs for small businesses. A client has requested new knowledge for their bot. Propose NEW knowledge-base entries (kb_entries) for genuinely new facts not already present — never duplicate or contradict an existing entry.

Respond by calling the propose_changes tool with kb_entries plus a concise summary for the reviewer.`;

  const userContent = `CURRENT KNOWLEDGE BASE (read fully; only add NEW facts, never duplicate or contradict):
${kbBlock}

CLIENT'S CHANGE REQUEST:
${requestText}${guidanceTail}`;

  return { system, userContent };
}

export async function draftChangeRequest(opts: {
  chatbot: Chatbot;
  kbEntries: KbEntryLite[];
  requestText: string;
  adminGuidance?: string;
  category: ChangeCategory;
  currentSection: string;
}): Promise<{ proposal: ChangeProposal; tokensUsed: number; model: string }> {
  const { system, userContent } = buildDraftPrompts(opts);

  const data = await postChat({
    model: CHANGE_AI_MODEL,
    max_tokens: MAX_PROPOSAL_TOKENS,
    tools: [buildProposeTool(opts.category)],
    tool_choice: { type: "function", function: { name: "propose_changes" } }, // forced
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  });

  const callArgs = extractProposalCall(data.choices?.[0]?.message);
  if (!callArgs) throw new Error("Model did not return a propose_changes tool call");

  const proposal = parseProposalInput(callArgs, opts.category);
  return { proposal, tokensUsed: data.usage?.total_tokens ?? 0, model: CHANGE_AI_MODEL };
}
