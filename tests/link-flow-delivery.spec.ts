import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendManychatSequencePaced, type PacedItem } from "@/lib/manychat";

/**
 * Delivery-side coverage for the interleaved link-flow fix: the pure planLinkFlow plan is
 * covered in link-flow.spec.ts; here we prove the SENDER actually walks a mixed
 * text+flow sequence in order and awaited, and that a stand-down stops a flow too. fetch
 * is mocked so no network happens; pace:false skips all sleeps (fast, deterministic).
 * A regression that reordered flows back to "after all text" would fail the order test.
 */
describe("sendManychatSequencePaced (interleaved delivery)", () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        const u = String(url);
        if (u.includes("sendFlow")) {
          calls.push("flow");
        } else if (u.includes("sendContent")) {
          // Media and text share the sendContent endpoint; tell them apart by whether the
          // payload carries a non-text message block (image/video/audio/file).
          let isMedia = false;
          try {
            const body = JSON.parse(init?.body ?? "{}");
            const messages = body?.data?.content?.messages ?? [];
            isMedia =
              Array.isArray(messages) &&
              messages.some((m: { type?: string }) => m?.type && m.type !== "text");
          } catch {
            /* treat as text */
          }
          calls.push(isMedia ? "media" : "text");
        } else {
          calls.push(`other:${u}`);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "success" }),
        } as unknown as Response;
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const base = {
    subscriberId: "s1",
    apiKey: "k",
    platform: "instagram" as const,
    pace: false as const,
  };

  it("delivers text and flows in the given order, each awaited", async () => {
    const items: PacedItem[] = [
      { kind: "text", text: "one" },
      { kind: "flow", flowNs: "F_DELEG" },
      { kind: "text", text: "two" },
      { kind: "flow", flowNs: "F_BOOK" },
    ];
    const res = await sendManychatSequencePaced({ ...base, items });
    expect(res).toEqual({ aborted: false });
    // The whole point of the fix: interleaved, not text-then-all-flows.
    expect(calls).toEqual(["text", "flow", "text", "flow"]);
  });

  it("stops before a flow when shouldAbort fires (no link sends after takeover)", async () => {
    const items: PacedItem[] = [
      { kind: "text", text: "one" },
      { kind: "flow", flowNs: "F_DELEG" },
    ];
    const res = await sendManychatSequencePaced({
      ...base,
      items,
      shouldAbort: async () => true, // fires before item 2 (the flow)
    });
    expect(res).toEqual({ aborted: true });
    expect(calls).toEqual(["text"]); // the flow never fired
  });

  it("no-ops on an empty sequence", async () => {
    const res = await sendManychatSequencePaced({ ...base, items: [] });
    expect(res).toEqual({ aborted: false });
    expect(calls).toEqual([]);
  });

  it("delivers media at its position, coalesced into a single send, each awaited", async () => {
    const items: PacedItem[] = [
      { kind: "text", text: "one" },
      {
        kind: "media",
        assets: [
          { kind: "image", url: "https://cdn/a.jpg" },
          { kind: "image", url: "https://cdn/b.jpg" },
        ],
      },
      { kind: "text", text: "two" },
      { kind: "flow", flowNs: "F" },
    ];
    const res = await sendManychatSequencePaced({ ...base, items });
    expect(res).toEqual({ aborted: false });
    // Media lands BETWEEN the two text bubbles (not after all of them), and the two assets
    // are one coalesced send - the whole point of extending positional ordering to media.
    expect(calls).toEqual(["text", "media", "text", "flow"]);
  });

  it("stops before a media send when shouldAbort fires (no asset sent after takeover)", async () => {
    const items: PacedItem[] = [
      { kind: "text", text: "one" },
      { kind: "media", assets: [{ kind: "image", url: "https://cdn/a.jpg" }] },
    ];
    const res = await sendManychatSequencePaced({
      ...base,
      items,
      shouldAbort: async () => true, // fires before item 2 (the media)
    });
    expect(res).toEqual({ aborted: true });
    expect(calls).toEqual(["text"]); // the media never sent
  });

  it("drops an empty media item (no assets) without a send", async () => {
    const items: PacedItem[] = [
      { kind: "text", text: "one" },
      { kind: "media", assets: [] },
      { kind: "text", text: "two" },
    ];
    const res = await sendManychatSequencePaced({ ...base, items });
    expect(res).toEqual({ aborted: false });
    expect(calls).toEqual(["text", "text"]);
  });
});
