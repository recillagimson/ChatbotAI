import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "@/lib/anthropic";
import { DEFAULT_LINK_FLOW_TOKEN } from "@/lib/link-flow";
import type { Chatbot } from "@/lib/types";

function bot(over: Partial<Chatbot> = {}): Chatbot {
  return {
    name: "Test",
    persona_section: "You are the assistant.",
    offers_section: null,
    rebuttals_section: null,
    system_prompt: null,
    tone: "friendly",
    business_description: null,
    training_pairs: [],
    link_flow_enabled: false,
    link_flow_ns: null,
    link_flow_name: null,
    link_flow_ns_fb: null,
    link_flow_name_fb: null,
    link_flow_token: null,
    ...over,
  } as unknown as Chatbot;
}

describe("buildSystemPrompt link flow", () => {
  it("includes the token instruction when enabled with a flow", () => {
    const out = buildSystemPrompt(bot({ link_flow_enabled: true, link_flow_ns: "ig1" }), "KB");
    expect(out).toContain(DEFAULT_LINK_FLOW_TOKEN);
    expect(out).toContain("LINK DELIVERY");
  });
  it("omits it when disabled", () => {
    const out = buildSystemPrompt(bot({ link_flow_enabled: false, link_flow_ns: "ig1" }), "KB");
    expect(out).not.toContain("LINK DELIVERY");
  });
});
