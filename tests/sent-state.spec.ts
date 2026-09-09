import { describe, it, expect } from "vitest";
import { parseSentAssetKeys, renderSentStateBlock } from "@/lib/sent-state";

describe("parseSentAssetKeys", () => {
  it("extracts keys from outbound media asset rows (image/video/audio)", () => {
    expect(
      parseSentAssetKeys([
        "(sent image: proof_reviews_1)",
        "(sent video: demo_clip)",
        "(sent audio: voice_note-2)",
      ])
    ).toEqual(["proof_reviews_1", "demo_clip", "voice_note-2"]);
  });

  it("dedupes, preserving first-seen order", () => {
    expect(
      parseSentAssetKeys([
        "(sent image: proof_reviews_1)",
        "(sent image: proof_bankruptcy_1)",
        "(sent image: proof_reviews_1)",
      ])
    ).toEqual(["proof_reviews_1", "proof_bankruptcy_1"]);
  });

  it("ignores link-kind rows entirely (link-flow marker + link assets collide)", () => {
    // linkSentMarker output "(sent link: ...)" is NOT a media asset; link-kind is
    // excluded by design, so neither the named nor the blank-fallback marker appears.
    expect(parseSentAssetKeys(["(sent link: Send Link)", "(sent link: link)"])).toEqual([]);
  });

  it("ignores normal text, nulls, and malformed rows", () => {
    expect(
      parseSentAssetKeys([
        "have you tried fixing it before?",
        null,
        undefined,
        "(sent image: )",
        "(sent image: proof_reviews_1) and more text",
        "",
      ])
    ).toEqual([]);
  });
});

describe("renderSentStateBlock", () => {
  it("returns empty string when nothing has been sent", () => {
    expect(renderSentStateBlock({ sentAssetKeys: [], linkAlreadySent: false })).toBe("");
  });

  it("lists sent assets under a do-not-resend header", () => {
    const out = renderSentStateBlock({
      sentAssetKeys: ["proof_reviews_1", "proof_bankruptcy_1"],
      linkAlreadySent: false,
    });
    expect(out).toContain("ALREADY DELIVERED");
    expect(out).toContain("do NOT send any of these again");
    expect(out).toContain("- proof_reviews_1");
    expect(out).toContain("- proof_bankruptcy_1");
    expect(out).not.toContain("THE LINK HAS ALREADY BEEN SENT");
  });

  it("adds the post-link instruction only when the link was sent", () => {
    const out = renderSentStateBlock({ sentAssetKeys: [], linkAlreadySent: true });
    expect(out).toContain("THE LINK HAS ALREADY BEEN SENT");
    expect(out).toContain("do not restart the pitch");
    expect(out).not.toContain("ASSETS ALREADY SENT");
  });

  it("dedupes keys defensively", () => {
    const out = renderSentStateBlock({
      sentAssetKeys: ["proof_reviews_1", "proof_reviews_1"],
      linkAlreadySent: false,
    });
    expect(out.match(/- proof_reviews_1/g)?.length).toBe(1);
  });
});
