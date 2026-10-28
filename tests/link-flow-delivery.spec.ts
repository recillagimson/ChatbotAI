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
  let texts: string[];

  beforeEach(() => {
    calls = [];
    texts = [];
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
            if (!isMedia) texts.push(...messages.map((m: { text?: string }) => m?.text ?? ""));
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

  it("still fires a pending link flow when a newer message supersedes the run", async () => {
    // Live bug: the lead replied ~30s after the bot started trickling its reply. The newer
    // inbound superseded this run mid-trickle, the flow was dropped with the leftover
    // bubbles, yet the "(sent link:)" marker was already saved - so the lead got no link
    // and the bot kept saying "it's right up there". The leftover TEXT is rightly dropped
    // (the newer run answers), but a link the bot already promised must still go out.
    const items: PacedItem[] = [
      { kind: "text", text: "bet" },
      { kind: "text", text: "use this link to get signed up" },
      { kind: "flow", flowNs: "F_LINK" },
      { kind: "text", text: "once you're in, check your messages" },
    ];
    const res = await sendManychatSequencePaced({
      ...base,
      items,
      shouldAbort: async () => "superseded", // fires before item 2
    });
    expect(calls).toEqual(["text", "flow"]);
    expect(res.aborted).toBe(true);
  });

  it("still sends a pending link bubble (a typed URL) when a newer message supersedes the run", async () => {
    // Live 2026-10-28: a Messenger bot that pastes its join link as a plain URL had its
    // reply cut by the lead's next message, and the URL bubble went with the leftover text.
    // The saved reply holds the URL, which marks the link as sent, so the bot then told the
    // lead it was "right up there". Only the link goes out; the rest of the leftover is
    // still dropped (the newer run answers).
    const items: PacedItem[] = [
      { kind: "text", text: "love that" },
      { kind: "text", text: "you can join here" },
      { kind: "text", text: "https://www.skool.com/example/about?ref=abc" },
      { kind: "text", text: "let me know once you're in" },
      { kind: "text", text: "or grab it at www.example.com/join" },
    ];
    const res = await sendManychatSequencePaced({
      ...base,
      platform: "messenger",
      items,
      shouldAbort: async () => "superseded", // fires before item 2
    });
    expect(texts).toEqual([
      "love that",
      "https://www.skool.com/example/about?ref=abc",
      "or grab it at www.example.com/join",
    ]);
    expect(res.aborted).toBe(true);
  });

  it("on Instagram a leftover link bubble is not sent (text links never go out there)", async () => {
    // Instagram strips every URL from text, so a link bubble would arrive as a lead-in with
    // no link. There the link only travels as a flow, which still fires.
    const items: PacedItem[] = [
      { kind: "text", text: "love that" },
      { kind: "text", text: "join here: https://www.skool.com/example/about" },
      { kind: "flow", flowNs: "F_LINK" },
    ];
    await sendManychatSequencePaced({
      ...base,
      items,
      shouldAbort: async () => "superseded",
    });
    expect(calls).toEqual(["text", "flow"]);
  });

  it("a failed pending link still lets the next one go out, then reports the failure", async () => {
    // ManyChat refuses the URL bubble (permanent 400, no retry); the flow after it must
    // still fire, and the call throws so the webhook logs push_failed.
    const ok = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) =>
        String(init?.body ?? "").includes("skool.com")
          ? ({ ok: false, status: 400, text: async () => "refused" } as unknown as Response)
          : ok(url, init as RequestInit)
      )
    );
    const items: PacedItem[] = [
      { kind: "text", text: "love that" },
      { kind: "text", text: "https://www.skool.com/example/about" },
      { kind: "flow", flowNs: "F_LINK" },
    ];
    await expect(
      sendManychatSequencePaced({
        ...base,
        platform: "messenger",
        items,
        shouldAbort: async () => "superseded",
      })
    ).rejects.toThrow(/one or more items failed/);
    expect(calls).toEqual(["text", "flow"]);
  });

  it("a mute or owner takeover still stops a leftover link bubble", async () => {
    const items: PacedItem[] = [
      { kind: "text", text: "love that" },
      { kind: "text", text: "https://www.skool.com/example/about" },
    ];
    await sendManychatSequencePaced({
      ...base,
      platform: "messenger",
      items,
      shouldAbort: async () => true,
    });
    expect(texts).toEqual(["love that"]);
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
