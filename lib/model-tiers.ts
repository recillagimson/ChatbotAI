// lib/model-tiers.ts - single source of truth for OpenAI chat-model selection.
// INVARIANT: this file must import NOTHING from lib/* or app code (reads only
// process.env). Importing app code here would create an import cycle
// (see lib/memory.ts:13-14 for the hand-maintained cycle boundary this respects).

export type ModelTier = "classifier" | "reply" | "helper";

// Defaults used ONLY when no env var is set (token-cost plan step 3, 2026-11-02).
// Replies and the 700-token helpers (facts, memory, flow state) use gpt-5.6-luna: about a
// quarter of gpt-5.4-mini's price, and clean in the re-ask sim. The classifiers stay on
// gpt-5.4-mini: luna is a reasoning model, and its reasoning can use up their 3-60 token
// budgets and come back empty. gpt-5.4-nano for them is an env opt-in (MODEL_TIER_CLASSIFIER)
// after a disqualify-screen spot check (see docs/model-architecture.md).
const TIER_DEFAULT: Record<ModelTier, string> = {
  classifier: "gpt-5.4-mini",
  reply: "gpt-5.6-luna",
  helper: "gpt-5.6-luna",
};

// Optional whole-tier override. NON-CASCADING: each tier reads only its own
// MODEL_TIER_* var, so setting one never bleeds into another tier.
const TIER_ENV: Record<ModelTier, string> = {
  classifier: "MODEL_TIER_CLASSIFIER",
  reply: "MODEL_TIER_REPLY",
  helper: "MODEL_TIER_HELPER",
};

/**
 * Resolve a model id for a tier. Precedence:
 *   1. first non-empty (trimmed) value among `envVars`, in order;
 *   2. tier override MODEL_TIER_<TIER>;
 *   3. tier default.
 * Never throws. The `envVars` chain is copied verbatim from each call site so
 * existing precedence is preserved; the only changes vs. the old inline code
 * are the terminal default and .trim().
 */
export function resolveModel(tier: ModelTier, ...envVars: string[]): string {
  return envModel(tier, envVars) ?? TIER_DEFAULT[tier];
}

/** Steps 1-2 of resolveModel: the env-configured model, or null when none is set. */
function envModel(tier: ModelTier, envVars: string[]): string | null {
  for (const name of envVars) {
    const v = process.env[name];
    if (v && v.trim()) return v.trim();
  }
  const override = process.env[TIER_ENV[tier]];
  return override && override.trim() ? override.trim() : null;
}

/**
 * Named registry: the single mapping from each OpenAI chat touchpoint to its
 * tier + env-var precedence. Call sites AND scripts/check-models.ts read this.
 * Chains mirror the pre-existing inline expressions exactly.
 */
export const MODELS = {
  classifier: () => resolveModel("classifier", "CONFIRM_DETECT_MODEL"),
  questionGate: () => resolveModel("classifier", "QUESTION_SCREEN_MODEL", "CONFIRM_DETECT_MODEL"),
  reply: () => resolveModel("reply", "OPENAI_DM_MODEL"),
  memory: () => resolveModel("helper", "MEMORY_SUMMARY_MODEL", "OPENAI_DM_MODEL"),
  leadFacts: () => resolveModel("helper", "LEAD_FACTS_MODEL", "OPENAI_DM_MODEL"),
  flowState: () => resolveModel("helper", "FLOW_STATE_MODEL", "OPENAI_DM_MODEL"),
  // Helper tier, but gpt-5.4-mini at zero env: luna's reasoning can use up describe's
  // 350-token budget (and its image input is unverified); the change assistant is
  // low-volume tool calling.
  vision: () => envModel("helper", ["OPENAI_VISION_MODEL", "OPENAI_DM_MODEL"]) ?? "gpt-5.4-mini",
  change: () => envModel("helper", ["OPENAI_CHANGE_MODEL"]) ?? "gpt-5.4-mini",
} as const;

// --- Per-chatbot reactive-reply model override (admin-only) -----------------
// The allowlist the admin dropdown offers AND the server validates against - one
// source of truth so the two can never drift. OpenAI entries must fit lib/openai.ts's
// request shape (all gpt-5.x + gpt-4.1-mini use max_completion_tokens, handled there).
// claude-* entries are answered by Anthropic instead (generateReply; needs
// ANTHROPIC_API_KEY, and falls back to the OpenAI default if the call fails).
export const ALLOWED_REPLY_MODELS = [
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-4.1-mini",
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
] as const;

export type AllowedReplyModel = (typeof ALLOWED_REPLY_MODELS)[number];

/** True for a model the Anthropic API answers rather than OpenAI. */
export const isClaudeModel = (model: string) => model.startsWith("claude-");

/** The chatbot's own reply model when it is on the allowlist, else null. */
export function allowedReplyModel(chatbotModel?: string | null): string | null {
  const v = chatbotModel?.trim();
  return v && (ALLOWED_REPLY_MODELS as readonly string[]).includes(v) ? v : null;
}

/**
 * Resolve the reactive-reply model for one chatbot. A valid per-bot override
 * (in ALLOWED_REPLY_MODELS) wins; anything else - null, blank, or an unknown
 * string left in the DB - falls back to the reply-tier default MODELS.reply().
 * Never throws; the fallback makes a bad column value safe.
 */
export function resolveReplyModel(chatbotModel?: string | null): string {
  return allowedReplyModel(chatbotModel) ?? MODELS.reply();
}
