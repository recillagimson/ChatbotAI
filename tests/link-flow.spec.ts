import { describe, it, expect } from "vitest";
import {
  DEFAULT_LINK_FLOW_TOKEN,
  resolveLinkFlowToken,
  selectLinkFlow,
  planLinkFlow,
  linkFlowPromptBlock,
  parseLinkFlows,
  resolveLinkFlows,
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
    link_flows: null,
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
    expect(r).toEqual({ cleanText: "here [[SEND_LINK]]", fireFlowNs: [], tokenFound: false });
  });
  it("passes through when the token is absent", () => {
    const r = planLinkFlow({ replyText: "no marker here", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r).toEqual({ cleanText: "no marker here", fireFlowNs: [], tokenFound: false });
  });
  it("strips the token and fires the IG flow on instagram", () => {
    const r = planLinkFlow({ replyText: "Grab your spot\n[[SEND_LINK]]", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r.cleanText).toBe("Grab your spot");
    expect(r.fireFlowNs).toEqual(["ig1"]);
    expect(r.tokenFound).toBe(true);
  });
  it("fires the FB flow on messenger", () => {
    const r = planLinkFlow({ replyText: "[[SEND_LINK]] done", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1", link_flow_ns_fb: "fb1" }), platform: "messenger" });
    expect(r.fireFlowNs).toEqual(["fb1"]);
  });
  it("falls back to the IG flow on messenger when fb unset", () => {
    const r = planLinkFlow({ replyText: "[[SEND_LINK]]", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "messenger" });
    expect(r.fireFlowNs).toEqual(["ig1"]);
  });
  it("strips the token even when no flow is configured for the channel", () => {
    const r = planLinkFlow({ replyText: "sign up [[SEND_LINK]]", chatbot: cfg({ link_flow_enabled: true, link_flow_ns_fb: "fb1" }), platform: "instagram" });
    expect(r.cleanText).toBe("sign up");
    expect(r.fireFlowNs).toEqual([]);
    expect(r.tokenFound).toBe(true);
  });
  it("matches a custom token case-insensitively", () => {
    const r = planLinkFlow({ replyText: "here you go Skool_Link", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1", link_flow_token: "skool_link" }), platform: "instagram" });
    expect(r.cleanText).toBe("here you go");
    expect(r.fireFlowNs).toEqual(["ig1"]);
  });
  it("strips multiple occurrences and fires once", () => {
    const r = planLinkFlow({ replyText: "[[SEND_LINK]] a [[SEND_LINK]] b", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r.cleanText).toBe("a b");
    expect(r.fireFlowNs).toEqual(["ig1"]);
  });
  it("leaves no blank line when the token was on its own line", () => {
    const r = planLinkFlow({ replyText: "line one\n[[SEND_LINK]]\nline two", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r.cleanText).toBe("line one\nline two");
  });
  it("passes through empty text", () => {
    const r = planLinkFlow({ replyText: "", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r).toEqual({ cleanText: "", fireFlowNs: [], tokenFound: false });
  });
  it("preserves a pre-existing blank line (bubble separator) elsewhere", () => {
    const r = planLinkFlow({ replyText: "bubble A\n\n[[SEND_LINK]]\n\nbubble B", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r.cleanText).toBe("bubble A\n\nbubble B");
    expect(r.fireFlowNs).toEqual(["ig1"]);
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

const SAMPLE_FLOWS = [
  { token: "[[skool]]", ns: "flowA", name: "Skool", ns_fb: null, name_fb: null },
  { token: "[[call]]", ns: "flowB", name: "Call", ns_fb: null, name_fb: null },
];

describe("planLinkFlow (multi)", () => {
  it("fires every matched token's flow and strips them", () => {
    const r = planLinkFlow({
      replyText: "Here you go [[skool]]\nand book a call [[call]]",
      chatbot: cfg({ link_flow_enabled: true, link_flows: SAMPLE_FLOWS }),
      platform: "instagram",
    });
    expect(r.fireFlowNs).toEqual(["flowA", "flowB"]);
    expect(r.cleanText).not.toContain("[[skool]]");
    expect(r.cleanText).not.toContain("[[call]]");
    expect(r.tokenFound).toBe(true);
  });
  it("matches the longest token first (link_1 does not eat link_10)", () => {
    const r = planLinkFlow({
      replyText: "grab it link_10",
      chatbot: cfg({
        link_flow_enabled: true,
        link_flows: [
          { token: "link_1", ns: "one", name: null, ns_fb: null, name_fb: null },
          { token: "link_10", ns: "ten", name: null, ns_fb: null, name_fb: null },
        ],
      }),
      platform: "instagram",
    });
    expect(r.fireFlowNs).toEqual(["ten"]);
    expect(r.cleanText).toBe("grab it");
  });
  it("dedupes when two tokens point at the same flow", () => {
    const r = planLinkFlow({
      replyText: "[[a]] [[b]]",
      chatbot: cfg({
        link_flow_enabled: true,
        link_flows: [
          { token: "[[a]]", ns: "same", name: null, ns_fb: null, name_fb: null },
          { token: "[[b]]", ns: "same", name: null, ns_fb: null, name_fb: null },
        ],
      }),
      platform: "instagram",
    });
    expect(r.fireFlowNs).toEqual(["same"]);
  });
  it("uses the messenger flow, falling back to ns", () => {
    const list = [
      { token: "[[x]]", ns: "ig", name: null, ns_fb: "fb", name_fb: null },
      { token: "[[y]]", ns: "igonly", name: null, ns_fb: null, name_fb: null },
    ];
    expect(
      planLinkFlow({ replyText: "[[x]]", chatbot: cfg({ link_flow_enabled: true, link_flows: list }), platform: "messenger" }).fireFlowNs
    ).toEqual(["fb"]);
    expect(
      planLinkFlow({ replyText: "[[y]]", chatbot: cfg({ link_flow_enabled: true, link_flows: list }), platform: "messenger" }).fireFlowNs
    ).toEqual(["igonly"]);
  });
  it("falls back to legacy single columns when link_flows is empty", () => {
    const r = planLinkFlow({
      replyText: "ok [[SEND_LINK]]",
      chatbot: cfg({ link_flow_enabled: true, link_flows: [], link_flow_ns: "legacy" }),
      platform: "instagram",
    });
    expect(r.fireFlowNs).toEqual(["legacy"]);
    expect(r.cleanText).toBe("ok");
  });
  it("preserves message bubbles around a stripped token", () => {
    const r = planLinkFlow({
      replyText: "first bubble\n\n[[skool]]\n\nsecond bubble",
      chatbot: cfg({ link_flow_enabled: true, link_flows: [SAMPLE_FLOWS[0]] }),
      platform: "instagram",
    });
    expect(r.cleanText).toBe("first bubble\n\nsecond bubble");
  });
  it("no-ops when disabled", () => {
    const r = planLinkFlow({
      replyText: "[[skool]]",
      chatbot: cfg({ link_flow_enabled: false, link_flows: SAMPLE_FLOWS }),
      platform: "instagram",
    });
    expect(r.fireFlowNs).toEqual([]);
    expect(r.cleanText).toBe("[[skool]]");
  });
});

describe("parseLinkFlows", () => {
  it("drops non-arrays, malformed rows, and entries with no flow", () => {
    expect(parseLinkFlows(null)).toEqual([]);
    expect(parseLinkFlows("nope")).toEqual([]);
    expect(
      parseLinkFlows([
        { token: "", ns: "x", name: null, ns_fb: null, name_fb: null },
        { token: "[[t]]", ns: "", name: null, ns_fb: null, name_fb: null },
        { token: "[[ok]]", ns: "n", name: "N", ns_fb: null, name_fb: null },
        42,
      ]).map((e) => e.token)
    ).toEqual(["[[ok]]"]);
  });
});

describe("resolveLinkFlows", () => {
  it("prefers link_flows, else legacy, else empty", () => {
    expect(resolveLinkFlows(cfg({ link_flows: [SAMPLE_FLOWS[0]] })).length).toBe(1);
    expect(resolveLinkFlows(cfg({ link_flows: [], link_flow_ns: "L" }))[0].ns).toBe("L");
    expect(resolveLinkFlows(cfg())).toEqual([]);
  });
});
