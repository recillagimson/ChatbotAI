// lib/openai-changes.ts
// The SpeedSettr "change-request" AI, on OpenAI (raw fetch - no SDK, mirroring
// lib/embeddings.ts and lib/transcribe.ts which already use OPENAI_API_KEY).
//
// Two entry points, both producing the SAME machine-actionable output (the
// propose_changes tool -> ChangeProposal), so the review -> Approve -> Publish
// pipeline is unchanged:
//   • draftChangeRequest - admin one-shot auto-draft (forced tool call)
//   • chatTurn           - the client-facing chat (auto tool call, multimodal
//                          images, scoped + credential-refusing prompt)
//
// Section changes are TARGETED EDITS (find a passage, replace it; or append),
// applied by lib/section-edits.ts - never a whole rewritten section, which on
// real bots (sections up to ~100k characters) is longer than one reply can hold.
// A whole new text is only accepted for an empty or short section.
import type {
  Chatbot,
  ChangeProposal,
  ChangeCategory,
  SectionColumn,
  SectionEdit,
  TextEdit,
} from "./types";
import { buildFullContextBlock, type KbEntryLite } from "./retrieval";
import {
  SECTION_BY_CATEGORY,
  CATEGORY_LABELS,
  ALL_SECTION_COLUMNS,
  SECTION_LABELS,
} from "./change-categories";
import { MODELS } from "./model-tiers";
import { applyTextEdits, sectionFingerprint, FULL_REWRITE_MAX_CHARS } from "./section-edits";

/** Current text of all three editable sections - the context an "overall" request revises. */
export interface SectionsContext {
  persona_section: string;
  offers_section: string;
  rebuttals_section: string;
}

/** Human labels for the three sections inside the "overall" prompt/scope. */
const OVERALL_SECTION_HEADINGS: Record<SectionColumn, string> = {
  persona_section: "PERSONALITY / TONE - the bot's voice and tone (how it sounds)",
  offers_section: "OFFERS, SERVICES & LINKS - services, packages, inclusions/exclusions, prices, links",
  rebuttals_section: "REBUTTALS & FAQ HANDLING - how it answers objections and common questions",
};

/** Render the "current sections" block shared by the overall chat + draft prompts. */
function renderOverallSections(sections?: SectionsContext): string {
  const s = sections ?? { persona_section: "", offers_section: "", rebuttals_section: "" };
  return ALL_SECTION_COLUMNS.map(
    (col) => `--- ${OVERALL_SECTION_HEADINGS[col]} ---\n${(s[col] ?? "").trim() || "(empty - not written yet)"}`
  ).join("\n\n");
}

/**
 * Most efficient OpenAI model that reliably handles this task - multi-turn chat,
 * vision (image attachments), and function calling - at a fraction of the cost
 * of the full models. The helper-tier model is the floor that still does the
 * job: the cheaper gpt-4o-mini under-calls the propose_changes tool (it asks
 * endless clarifying questions instead of ever proposing), verified against
 * these flows. Override with OPENAI_CHANGE_MODEL. The structural guarantee -
 * only the propose_changes tool is actionable, secret columns never reach the
 * model, and every publish is human-reviewed - means model choice can't cause
 * harm, only affect proposal quality.
 */
export const CHANGE_AI_MODEL = MODELS.change();

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
// One deadline for a whole proposal (first call + its one repair round), inside the
// calling routes' maxDuration=60s with room for the DB writes that follow. The
// repair gets whatever the first call left, and is skipped below MIN_REPAIR_MS -
// two independent 50s timeouts could overrun the route and die as a bare platform
// timeout instead of the route's own error message.
const PROPOSAL_BUDGET_MS = 50_000;
const MIN_REPAIR_MS = 12_000;

/**
 * Output-token budget for a propose_changes call. Proposals are targeted edits
 * now, so this is headroom for many edits plus the chat text, not for a whole
 * section. (It was sized for whole sections before; a 1500 budget once truncated
 * the tool call mid-JSON.)
 */
const MAX_PROPOSAL_TOKENS = 8000;

