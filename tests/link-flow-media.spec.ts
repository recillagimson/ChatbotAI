import { describe, it, expect } from "vitest";
import { buildPacedItems, type PacedItem } from "@/lib/manychat";
import { findAssetDirectives } from "@/lib/ai-media";
import type { LinkFlowDelivery } from "@/lib/link-flow";

/**
 * Pure coverage for the media-interleaving pieces:
 *  - findAssetDirectives: character-accurate spans + lower-cased keys, NOT de-duplicated
 *    (the plan owns dedup), so the webhook can interleave a [[SEND_ASSET]] at its position.
 *  - buildPacedItems: resolves each media step's key to an asset, skips unresolved keys, and
 *    coalesces CONSECUTIVE media into one send so a "numbered set" lands together - while a
 *    text or flow between two media still breaks the run.
 */

describe("findAssetDirectives", () => {
  it("returns each directive's span and lower-cased key, in order", () => {
    const text = "hi [[SEND_ASSET: Foo]] and [[SEND_ASSET: bar_1]]";
    const matches = findAssetDirectives(text);
    expect(matches.map((m) => m.key)).toEqual(["foo", "bar_1"]);
    // The spans point at the real directive text (so the caller can strip/cut precisely).
    for (const m of matches) {
      expect(text.slice(m.start, m.end)).toMatch(/^\[\[\s*SEND_ASSET\s*:/i);
    }
  });

  it("does NOT de-duplicate (returns every occurrence; the plan dedupes)", () => {
    const matches = findAssetDirectives("[[SEND_ASSET: a]] [[SEND_ASSET: a]]");
    expect(matches.map((m) => m.key)).toEqual(["a", "a"]);
  });

  it("returns [] for text with no directives (and for empty)", () => {
    expect(findAssetDirectives("just a normal reply")).toEqual([]);
    expect(findAssetDirectives("")).toEqual([]);
    expect(findAssetDirectives(null)).toEqual([]);
  });
});

describe("buildPacedItems", () => {
  const img = (url: string) => ({ kind: "image" as const, url });

  it("passes text/flow through and resolves media keys to assets", () => {
    const bubbles: LinkFlowDelivery[] = [
      { kind: "text", text: "hi" },
      { kind: "media", key: "x" },
      { kind: "flow", ns: "f1", name: "F1" },
    ];
    const items = buildPacedItems(bubbles, { x: img("https://cdn/x.jpg") });
    expect(items).toEqual<PacedItem[]>([
      { kind: "text", text: "hi" },
      { kind: "media", assets: [img("https://cdn/x.jpg")] },
      { kind: "flow", flowNs: "f1" },
    ]);
  });

  it("coalesces consecutive media into ONE send (numbered set lands together)", () => {
    const bubbles: LinkFlowDelivery[] = [
      { kind: "text", text: "proof" },
      { kind: "media", key: "a" },
      { kind: "media", key: "b" },
      { kind: "text", text: "want in?" },
    ];
    const items = buildPacedItems(bubbles, { a: img("https://cdn/a.jpg"), b: img("https://cdn/b.jpg") });
    expect(items).toEqual<PacedItem[]>([
      { kind: "text", text: "proof" },
      { kind: "media", assets: [img("https://cdn/a.jpg"), img("https://cdn/b.jpg")] },
      { kind: "text", text: "want in?" },
    ]);
  });

  it("a flow between two media breaks the run into two sends", () => {
    const bubbles: LinkFlowDelivery[] = [
      { kind: "media", key: "a" },
      { kind: "flow", ns: "f", name: null },
      { kind: "media", key: "b" },
    ];
    const items = buildPacedItems(bubbles, { a: img("https://cdn/a.jpg"), b: img("https://cdn/b.jpg") });
    expect(items).toEqual<PacedItem[]>([
      { kind: "media", assets: [img("https://cdn/a.jpg")] },
      { kind: "flow", flowNs: "f" },
      { kind: "media", assets: [img("https://cdn/b.jpg")] },
    ]);
  });

  it("skips an unresolved media key (dropped by the cap or missing from the library)", () => {
    const bubbles: LinkFlowDelivery[] = [
      { kind: "text", text: "a" },
      { kind: "media", key: "missing" },
      { kind: "text", text: "b" },
    ];
    // 'missing' is absent from resolvedAssets -> the media step collapses away.
    expect(buildPacedItems(bubbles, {})).toEqual<PacedItem[]>([
      { kind: "text", text: "a" },
      { kind: "text", text: "b" },
    ]);
  });

  it("coalesces trailing media at the very end", () => {
    const bubbles: LinkFlowDelivery[] = [
      { kind: "text", text: "here" },
      { kind: "media", key: "a" },
      { kind: "media", key: "b" },
    ];
    const items = buildPacedItems(bubbles, { a: img("https://cdn/a.jpg"), b: img("https://cdn/b.jpg") });
    expect(items).toEqual<PacedItem[]>([
      { kind: "text", text: "here" },
      { kind: "media", assets: [img("https://cdn/a.jpg"), img("https://cdn/b.jpg")] },
    ]);
  });

  it("returns [] for an empty plan", () => {
    expect(buildPacedItems([], {})).toEqual([]);
  });
});
