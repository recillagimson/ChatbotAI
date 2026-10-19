import { describe, it, expect } from "vitest";
import {
  buildOutboundMessages,
  hasTextLink,
  stripTextLinks,
  textLinksAllowed,
} from "@/lib/manychat";
import { buildSystemPrompt } from "@/lib/anthropic";
import type { Chatbot } from "@/lib/types";

// Instagram restricts accounts that DM links as plain text, so on Instagram a link only
// reaches a lead as the ManyChat link-flow button. These pin the send-layer strip, the
// prompt rule, and that every other channel is untouched.

describe("stripTextLinks", () => {
  it("removes a bare URL and the dangling colon before it", () => {
    expect(stripTextLinks("Here's the link: https://x.com/join?ref=abc")).toBe("Here's the link");
  });
  it("returns empty when the bubble was only a link", () => {
    expect(stripTextLinks("https://x.com/join")).toBe("");
    expect(stripTextLinks("(https://x.com/join).")).toBe("");
    expect(stripTextLinks("👉 https://x.com")).toBe("");
  });
  it("keeps a markdown link's label and drops the URL", () => {
    expect(stripTextLinks("Tap [the signup page](https://x.com/s) to start")).toBe(
      "Tap the signup page to start"
    );
  });
  it("removes www. addresses and keeps the sentence around them", () => {
    expect(stripTextLinks("Go to www.example.com/apply and fill it out")).toBe(
      "Go to and fill it out"
    );
  });
  it("leaves text with no link alone", () => {
    expect(stripTextLinks("We use Next.js, e.g. for the site.")).toBe("We use Next.js, e.g. for the site.");
  });
});

describe("hasTextLink", () => {
  it("detects http, www and markdown links", () => {
    expect(hasTextLink("see https://x.com")).toBe(true);
    expect(hasTextLink("see www.x.com")).toBe(true);
    expect(hasTextLink("[here](https://x.com)")).toBe(true);
    expect(hasTextLink("no link here, just Next.js")).toBe(false);
    // Repeat calls give the same answer (global regex state is reset).
    expect(hasTextLink("see https://x.com")).toBe(true);
  });
});

describe("buildOutboundMessages on Instagram", () => {
  it("never sends a URL, even with link buttons switched on", () => {
    const msgs = buildOutboundMessages(["Here you go: https://x.com/a", "https://x.com/b"], "instagram", true);
    expect(msgs).toEqual([{ type: "text", text: "Here you go" }]);
    expect(JSON.stringify(msgs)).not.toMatch(/https?:|www\./);
  });
  it("treats a missing platform as Instagram (the default channel)", () => {
    expect(textLinksAllowed(undefined)).toBe(false);
    expect(buildOutboundMessages(["https://x.com"])).toEqual([]);
  });
  it("leaves other channels unchanged", () => {
    expect(textLinksAllowed("messenger")).toBe(true);
    expect(buildOutboundMessages(["Join: https://x.com"], "whatsapp")).toEqual([
      { type: "text", text: "Join:" },
      { type: "text", text: "https://x.com" },
    ]);
    expect(buildOutboundMessages(["Join https://x.com"], "messenger", true)[0].buttons?.[0].url).toBe(
      "https://x.com"
    );
  });
});

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
    link_flows: null,
    ...over,
  } as unknown as Chatbot;
}

describe("Instagram no-links prompt rule", () => {
  const prompt = (b: Chatbot, platform: string | null) =>
    buildSystemPrompt(b, "kb", null, false, null, null, null, null, null, { platform });

  it("is added on Instagram in every prompt mode", () => {
    expect(prompt(bot(), "instagram")).toContain("NO LINKS IN TEXT (INSTAGRAM)");
    expect(prompt(bot({ persona_section: null, system_prompt: "Custom." }), "instagram")).toContain(
      "NO LINKS IN TEXT (INSTAGRAM)"
    );
    expect(prompt(bot({ persona_section: null }), "instagram")).toContain("NO LINKS IN TEXT (INSTAGRAM)");
  });
  it("is absent on other channels and when the channel is unknown", () => {
    expect(prompt(bot(), "messenger")).not.toContain("NO LINKS IN TEXT");
    expect(prompt(bot(), null)).not.toContain("NO LINKS IN TEXT");
  });
  it("points to the link token when the bot has a link flow", () => {
    const withFlow = bot({ link_flow_enabled: true, link_flow_ns: "content2024" });
    expect(prompt(withFlow, "instagram")).toContain("use the LINK DELIVERY token above");
    expect(prompt(bot(), "instagram")).toContain("Answer their question in words instead");
  });
});