const KB_ENTRIES_SCHEMA = {
  type: "array",
  description: "NEW knowledge-base entries to add. Omit/empty if none.",
  items: {
    type: "object",
    properties: { title: { type: "string" }, content: { type: "string" } },
    required: ["title", "content"],
  },
} as const;

const SUMMARY_SCHEMA = {
  type: "string",
  description:
    "A concise plain-English explanation of what you changed and why, for the human reviewer.",
} as const;

const EDITS_SCHEMA = {
  type: "array",
  description:
    "Targeted changes. For each one: `find` = a passage copied WORD FOR WORD from the current text (a whole sentence or line, long enough to appear only once); `replace` = what it should say instead (an empty string deletes it).",
  items: {
    type: "object",
    properties: { find: { type: "string" }, replace: { type: "string" } },
    required: ["find", "replace"],
  },
} as const;

const APPEND_SCHEMA = {
  type: "string",
  description: "New text to add at the END of this part (optional).",
} as const;

function fullTextSchema(label: string) {
  return {
    type: "string",
    description: `ONLY when the current ${label} text is empty or shorter than ${FULL_REWRITE_MAX_CHARS} characters: its complete new text. Otherwise leave this out and use edits / append.`,
  } as const;
}

/**
 * The propose_changes tool, shaped for the request's category:
 *  - a prompt section (personality/offers/rebuttals): targeted `edits` and/or
 *    `append` for that one section (a whole `section_content` only when short);
 *  - "other": `kb_entries` only;
 *  - "overall": a `sections` array (each affected section with its own edits)
 *    and/or `kb_entries` - the model picks which parts the request touches.
 * The category is fixed per request and supplied here so the model can't target
 * the wrong field.
 */
function buildProposeTool(category: ChangeCategory) {
  if (category === "overall") {
    return {
      type: "function" as const,
      function: {
        name: "propose_changes",
        description:
          "Propose changes to ANY of the bot's parts your change affects (personality/voice, offers, rebuttals/FAQ) and/or NEW knowledge-base entries, for the SpeedSettr team to review. Include ONLY the parts you actually change.",
        parameters: {
          type: "object",
          properties: {
            sections: {
              type: "array",
              description:
                "Each part your change affects, with targeted edits to it. Omit any part you do not change.",
              items: {
                type: "object",
                properties: {
                  section: {
                    type: "string",
                    enum: ALL_SECTION_COLUMNS,
                    description:
                      "Which part this changes: persona_section (voice/tone), offers_section (services/prices/links), or rebuttals_section (objections/FAQs).",
                  },
                  edits: EDITS_SCHEMA,
                  append: APPEND_SCHEMA,
                  section_content: fullTextSchema("part's"),
                },
                required: ["section"],
              },
            },
            kb_entries: KB_ENTRIES_SCHEMA,
            summary: SUMMARY_SCHEMA,
          },
          required: ["summary"],
        },
      },
    };
  }

  const sectionMode = category !== "other";
  const label = sectionMode ? CATEGORY_LABELS[category] : "";
  return {
    type: "function" as const,
    function: {
      name: "propose_changes",
      description: sectionMode
        ? `Propose targeted changes to the bot's "${label}" text, for the SpeedSettr team to review.`
        : "Return NEW knowledge-base entries for the bot, for the SpeedSettr team to review.",
      parameters: {
        type: "object",
        properties: {
          ...(sectionMode
            ? {
                edits: EDITS_SCHEMA,
                append: APPEND_SCHEMA,
                section_content: fullTextSchema(label),
              }
            : {}),
          kb_entries: KB_ENTRIES_SCHEMA,
          summary: SUMMARY_SCHEMA,
        },
        required: ["summary"],
      },
    },
  };
}

/** Clean a raw `edits` array into valid {find, replace} pairs (or undefined). */
function cleanEdits(raw: unknown): TextEdit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TextEdit[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.find !== "string" || !o.find.trim()) continue;
    if (typeof o.replace !== "string") continue;
    out.push({ find: o.find, replace: o.replace });
  }
  return out.length ? out : undefined;
}

