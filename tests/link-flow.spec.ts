import { describe, it, expect } from "vitest";
import {
  DEFAULT_LINK_FLOW_TOKEN,
  linkSentMarker,
  resolveLinkFlowToken,
  selectLinkFlow,
  planLinkFlow,
  linkFlowPromptBlock,
  parseLinkFlows,
  resolveLinkFlows,
  planDeliveryBubbles,
  type LinkFlowConfig,
  type LinkFlowDelivery,
} from "@/lib/link-flow";
import { findAssetDirectives } from "@/lib/ai-media";

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

describe("linkSentMarker + fired", () => {
  it("reports each fired flow with its channel-correct name for the marker row", () => {
    const bot = cfg({
      link_flow_enabled: true,
      link_flow_ns: "ig1",
      link_flow_name: "Skool signup",
      link_flow_ns_fb: "fb1",
      link_flow_name_fb: "Skool signup FB",
      link_flow_token: "[[skool_link]]",
    });
    const ig = planLinkFlow({ replyText: "here\n[[skool_link]]", chatbot: bot, platform: "instagram" });
    expect(ig.fired).toEqual([{ ns: "ig1", name: "Skool signup" }]);
    const fb = planLinkFlow({ replyText: "here\n[[skool_link]]", chatbot: bot, platform: "messenger" });
    expect(fb.fired).toEqual([{ ns: "fb1", name: "Skool signup FB" }]);
    // No token -> nothing fired, so no marker row gets written.
    const none = planLinkFlow({ replyText: "no token", chatbot: bot, platform: "instagram" });
    expect(none.fired).toEqual([]);
  });
  it("renders the marker like the asset rows, with a fallback when unnamed", () => {
    expect(linkSentMarker("Skool signup")).toBe("(sent link: Skool signup)");
    expect(linkSentMarker(null)).toBe("(sent link: link)");
    expect(linkSentMarker("  ")).toBe("(sent link: link)");
  });
});

