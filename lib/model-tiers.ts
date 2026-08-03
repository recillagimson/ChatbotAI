// lib/model-tiers.ts - single source of truth for OpenAI chat-model selection.
// INVARIANT: this file must import NOTHING from lib/* or app code (reads only
// process.env). Importing app code here would create an import cycle
// (see lib/memory.ts:13-14 for the hand-maintained cycle boundary this respects).

export type ModelTier = "classifier" | "reply" | "helper";

// Defaults used ONLY when no env var is set. Uniform gpt-5.4-mini on purpose:
// a same-or-up move from today's gpt-4.1-mini for every touchpoint (never a
// downgrade), so a zero-env deploy is GA- AND capability-safe. Tiers diverge
// via the MODEL_TIER_* knobs (see docs/model-architecture.md).
const TIER_DEFAULT: Record<ModelTier, string> = {
  classifier: "gpt-5.4-mini",
  reply: "gpt-5.4-mini",
  helper: "gpt-5.4-mini",
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
  for (const name of envVars) {
    const v = process.env[name];
    if (v && v.trim()) return v.trim();
  }
  const override = process.env[TIER_ENV[tier]];
  if (override && override.trim()) return override.trim();
  return TIER_DEFAULT[tier];
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
  vision: () => resolveModel("helper", "OPENAI_VISION_MODEL", "OPENAI_DM_MODEL"),
  change: () => resolveModel("helper", "OPENAI_CHANGE_MODEL"),
} as const;

// --- Per-chatbot reactive-reply model override (admin-only) -----------------
// The allowlist the admin dropdown offers AND the server validates against - one
// source of truth so the two can never drift. Members MUST be OpenAI chat models
// (the DM reply path runs on OpenAI by default; the override only affects that
// path). Keep every entry compatible with lib/openai.ts's request shape - all
// gpt-5.x + gpt-4.1-mini use max_completion_tokens (already handled there).
export const ALLOWED_REPLY_MODELS = [
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.6-terra",
  "gpt-4.1-mini",
] as const;

export type AllowedReplyModel = (typeof ALLOWED_REPLY_MODELS)[number];

/**
 * Resolve the reactive-reply model for one chatbot. A valid per-bot override
 * (in ALLOWED_REPLY_MODELS) wins; anything else - null, blank, or an unknown
 * string left in the DB - falls back to the reply-tier default MODELS.reply().
 * Never throws; the fallback makes a bad column value safe.
 */
export function resolveReplyModel(chatbotModel?: string | null): string {
  const v = chatbotModel?.trim();
  if (v && (ALLOWED_REPLY_MODELS as readonly string[]).includes(v)) return v;
  return MODELS.reply();
}