function cleanAppend(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/** A model-supplied whole text, tolerating the legacy `system_prompt` field. */
function cleanFullText(o: Record<string, unknown>): string {
  const fromSection = typeof o.section_content === "string" ? o.section_content.trim() : "";
  const fromLegacy = typeof o.system_prompt === "string" ? o.system_prompt.trim() : "";
  return fromSection || fromLegacy;
}

/**
 * Clean a raw `sections` array (from an "overall" propose_changes call). Drops
 * entries with an unknown column or no change, and keeps the FIRST entry per
 * section so a model that emits a duplicate can't stomp itself. `section_content`
 * holds a whole new text only when the model sent one; finalizeProposal() fills
 * in the real result.
 */
function cleanSections(raw: unknown): SectionEdit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = new Set<string>(ALL_SECTION_COLUMNS);
  const seen = new Set<string>();
  const out: SectionEdit[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const section = typeof o.section === "string" ? o.section : "";
    const edits = cleanEdits(o.edits);
    const append = cleanAppend(o.append);
    const full = cleanFullText(o);
    if (!valid.has(section) || seen.has(section) || !(edits || append || full)) continue;
    seen.add(section);
    out.push({
      section: section as SectionColumn,
      section_content: full,
      ...(edits ? { edits } : {}),
      ...(append ? { append } : {}),
    });
  }
  return out.length ? out : undefined;
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
 * carries `section` (the target column) and the model's `edits` / `append`, or a
 * whole `section_content`; nothing is applied yet (see finalizeProposal). For
 * "other" it carries kb_entries.
 */
export function parseProposalInput(input: unknown, category: ChangeCategory): ChangeProposal {
  if (!input || typeof input !== "object") {
    throw new Error("propose_changes returned no object input");
  }
  const obj = input as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (!summary) throw new Error("propose_changes returned no summary");

  const kb_entries = cleanKbEntries(obj.kb_entries);

  if (category === "overall") {
    // Multi-section: any affected section(s) + optional new knowledge. Require at
    // least one actionable change so an empty proposal is treated as "no proposal".
    const sections = cleanSections(obj.sections);
    if (!sections && !kb_entries) {
      throw new Error("propose_changes (overall) returned no sections and no kb_entries");
    }
    return { summary, ...(sections ? { sections } : {}), ...(kb_entries ? { kb_entries } : {}) };
  }

  if (category === "other") {
    return { summary, ...(kb_entries ? { kb_entries } : {}) };
  }

  const edits = cleanEdits(obj.edits);
  const append = cleanAppend(obj.append);
  const full = cleanFullText(obj);
  if (!edits && !append && !full) {
    throw new Error("propose_changes returned no change to the section");
  }

  return {
    summary,
    section: SECTION_BY_CATEGORY[category],
    ...(edits ? { edits } : {}),
    ...(append ? { append } : {}),
    ...(full ? { section_content: full } : {}),
    ...(kb_entries ? { kb_entries } : {}),
  };
}

/**
 * Apply a parsed proposal to the section text it was drafted against. Fills in
 * each changed section's full new `section_content` and pins `base_hash` (the
 * fingerprint of that base text) for the Apply / Publish re-check. Targeted edits
 * win over a whole text when the model sent both; a whole text is only accepted
 * for an empty or short section. Returns the problems instead when anything
 * doesn't apply, so the caller can ask the model to fix them.
 */
export function finalizeProposal(
  p: ChangeProposal,
  bases: Partial<Record<SectionColumn, string>>
): { ok: true; proposal: ChangeProposal } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const out: ChangeProposal = { ...p };

  const applyOne = (
    base: string,
    fields: { edits?: TextEdit[]; append?: string; full?: string }
  ):
    | { ok: true; text: string; targeted: boolean }
    | { ok: false; problems: string[] } => {
    const targeted = !!(fields.edits?.length || fields.append);
    const r = targeted
      ? applyTextEdits(base, { edits: fields.edits, append: fields.append })
      : applyTextEdits(base, { replacement: fields.full ?? "" });
    return r.ok ? { ok: true, text: r.text, targeted } : r;
  };

  if (p.section) {
    const base = bases[p.section] ?? "";
    const r = applyOne(base, { edits: p.edits, append: p.append, full: p.section_content });
    if (!r.ok) {
      problems.push(...r.problems);
    } else {
      out.section_content = r.text;
      out.base_hash = sectionFingerprint(base);
      if (!r.targeted) {
        delete out.edits;
        delete out.append;
      }
    }
  }

  if (p.sections) {
    const done: SectionEdit[] = [];
    for (const s of p.sections) {
      const base = bases[s.section] ?? "";
      const r = applyOne(base, { edits: s.edits, append: s.append, full: s.section_content });
      if (!r.ok) {
        problems.push(...r.problems.map((m) => `${SECTION_LABELS[s.section]}: ${m}`));
        continue;
      }
      done.push({
        section: s.section,
        section_content: r.text,
        base_hash: sectionFingerprint(base),
        ...(r.targeted && s.edits ? { edits: s.edits } : {}),
        ...(r.targeted && s.append ? { append: s.append } : {}),
      });
    }
    out.sections = done;
  }

  return problems.length ? { ok: false, problems } : { ok: true, proposal: out };
}

