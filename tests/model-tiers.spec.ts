import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MODELS, resolveReplyModel } from "@/lib/model-tiers";

/**
 * Token-cost plan step 3: the code defaults (used only when no model env var is set).
 * Replies and the facts / memory / flow-state helpers default to gpt-5.6-luna, about a
 * quarter of gpt-5.4-mini's price. Three calls stay on gpt-5.4-mini: the classifiers
 * (screen, tags, question gate) and image descriptions, because luna is a reasoning
 * model and its reasoning can use up their 3-350 token budgets and come back empty;
 * and the change assistant (low volume, tool calls). Env vars and per-bot overrides
 * still win.
 */

const ENV = [
  "OPENAI_DM_MODEL", "CONFIRM_DETECT_MODEL", "QUESTION_SCREEN_MODEL", "MEMORY_SUMMARY_MODEL",
  "LEAD_FACTS_MODEL", "FLOW_STATE_MODEL", "OPENAI_VISION_MODEL", "OPENAI_CHANGE_MODEL",
  "MODEL_TIER_REPLY", "MODEL_TIER_CLASSIFIER", "MODEL_TIER_HELPER",
];
beforeEach(() => ENV.forEach((k) => vi.stubEnv(k, "")));
afterEach(() => vi.unstubAllEnvs());

describe("defaults with no model env vars", () => {
  it("replies and the facts, memory and flow-state helpers use luna", () => {
    expect(MODELS.reply()).toBe("gpt-5.6-luna");
    expect(resolveReplyModel(null)).toBe("gpt-5.6-luna");
    expect(MODELS.leadFacts()).toBe("gpt-5.6-luna");
    expect(MODELS.memory()).toBe("gpt-5.6-luna");
    expect(MODELS.flowState()).toBe("gpt-5.6-luna");
  });

  it("the classifiers, image descriptions and the change assistant stay on gpt-5.4-mini", () => {
    expect(MODELS.classifier()).toBe("gpt-5.4-mini");
    expect(MODELS.questionGate()).toBe("gpt-5.4-mini");
    expect(MODELS.vision()).toBe("gpt-5.4-mini");
    expect(MODELS.change()).toBe("gpt-5.4-mini");
  });
});

describe("env vars and per-bot overrides still win", () => {
  it("a specific var, then the tier var, beat the default", () => {
    vi.stubEnv("OPENAI_VISION_MODEL", "gpt-5.6-terra");
    expect(MODELS.vision()).toBe("gpt-5.6-terra");
    vi.stubEnv("OPENAI_VISION_MODEL", "");
    vi.stubEnv("MODEL_TIER_HELPER", "gpt-4.1-mini");
    expect(MODELS.vision()).toBe("gpt-4.1-mini");
    expect(MODELS.change()).toBe("gpt-4.1-mini");
    expect(MODELS.memory()).toBe("gpt-4.1-mini");
  });

  it("OPENAI_DM_MODEL still sets the reply and cascades to the helpers that read it", () => {
    vi.stubEnv("OPENAI_DM_MODEL", "gpt-5.4-mini");
    expect(MODELS.reply()).toBe("gpt-5.4-mini");
    expect(MODELS.leadFacts()).toBe("gpt-5.4-mini");
    expect(MODELS.vision()).toBe("gpt-5.4-mini");
  });

  it("a bot's own reply model beats the default", () => {
    expect(resolveReplyModel("gpt-5.6-terra")).toBe("gpt-5.6-terra");
    expect(resolveReplyModel("not-a-model")).toBe("gpt-5.6-luna");
  });
});
