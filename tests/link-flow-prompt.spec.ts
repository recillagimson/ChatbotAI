import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "@/lib/anthropic";
import { DEFAULT_LINK_FLOW_TOKEN, linkFlowPromptBlock } from "@/lib/link-flow";
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
    const out = buildSystemPrompt(
      bot({ link_flow_enabled: true, link_flow_ns: "ig1" }),
      "KB",
    );
    expect(out).toContain(DEFAULT_LINK_FLOW_TOKEN);
    expect(out).toContain("LINK DELIVERY");
  });
  it("omits it when disabled", () => {
    const out = buildSystemPrompt(
      bot({ link_flow_enabled: false, link_flow_ns: "ig1" }),
      "KB",
    );
    expect(out).not.toContain("LINK DELIVERY");
  });
  it("includes the token instruction in the legacy custom-prompt shape", () => {
    const out = buildSystemPrompt(
      bot({
        persona_section: null,
        system_prompt: "You are a custom persona.",
        link_flow_enabled: true,
        link_flow_ns: "ig1",
      }),
      "KB",
    );
    expect(out).toContain(DEFAULT_LINK_FLOW_TOKEN);
    expect(out).toContain("LINK DELIVERY");
  });
  it("includes the token instruction in the default shape (no sections, no system_prompt)", () => {
    const out = buildSystemPrompt(
      bot({
        persona_section: null,
        system_prompt: null,
        link_flow_enabled: true,
        link_flow_ns: "ig1",
      }),
      "KB",
    );
    expect(out).toContain(DEFAULT_LINK_FLOW_TOKEN);
    expect(out).toContain("LINK DELIVERY");
  });
});

const linkBase = {
  link_flow_enabled: true,
  link_flow_ns: null,
  link_flow_name: null,
  link_flow_ns_fb: null,
  link_flow_name_fb: null,
  link_flow_token: null,
  link_flows: null,
};

describe("linkFlowPromptBlock (multi)", () => {
  it("single legacy entry keeps the original one-token wording", () => {
    const block = linkFlowPromptBlock({ ...linkBase, link_flow_ns: "L" });
    expect(block).toContain("[[SEND_LINK]]");
    expect(block).toContain("write [[SEND_LINK]] on its OWN line");
    expect(block).not.toContain("tokens below");
  });
  it("multiple entries list every token", () => {
    const block = linkFlowPromptBlock({
      ...linkBase,
      link_flows: [
        { token: "[[skool]]", ns: "a", name: "Skool", ns_fb: null, name_fb: null },
        { token: "[[call]]", ns: "b", name: "Call", ns_fb: null, name_fb: null },
      ],
    });
    expect(block).toContain("tokens below");
    expect(block).toContain("[[skool]] = sends Skool");
    expect(block).toContain("[[call]] = sends Call");
  });
  it("empty when disabled", () => {
    expect(
      linkFlowPromptBlock({ ...linkBase, link_flow_enabled: false, link_flows: [{ token: "[[x]]", ns: "a", name: null, ns_fb: null, name_fb: null }] })
    ).toBe("");
  });
});