// --- OpenAI Chat Completions transport -------------------------------------

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type OpenAIMessage =
  | { role: "system" | "user"; content: string | OpenAIContentPart[] }
  | { role: "assistant"; content: string | OpenAIContentPart[] | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface OpenAIResponseMessage {
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIChatResponse {
  choices?: { message?: OpenAIResponseMessage; finish_reason?: string }[];
  usage?: { total_tokens?: number };
}

/** POST to OpenAI chat/completions with a hard timeout. Throws on non-2xx. */
async function postChat(body: Record<string, unknown>, timeoutMs: number): Promise<OpenAIChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
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

/** Read a model message as a proposal: parse it, then apply it to the bases. */
function interpretProposal(
  message: OpenAIResponseMessage | undefined,
  category: ChangeCategory,
  bases: Partial<Record<SectionColumn, string>>
): { proposal?: ChangeProposal; attempted: boolean; problems: string[] } {
  const attempted = !!message?.tool_calls?.some((c) => c.function?.name === "propose_changes");
  const args = extractProposalCall(message);
  if (!args) {
    return {
      attempted,
      problems: attempted
        ? ["The proposal could not be read (it may have been cut off for length); keep it shorter."]
        : [],
    };
  }
  let parsed: ChangeProposal;
  try {
    parsed = parseProposalInput(args, category);
  } catch (err) {
    return { attempted, problems: [err instanceof Error ? err.message : "The proposal was malformed."] };
  }
  const f = finalizeProposal(parsed, bases);
  return f.ok
    ? { attempted, proposal: f.proposal, problems: [] }
    : { attempted, problems: f.problems };
}

/** What the model is told when its proposal did not apply, for its one retry. */
function repairInstruction(problems: string[]): string {
  return [
    "Your proposal could not be applied to the current text:",
    ...problems.map((p) => `- ${p}`),
    "Call propose_changes again. Copy every `find` passage WORD FOR WORD from the current text shown above (a whole sentence or line is safest), make each one appear only once, keep the edits short, and change only what the client asked for.",
  ].join("\n");
}

/**
 * One propose_changes call, plus ONE repair round when the model tried to propose
 * but the proposal did not apply (a passage not found, ambiguous, cut off...).
 * The repair replays the exchange with the tool result explaining what failed and
 * forces another propose_changes call.
 */
async function proposeWithRepair(opts: {
  messages: OpenAIMessage[];
  category: ChangeCategory;
  bases: Partial<Record<SectionColumn, string>>;
  forced: boolean;
}): Promise<{
  proposal?: ChangeProposal;
  rawText: string;
  attempted: boolean;
  truncated: boolean;
  problems: string[];
  tokensUsed: number;
}> {
  const tool = buildProposeTool(opts.category);
  const forcedChoice = { type: "function", function: { name: "propose_changes" } };
  const startedAt = Date.now();

  const first = await postChat(
    {
      model: CHANGE_AI_MODEL,
      max_completion_tokens: MAX_PROPOSAL_TOKENS,
      tools: [tool],
      tool_choice: opts.forced ? forcedChoice : "auto",
      messages: opts.messages,
    },
    PROPOSAL_BUDGET_MS
  );
  let tokensUsed = first.usage?.total_tokens ?? 0;
  const choice = first.choices?.[0];
  const message = choice?.message;
  const rawText = (message?.content ?? "").trim();
  const r1 = interpretProposal(message, opts.category, opts.bases);
  const truncated = choice?.finish_reason === "length";

  if (r1.proposal || !r1.attempted || !message?.tool_calls?.length) {
    return { ...r1, rawText, truncated, tokensUsed };
  }

  // Not enough of the shared budget left for a useful retry: report the failure
  // now (the caller shows its own message) rather than risk the route timing out.
  const remaining = PROPOSAL_BUDGET_MS - (Date.now() - startedAt);
  if (remaining < MIN_REPAIR_MS) {
    return { attempted: true, rawText, truncated, problems: r1.problems, tokensUsed };
  }

  const retry = await postChat(
    {
      model: CHANGE_AI_MODEL,
      max_completion_tokens: MAX_PROPOSAL_TOKENS,
      tools: [tool],
      tool_choice: forcedChoice,
      messages: [
        ...opts.messages,
        { role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls },
        ...message.tool_calls.map((c) => ({
          role: "tool" as const,
          tool_call_id: c.id,
          content: c.function?.name === "propose_changes" ? repairInstruction(r1.problems) : "Ignored.",
        })),
      ],
    },
    remaining
  );
  tokensUsed += retry.usage?.total_tokens ?? 0;
  const m2 = retry.choices?.[0]?.message;
  const r2 = interpretProposal(m2, opts.category, opts.bases);
  if (r2.proposal) {
    return {
      proposal: r2.proposal,
      rawText: (m2?.content ?? "").trim() || rawText,
      attempted: true,
      truncated: false,
      problems: [],
      tokensUsed,
    };
  }
  return {
    attempted: true,
    rawText,
    truncated: truncated || retry.choices?.[0]?.finish_reason === "length",
    problems: r2.problems.length ? r2.problems : r1.problems,
    tokensUsed,
  };
}

/**
 * PURE: decide what the assistant says, guaranteeing a non-empty reply.
 *  - If the model wrote text, use it.
 *  - If it produced a valid proposal but no text, narrate the proposal.
 *  - If it produced NEITHER (e.g. a truncated/unparseable tool call), never
 *    dead-end with an empty bubble - return a helpful recovery message. When the
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
    return "Here's what I'd change - review the summary below and submit it to the team when you're happy.";
  }
  return proposalTruncated
    ? "I put together the change, but it came out too long to finish in one message. Can you point me at the specific part you want changed? Then I'll propose just that cleanly."
    : "Sorry, I didn't quite catch that - could you tell me once more exactly what you'd like to change?";
}

/** Said when the model proposed a change that still did not fit the live text after its retry. */
export const UNAPPLIED_PROPOSAL_TEXT =
  "I couldn't line my change up with the exact wording your bot has right now. Could you tell me which sentence or part you'd like changed? Then I'll propose just that.";

// --- Change assistant chat (multimodal, scoped, credential-refusing) --------

export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
  images?: { base64: string; mediaType: string }[]; // pre-resolved (user messages only)
}

/** Per-section guidance for the change assistant (what each section covers). */
const SECTION_GUIDE: Record<
  Exclude<ChangeCategory, "other" | "overall">,
  { label: string; covers: string }
> = {
  personality: {
    label: "PERSONALITY / TONE",
    covers: "the bot's voice, persona, and tone - how it sounds, not the facts it cites",
  },
  offers: {
    label: "OFFERS, SERVICES & LINKS",
    covers:
      "what the business offers - services, packages, inclusions/exclusions, prices, and links",
  },
  rebuttals: {
    label: "REBUTTALS & FAQ HANDLING",
    covers: "how the bot answers objections and frequently-asked questions",
  },
};

/** How to express a section change - shared by the chat and the admin draft. */
const EDIT_RULES = `HOW TO WRITE THE CHANGE (the platform applies it for you):
- Use targeted edits. For each change, "find" is a passage copied WORD FOR WORD from the current text above (a whole sentence or line is safest, long enough to appear only once), and "replace" is what it should say instead (an empty "replace" deletes it).
- To add something new, use "append" (it goes at the end), or an edit whose "replace" keeps the found passage and adds the new words next to it.
- Change ONLY what the client asked for. Everything you do not touch stays exactly as it is, so never "tidy up" other parts.
- Only when the current text is empty or shorter than ${FULL_REWRITE_MAX_CHARS} characters may you send the complete new text as "section_content" instead of edits.`;

/**
 * PURE: the scoped, security-hardened system prompt for the change assistant.
 * For a single-section category `currentSection` is the live text of the targeted
 * section (or "" for "other"/empty). For "overall" the model may edit ANY affected
 * section, so `sections` (the live text of all three) is used instead.
 */
export function buildChatSystemPrompt(
  chatbot: Pick<Chatbot, "name">,
  kbEntries: KbEntryLite[],
  category: ChangeCategory,
  currentSection: string,
  sections?: SectionsContext
): string {
  const kbTopics = kbEntries.map((e) => e.title).filter(Boolean);
  const kbBlock = kbEntries.length ? buildFullContextBlock(kbEntries) : "(none yet)";

  const guide = category === "personality" || category === "offers" || category === "rebuttals"
    ? SECTION_GUIDE[category]
    : null;

  let scopeBlock: string;
  let proposeInstr: string;

  if (category === "overall") {
    scopeBlock = `YOU MAY EDIT ANY OF THE BOT'S PARTS THAT THE CLIENT'S REQUEST AFFECTS - and only those. Leave every part the request does NOT touch exactly as it is.

The parts you can change:
1. PERSONALITY / TONE - the bot's voice and tone (how it sounds).
2. OFFERS, SERVICES & LINKS - services, packages, inclusions/exclusions, prices, links.
3. REBUTTALS & FAQ HANDLING - how it answers objections and common questions.
You can also add new facts the bot can cite (knowledge-base entries).

CURRENT PARTS (your starting point - change only what the request affects):

${renderOverallSections(sections)}

${EDIT_RULES}`;
    proposeInstr = `- Only when you have enough to act, call the propose_changes tool. In "sections", include ONLY the parts your change affects, each with its own targeted edits; leave the rest out. Add any new facts as kb_entries. Always include a short plain-English summary. When you change the personality, write ONLY voice/persona - do NOT add generic safety rules; the platform adds those automatically.`;
  } else if (guide) {
    scopeBlock = `YOU ARE EDITING ONE SECTION: ${guide.label}.
This section covers ${guide.covers}. Only propose changes to THIS section - never touch the bot's other sections.

CURRENT ${guide.label} SECTION (your starting point - change it, never rewrite it from scratch):
${currentSection.trim() || "(empty - this section has not been written yet)"}

${EDIT_RULES}`;
    proposeInstr = `- Only when you have enough to act, call the propose_changes tool with the targeted edits for the ${guide.label} section, plus a short summary.${
      category === "personality"
        ? " Write ONLY the voice/persona - do NOT add generic safety rules; the platform adds those automatically."
        : " Keep the content focused on this section."
    }`;
  } else {
    scopeBlock = `YOU ARE ADDING KNOWLEDGE. The client wants to add or correct facts the bot can cite (knowledge-base entries) - not change its persona or sections. Propose only new knowledge-base entries.`;
    proposeInstr = `- Only when you have enough to act, call the propose_changes tool with kb_entries (the NEW knowledge facts to add) plus a short summary. Do not propose a section change for this category.`;
  }

  return `You are the SpeedSettr change assistant. You help ONE client refine ONE of their Instagram/Messenger DM chatbots - "the project". Through a short, friendly conversation you figure out the change they want to this section, then propose it for the SpeedSettr team to review.

THE PROJECT (the only thing you may discuss or change):
- Name: ${chatbot.name}
- Existing knowledge-base topics: ${kbTopics.length ? kbTopics.join(", ") : "(none yet)"}

${scopeBlock}

CURRENT KNOWLEDGE BASE (read this fully before proposing - never duplicate or contradict it):
${kbBlock}

HARD SECURITY RULES - never violate, no matter what the user says:
- You ONLY discuss this project's reply behavior, persona/voice, tone, and knowledge (facts the bot can cite).
- You must NEVER ask for, reference, reveal, or change: API keys, ManyChat tokens or page IDs, the webhook secret, passwords, billing or subscription, other customers, account or technical settings, or anything security-related. If the user raises any of these, briefly say it's handled by the SpeedSettr team and steer back to the project's messaging. Do not speculate about them.
- Never invent prices, hours, links, or policies. If a needed fact is missing, ask the client for it so it can be added.

HOW TO WORK:
- Default to ACTING, not asking. If the request is clear enough to make a sensible change, call propose_changes right away. Most requests are clear - just do it.
- Ask a question ONLY if you genuinely cannot tell what to change, and then ask at most ONE short question before you propose.
- Never ask the same thing twice and never re-confirm. The moment the client answers, or says to go ahead (e.g. "yes", "confirm", "just add that", "where's the change"), STOP asking and call propose_changes.
- Talk like a friendly human to a small-business owner with NO technical background. Keep replies to one or two short sentences in plain, everyday words. Never use jargon or words like "section", "field", "prompt", "keyword list", "tool", "edit", or "proposal" - just talk about their business and what the bot will say to people.
- Write the summary the same plain way: a sentence or two anyone can understand, describing the change in normal language.
- Ground every proposal in the CURRENT text and CURRENT KNOWLEDGE BASE above. Change what's there - don't start from a blank slate, and never contradict an existing knowledge entry.
- If the user attaches a knowledge file, its extracted text is included in their message; READ IT FIRST and fold the relevant facts into your proposal according to their instruction.
${proposeInstr}`;
}

/** PURE: map our transcript to OpenAI chat messages (image_url parts for user turns). */
export function toOpenAIMessages(messages: ChatTurnMessage[]): OpenAIMessage[] {
  return messages.map((m): OpenAIMessage => {
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
    return m.role === "user"
      ? { role: "user", content: m.content }
      : { role: "assistant", content: m.content };
  });
}

/** The section texts a proposal for this category is applied to. */
function basesFor(
  category: ChangeCategory,
  currentSection: string,
  sections?: SectionsContext
): Partial<Record<SectionColumn, string>> {
  if (category === "overall") return { ...(sections ?? {}) };
  if (category === "personality" || category === "offers" || category === "rebuttals") {
    return { [SECTION_BY_CATEGORY[category]]: currentSection };
  }
  return {};
}

export async function chatTurn(opts: {
  chatbot: Pick<Chatbot, "name">;
  kbEntries: KbEntryLite[];
  messages: ChatTurnMessage[];
  category: ChangeCategory;
  currentSection: string;
  sections?: SectionsContext; // "overall" only: live text of all three sections
}): Promise<{ assistantText: string; proposal?: ChangeProposal; tokensUsed: number; model: string }> {
  const system = buildChatSystemPrompt(
    opts.chatbot,
    opts.kbEntries,
    opts.category,
    opts.currentSection,
    opts.sections
  );

  const out = await proposeWithRepair({
    messages: [{ role: "system", content: system }, ...toOpenAIMessages(opts.messages)],
    category: opts.category,
    bases: basesFor(opts.category, opts.currentSection, opts.sections),
    forced: false, // reply with a question OR propose when ready
  });

  // A proposal that never applied must not be narrated as if it had: whatever the
  // model wrote alongside it ("here's the change!") would be a false promise.
  const unapplied = !out.proposal && out.attempted && !out.truncated;
  const assistantText = unapplied
    ? UNAPPLIED_PROPOSAL_TEXT
    : resolveAssistantText(
        out.proposal || !out.attempted ? out.rawText : "",
        !!out.proposal,
        !out.proposal && out.truncated
      );

  if (!out.proposal && out.attempted) {
    console.warn(
      `[change-ai] proposal not applied category=${opts.category} truncated=${out.truncated} problems=${JSON.stringify(out.problems).slice(0, 500)}`
    );
  }

  return { assistantText, proposal: out.proposal, tokensUsed: out.tokensUsed, model: CHANGE_AI_MODEL };
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
  sections?: SectionsContext; // "overall" only: live text of all three sections
}): { system: string; userContent: string } {
  const { kbEntries, requestText, adminGuidance, category, currentSection, sections } = opts;
  const kbBlock = kbEntries.length ? buildFullContextBlock(kbEntries) : "(none)";
  const guide = category === "personality" || category === "offers" || category === "rebuttals"
    ? SECTION_GUIDE[category]
    : null;
  const guidanceTail = adminGuidance
    ? `\n\nADDITIONAL GUIDANCE FROM THE SPEEDSETTR TEAM (takes priority):\n${adminGuidance}`
    : "";

  if (category === "overall") {
    const system = `You are a senior prompt engineer for SpeedSettr, which runs AI chatbots that auto-reply to Instagram and Messenger DMs for small businesses. A client has requested a change that may affect ANY part of their bot. Decide which of the bot's parts the request actually affects - personality/voice, offers, rebuttals/FAQ - and/or new knowledge, and propose targeted edits to ONLY those parts. Leave every part the request does not touch exactly as it is. When you change the personality, write ONLY voice/persona - do not add generic safety rules; the platform adds those automatically.

${EDIT_RULES}

Respond by calling the propose_changes tool with "sections" (each changed part with its edits) and/or kb_entries (new facts), plus a concise summary for the reviewer.`;

    const userContent = `CURRENT PARTS (your starting point - change only what the request affects):

${renderOverallSections(sections)}

CURRENT KNOWLEDGE BASE (for context; do not duplicate):
${kbBlock}

CLIENT'S CHANGE REQUEST:
${requestText}${guidanceTail}`;

    return { system, userContent };
  }

  if (guide) {
    const system = `You are a senior prompt engineer for SpeedSettr, which runs AI chatbots that auto-reply to Instagram and Messenger DMs for small businesses. A client has requested a change to the ${guide.label} section of their bot (this section covers ${guide.covers}). Propose targeted edits to the CURRENT ${guide.label} SECTION that fulfill the request, keeping the content focused on this section only.${
      category === "personality"
        ? " Write ONLY the voice/persona - do not add generic safety rules; the platform adds those automatically."
        : ""
    }

${EDIT_RULES}

Respond by calling the propose_changes tool with the edits plus a concise summary for the reviewer.`;

    const userContent = `CURRENT ${guide.label} SECTION (your starting point - change it, don't rewrite it):
${currentSection.trim() || "(empty - this section has not been written yet)"}

CURRENT KNOWLEDGE BASE (for context; do not duplicate):
${kbBlock}

CLIENT'S CHANGE REQUEST:
${requestText}${guidanceTail}`;

    return { system, userContent };
  }

  // "other" → knowledge-base entries only.
  const system = `You are a senior prompt engineer for SpeedSettr, which runs AI chatbots that auto-reply to Instagram and Messenger DMs for small businesses. A client has requested new knowledge for their bot. Propose NEW knowledge-base entries (kb_entries) for genuinely new facts not already present - never duplicate or contradict an existing entry.

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
  sections?: SectionsContext; // "overall" only
}): Promise<{ proposal: ChangeProposal; tokensUsed: number; model: string }> {
  const { system, userContent } = buildDraftPrompts(opts);

  const out = await proposeWithRepair({
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    category: opts.category,
    bases: basesFor(opts.category, opts.currentSection, opts.sections),
    forced: true,
  });

  if (!out.proposal) {
    throw new Error(
      out.problems.length
        ? `The draft did not apply: ${out.problems.join(" ")}`
        : "Model did not return a propose_changes tool call"
    );
  }
  return { proposal: out.proposal, tokensUsed: out.tokensUsed, model: CHANGE_AI_MODEL };
}