describe("planLinkFlow", () => {
  it("passes through when disabled", () => {
    const r = planLinkFlow({ replyText: "here [[SEND_LINK]]", chatbot: cfg({ link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r).toEqual({
      cleanText: "here [[SEND_LINK]]",
      fireFlowNs: [],
      fired: [],
      tokenFound: false,
      deliver: [{ kind: "text", text: "here [[SEND_LINK]]" }],
    });
  });
  it("passes through when the token is absent", () => {
    const r = planLinkFlow({ replyText: "no marker here", chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1" }), platform: "instagram" });
    expect(r).toEqual({
      cleanText: "no marker here",
      fireFlowNs: [],
      fired: [],
      tokenFound: false,
      deliver: [{ kind: "text", text: "no marker here" }],
    });
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
    expect(r).toEqual({ cleanText: "", fireFlowNs: [], fired: [], tokenFound: false, deliver: [] });
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

describe("planLinkFlow delivery order (interleaving)", () => {
  const DELEG = { token: "[[DELEGENT_LINK]]", ns: "deleg", name: "Delegent", ns_fb: null, name_fb: null };
  // Longer token (18 chars vs 17), authored SECOND - must still fire second.
  const BOOK = { token: "[[BOOKING_LINK_2]]", ns: "book", name: "Book Here", ns_fb: null, name_fb: null };

  it("fires flows in TEXT order, not token-length order (the Delegent/Booking bug)", () => {
    const r = planLinkFlow({
      replyText: "Delegent.\n[[DELEGENT_LINK]]\nFree plan.\n[[BOOKING_LINK_2]]",
      chatbot: cfg({ link_flow_enabled: true, link_flows: [DELEG, BOOK] }),
      platform: "instagram",
    });
    // Token-length order would be ["book","deleg"]; text order is the fix.
    expect(r.fireFlowNs).toEqual(["deleg", "book"]);
    expect(r.deliver).toEqual([
      { kind: "text", text: "Delegent." },
      { kind: "flow", ns: "deleg", name: "Delegent" },
      { kind: "text", text: "Free plan." },
      { kind: "flow", ns: "book", name: "Book Here" },
    ]);
    // Marker rows follow the same text order.
    expect(r.fired).toEqual([
      { ns: "deleg", name: "Delegent" },
      { ns: "book", name: "Book Here" },
    ]);
  });

  it("keeps longest-first MATCHING so a short token can't eat a longer one mid-text", () => {
    const r = planLinkFlow({
      replyText: "before link_10 after",
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
    expect(r.deliver).toEqual([
      { kind: "text", text: "before" },
      { kind: "flow", ns: "ten", name: null },
      { kind: "text", text: "after" },
    ]);
  });

  it("token at the very start: flow leads, no empty leading bubble", () => {
    const r = planLinkFlow({
      replyText: "[[skool]] then chat",
      chatbot: cfg({ link_flow_enabled: true, link_flows: [SAMPLE_FLOWS[0]] }),
      platform: "instagram",
    });
    expect(r.deliver).toEqual([
      { kind: "flow", ns: "flowA", name: "Skool" },
      { kind: "text", text: "then chat" },
    ]);
  });

  it("token at the very end: flow trails, no empty trailing bubble", () => {
    const r = planLinkFlow({
      replyText: "chat then [[skool]]",
      chatbot: cfg({ link_flow_enabled: true, link_flows: [SAMPLE_FLOWS[0]] }),
      platform: "instagram",
    });
    expect(r.deliver).toEqual([
      { kind: "text", text: "chat then" },
      { kind: "flow", ns: "flowA", name: "Skool" },
    ]);
  });

  it("two tokens mapping to the same ns fire once, at the FIRST occurrence", () => {
    const r = planLinkFlow({
      replyText: "a [[x]] b [[y]] c",
      chatbot: cfg({
        link_flow_enabled: true,
        link_flows: [
          { token: "[[x]]", ns: "same", name: "First", ns_fb: null, name_fb: null },
          { token: "[[y]]", ns: "same", name: "Second", ns_fb: null, name_fb: null },
        ],
      }),
      platform: "instagram",
    });
    // Fires once at [[x]]; [[y]] is stripped in place so the text around it joins.
    expect(r.fireFlowNs).toEqual(["same"]);
    expect(r.deliver).toEqual([
      { kind: "text", text: "a" },
      { kind: "flow", ns: "same", name: "First" },
      { kind: "text", text: "b c" },
    ]);
  });

  it("legacy single-column path interleaves the same way", () => {
    const r = planLinkFlow({
      replyText: "start\n[[SEND_LINK]]\nend",
      chatbot: cfg({
        link_flow_enabled: true,
        link_flows: [],
        link_flow_ns: "legacy",
        link_flow_name: "Legacy link",
      }),
      platform: "instagram",
    });
    expect(r.fireFlowNs).toEqual(["legacy"]);
    expect(r.deliver).toEqual([
      { kind: "text", text: "start" },
      { kind: "flow", ns: "legacy", name: "Legacy link" },
      { kind: "text", text: "end" },
    ]);
  });

  it("token present but no flow on this channel: stripped, one text block, no flow item", () => {
    const r = planLinkFlow({
      replyText: "hi\n[[fbonly]]\nbye",
      chatbot: cfg({
        link_flow_enabled: true,
        link_flows: [{ token: "[[fbonly]]", ns: "", name: null, ns_fb: "fb1", name_fb: "FB" }],
      }),
      platform: "instagram",
    });
    expect(r.fireFlowNs).toEqual([]);
    expect(r.tokenFound).toBe(true);
    expect(r.deliver).toEqual([{ kind: "text", text: "hi\nbye" }]);
  });

  it("a non-firing token INSIDE a firing reply is stripped in place, joining the text", () => {
    // fb-only entry does not fire on instagram; [[go]] does. The text around [[fb]] must
    // join into one segment rather than cutting an empty piece.
    const r = planLinkFlow({
      replyText: "a [[fb]] b [[go]] c",
      chatbot: cfg({
        link_flow_enabled: true,
        link_flows: [
          { token: "[[fb]]", ns: "", name: null, ns_fb: "fbns", name_fb: null },
          { token: "[[go]]", ns: "gons", name: "Go", ns_fb: null, name_fb: null },
        ],
      }),
      platform: "instagram",
    });
    expect(r.fireFlowNs).toEqual(["gons"]);
    expect(r.deliver).toEqual([
      { kind: "text", text: "a b" },
      { kind: "flow", ns: "gons", name: "Go" },
      { kind: "text", text: "c" },
    ]);
  });

  it("dedup keeps the FIRST TEXT occurrence's flow name, regardless of config order", () => {
    const r = planLinkFlow({
      replyText: "[[first]] then [[second]]",
      chatbot: cfg({
        link_flow_enabled: true,
        link_flows: [
          // config lists 'second' first, but 'first' appears first in the TEXT
          { token: "[[second]]", ns: "same", name: "SecondName", ns_fb: null, name_fb: null },
          { token: "[[first]]", ns: "same", name: "FirstName", ns_fb: null, name_fb: null },
        ],
      }),
      platform: "instagram",
    });
    expect(r.fired).toEqual([{ ns: "same", name: "FirstName" }]);
  });

  it("adjacent flow tokens yield back-to-back flow items, no empty text between", () => {
    const r = planLinkFlow({
      replyText: "[[x]][[y]]",
      chatbot: cfg({
        link_flow_enabled: true,
        link_flows: [
          { token: "[[x]]", ns: "one", name: null, ns_fb: null, name_fb: null },
          { token: "[[y]]", ns: "two", name: null, ns_fb: null, name_fb: null },
        ],
      }),
      platform: "instagram",
    });
    expect(r.deliver).toEqual([
      { kind: "flow", ns: "one", name: null },
      { kind: "flow", ns: "two", name: null },
    ]);
  });
});

describe("planDeliveryBubbles", () => {
  it("splits text segments into bubbles and keeps flows in position", () => {
    const deliver: LinkFlowDelivery[] = [
      { kind: "text", text: "Delegent." },
      { kind: "flow", ns: "deleg", name: "Delegent" },
      { kind: "text", text: "Free plan." },
      { kind: "flow", ns: "book", name: "Book Here" },
    ];
    expect(planDeliveryBubbles(deliver)).toEqual([
      { kind: "text", text: "Delegent." },
      { kind: "flow", ns: "deleg", name: "Delegent" },
      { kind: "text", text: "Free plan." },
      { kind: "flow", ns: "book", name: "Book Here" },
    ]);
  });

  it("keeps the whole-reply bubble cap ACROSS segments (anti-spam bound), flows preserved", () => {
    const deliver: LinkFlowDelivery[] = [
      { kind: "text", text: "a\nb\nc\nd" }, // 4 lines -> up to 4 bubbles
      { kind: "flow", ns: "f1", name: "F1" },
      { kind: "text", text: "e\nf\ng" }, // 3 lines -> up to 3 bubbles
    ];
    const out = planDeliveryBubbles(deliver, 3);
    const textCount = out.filter((s) => s.kind === "text").length;
    expect(textCount).toBeLessThanOrEqual(3); // NOT 3-per-segment (would be up to 6)
    const flowIdx = out.findIndex((s) => s.kind === "flow");
    expect(out[flowIdx]).toEqual({ kind: "flow", ns: "f1", name: "F1" });
    expect(flowIdx).toBeGreaterThan(0); // at least one text bubble before the flow
    expect(flowIdx).toBeLessThan(out.length - 1); // and at least one after it
  });

  it("with no flows, matches splitIntoMessages(cap) on the whole text (unchanged path)", () => {
    const out = planDeliveryBubbles([{ kind: "text", text: "a\nb\nc\nd\ne" }], 3);
    expect(out.filter((s) => s.kind === "text").length).toBe(3);
  });

  it("passes media steps through in position (like flows)", () => {
    const out = planDeliveryBubbles(
      [
        { kind: "text", text: "a\nb" },
        { kind: "media", key: "x" },
        { kind: "text", text: "c" },
      ],
      3
    );
    expect(out).toEqual([
      { kind: "text", text: "a" },
      { kind: "text", text: "b" },
      { kind: "media", key: "x" },
      { kind: "text", text: "c" },
    ]);
  });
});

describe("planLinkFlow media interleaving ([[SEND_ASSET]])", () => {
  // The caller (webhook) passes mediaMatches only when the bot has AI media enabled;
  // here we derive them from the reply exactly as the route does.
  const withMedia = (replyText: string, chatbot = cfg(), platform: "instagram" | "messenger" = "instagram") =>
    planLinkFlow({ replyText, chatbot, platform, mediaMatches: findAssetDirectives(replyText) });

  it("sends a media directive at its authored position, stripping it from the text", () => {
    const r = withMedia("Here's proof\n[[SEND_ASSET: receipt]]\nWant in?");
    expect(r.cleanText).toBe("Here's proof\nWant in?");
    expect(r.fireFlowNs).toEqual([]);
    expect(r.deliver).toEqual([
      { kind: "text", text: "Here's proof" },
      { kind: "media", key: "receipt" },
      { kind: "text", text: "Want in?" },
    ]);
  });

  it("interleaves media AND a link flow in TEXT order (photo, then link, where written)", () => {
    const r = withMedia(
      "Proof:\n[[SEND_ASSET: r1]]\nGrab your spot\n[[SEND_LINK]]",
      cfg({ link_flow_enabled: true, link_flow_ns: "ig1", link_flow_name: "Signup" })
    );
    expect(r.fireFlowNs).toEqual(["ig1"]);
    expect(r.deliver).toEqual([
      { kind: "text", text: "Proof:" },
      { kind: "media", key: "r1" },
      { kind: "text", text: "Grab your spot" },
      { kind: "flow", ns: "ig1", name: "Signup" },
    ]);
  });

  it("a link before a media directive keeps the link first, media second", () => {
    const r = withMedia(
      "[[SEND_LINK]]\n[[SEND_ASSET: r1]]",
      cfg({ link_flow_enabled: true, link_flow_ns: "ig1" })
    );
    expect(r.deliver).toEqual([
      { kind: "flow", ns: "ig1", name: null },
      { kind: "media", key: "r1" },
    ]);
  });

  it("dedupes a repeated media key: sends once at the first occurrence", () => {
    const r = withMedia("[[SEND_ASSET: r1]] a [[SEND_ASSET: r1]] b");
    expect(r.deliver).toEqual([
      { kind: "media", key: "r1" },
      { kind: "text", text: "a b" },
    ]);
  });

  it("keeps adjacent media as separate steps (coalescing is a downstream send concern)", () => {
    const r = withMedia("proof\n[[SEND_ASSET: a]]\n[[SEND_ASSET: b]]");
    expect(r.deliver).toEqual([
      { kind: "text", text: "proof" },
      { kind: "media", key: "a" },
      { kind: "media", key: "b" },
    ]);
  });

  it("lower-cases the key (matches resolveAssetByKey's case-insensitive lookup)", () => {
    const r = withMedia("[[SEND_ASSET: Results_Video]]");
    expect(r.deliver).toEqual([{ kind: "media", key: "results_video" }]);
  });

  it("leaves the directive as visible text when the caller supplies no matches (media disabled)", () => {
    // No mediaMatches passed -> planLinkFlow never touches [[SEND_ASSET]] (bot has AI media off).
    const r = planLinkFlow({
      replyText: "hi [[SEND_ASSET: r1]]",
      chatbot: cfg({ link_flow_enabled: true, link_flow_ns: "ig1", link_flow_token: "[[go]]" }),
      platform: "instagram",
    });
    expect(r.cleanText).toBe("hi [[SEND_ASSET: r1]]");
    expect(r.deliver).toEqual([{ kind: "text", text: "hi [[SEND_ASSET: r1]]" }]);
  });

  it("works with media only when the link feature is disabled", () => {
    const r = withMedia("here you go\n[[SEND_ASSET: r1]]", cfg({ link_flow_enabled: false }));
    expect(r.fireFlowNs).toEqual([]);
    expect(r.deliver).toEqual([
      { kind: "text", text: "here you go" },
      { kind: "media", key: "r1" },
    ]);
  });
});
