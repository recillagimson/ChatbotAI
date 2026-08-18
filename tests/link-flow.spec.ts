import { describe, it, expect } from "vitest";
import {
  DEFAULT_LINK_FLOW_TOKEN,
  resolveLinkFlowToken,
  selectLinkFlow,
  planLinkFlow,
  linkFlowPromptBlock,
  type LinkFlowConfig,
} from "@/lib/link-flow";

function cfg(over: Partial<LinkFlowConfig> = {}): LinkFlowConfig {
  return {
    link_flow_enabled: false,
    link_flow_ns: null,
    link_flow_name: null,
    link_flow_ns_fb: null,
    link_flow_name_fb: null,
    link_flow_token: null,
    ...over,
  };
}

describe("resolveLinkFlowToken", () => {
  it("defaults when null or blank", () => {
    expect(resolveLinkFlowToken(cfg())).toBe(DEFAULT_LINK_FLOW_TOKEN);
    expect(resolveLinkFlowToken(cfg({ link_flow_token: "   " }))).toBe(DEFAULT_LINK_FLOW_TOKEN);
  });
  it("uses the configured token trimmed", () => {
    expect(resolveLinkFlowToken(cfg({ link_flow_token: "  skool_link " }))).toBe("skool_link");
  });
});

describe("selectLinkFlow", () => {
  it("instagram/default uses link_flow_ns", () => {
    expect(selectLinkFlow(cfg({ link_flow_ns: "ig1", link_flow_name: "IG" }), "instagram"))
      .toEqual({ ns: "ig1", name: "IG" });
    expect(selectLinkFlow(cfg({ link_flow_ns: "ig1" }), "whatsapp")?.ns).toBe("ig1");
  });
  it("messenger uses link_flow_ns_fb", () => {
    expect(selectLinkFlow(cfg({ link_flow_ns_fb: "fb1", link_flow_name_fb: "FB" }), "messenger"))
      .toEqual({ ns: "fb1", name: "FB" });
  });
  it("messenger falls back to the IG flow when fb is unset", () => {
    expect(selectLinkFlow(cfg({ link_flow_ns: "ig1" }), "messenger")?.ns).toBe("ig1");
  });
  it("instagram never falls back to the fb flow", () => {
    expect(selectLinkFlow(cfg({ link_flow_ns_fb: "fb1" }), "instagram")).toBeNull();
  });
  it("returns null when nothing is set", () => {
    expect(selectLinkFlow(cfg(), "instagram")).toBeNull();
  });
});

describe("planLinkFlow", () => {
  it("passes through when disabled", () => {
    const r = planLinkFlow({ replyText: "here [[SEND_LINK]]", chatbot: cfg({ link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r).toEqual({ cleanText: "here [[SEND_LINK]]", fireFlowNs: null, tokenFound: false });
  });
  it("passes through when the token is absent", () => {
    const r = planLinkFlow({ replyText: "no marker here", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r).toEqual({ cleanText: "no marker here", fireFlowNs: null, tokenFound: false });
  });
  it("strips the token and fires the IG flow on instagram", () => {
    const r = planLinkFlow({ replyText: "Grab your spot\n[[SEND_LINK]]", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r.cleanText).toBe("Grab your spot");
    expect(r.fireFlowNs).toBe("ig1");
    expect(r.tokenFound).toBe(true);
  });
  it("fires the FB flow on messenger", () => {
    const r = planLinkFlow({ replyText: "[[SEND_LINK]] done", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1", link_flow_ns_fb: "fb1" }), platform: "messenger" });
    expect(r.fireFlowNs).toBe("fb1");
  });
  it("falls back to the IG flow on messenger when fb unset", () => {
    const r = planLinkFlow({ replyText: "[[SEND_LINK]]", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "messenger" });
    expect(r.fireFlowNs).toBe("ig1");
  });
  it("strips the token even when no flow is configured for the channel", () => {
    const r = planLinkFlow({ replyText: "sign up [[SEND_LINK]]", chatbot: cfg({ link_flow_enabled: true, link_flow_ns_fb: "fb1" }), platform: "instagram" });
    expect(r.cleanText).toBe("sign up");
    expect(r.fireFlowNs).toBeNull();
    expect(r.tokenFound).toBe(true);
  });
  it("matches a custom token case-insensitively", () => {
    const r = planLinkFlow({ replyText: "here you go Skool_Link", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1", link_flow_token: "skool_link" }), platform: "instagram" });
    expect(r.cleanText).toBe("here you go");
    expect(r.fireFlowNs).toBe("ig1");
  });
  it("strips multiple occurrences and fires once", () => {
    const r = planLinkFlow({ replyText: "[[SEND_LINK]] a [[SEND_LINK]] b", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r.cleanText).toBe("a b");
    expect(r.fireFlowNs).toBe("ig1");
  });
  it("leaves no blank line when the token was on its own line", () => {
    const r = planLinkFlow({ replyText: "line one\n[[SEND_LINK]]\nline two", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r.cleanText).toBe("line one\nline two");
  });
  it("passes through empty text", () => {
    const r = planLinkFlow({ replyText: "", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r).toEqual({ cleanText: "", fireFlowNs: null, tokenFound: false });
  });
  it("preserves a pre-existing blank line (bubble separator) elsewhere", () => {
    const r = planLinkFlow({ replyText: "bubble A\n\n[[SEND_LINK]]\n\nbubble B", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r.cleanText).toBe("bubble A\n\nbubble B");
    expect(r.fireFlowNs).toBe("ig1");
  });
});

describe("linkFlowPromptBlock", () => {
  it("is empty when disabled or no flow", () => {
    expect(linkFlowPromptBlock(cfg({ link_flow_enabled: false, link_flow_ns: "ig1" }))).toBe("");
    expect(linkFlowPromptBlock(cfg({ link_flow_enabled: true }))).toBe("");
  });
  it("names the token and forbids raw URLs when enabled with a flow", () => {
    const block = linkFlowPromptBlock(cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }));
    expect(block).toContain(DEFAULT_LINK_FLOW_TOKEN);
    expect(block.toLowerCase()).toContain("do not paste");
  });
  it("uses the configured token", () => {
    const block = linkFlowPromptBlock(cfg({ link_flow_enabled: true, link_flow_ns_fb: "fb1", link_flow_token: "skool_link" }));
    expect(block).toContain("skool_link");
  });
});
