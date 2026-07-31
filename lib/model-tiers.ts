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
