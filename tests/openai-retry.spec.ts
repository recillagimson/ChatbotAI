import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openaiChat, isTransientOpenAIError, OpenAIChatError } from "@/lib/openai";

/**
 * The DM-reply transport (openaiChat) is a single raw fetch that THROWS on any
 * non-2xx or timeout, and its caller (generateReply -> route.ts) falls back to the
 * canned "a teammate will follow up shortly." line when it throws. Before this fix a
 * single transient provider blip (429 / 5xx overload / request timeout) produced that
 * canned reply on a live lead. The fix: an OPT-IN bounded retry (default 0 = unchanged
 * for the latency-sensitive screener/classifier callers) that retries only TRANSIENT
 * errors and never a permanent 4xx/quota error.
 */

const noSleep = () => Promise.resolve();

// Minimal Response-likes for the fetch stub.
function okResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 5 } }),
  } as unknown as Response;
}
function errResponse(status: number, detail = ""): Response {
  return {
    ok: false,
    status,
    text: async () => detail,
    json: async () => ({}),
  } as unknown as Response;
}

// A fetch that plays a scripted sequence of Responses or thrown Errors, one per call.
function scriptedFetch(seq: Array<Response | Error>) {
  let i = 0;
  return vi.fn(async () => {
    const item = seq[Math.min(i, seq.length - 1)];
    i++;
    if (item instanceof Error) throw item;
    return item;
  });
}

describe("isTransientOpenAIError - what is worth retrying", () => {
  it("retries rate-limit, server/overload, and timeout statuses", () => {
    for (const s of [429, 500, 502, 503, 504, 408, 409]) {
      expect(isTransientOpenAIError(new OpenAIChatError(`fail (${s})`, s))).toBe(true);
    }
  });

  it("does NOT retry permanent request/config errors", () => {
    for (const s of [400, 401, 403, 404, 422]) {
      expect(isTransientOpenAIError(new OpenAIChatError(`fail (${s})`, s))).toBe(false);
    }
  });

  it("does NOT retry an exhausted quota (a 429 that a retry can't fix)", () => {
    expect(
      isTransientOpenAIError(
        new OpenAIChatError('fail (429): {"error":{"type":"insufficient_quota"}}', 429)
      )
    ).toBe(false);
  });

  it("retries our own timeout (AbortError) and a network TypeError", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isTransientOpenAIError(abort)).toBe(true);
    expect(isTransientOpenAIError(new TypeError("fetch failed"))).toBe(true);
  });

  it("does not retry an arbitrary non-transient error", () => {
    expect(isTransientOpenAIError(new Error("something else"))).toBe(false);
  });
});

describe("openaiChat - bounded retry loop", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const args = { model: "gpt-x", system: "s", messages: [{ role: "user" as const, content: "hi" }] };

  it("returns on the first success without retrying", async () => {
    const fetchMock = scriptedFetch([okResponse("hello")]);
    vi.stubGlobal("fetch", fetchMock);
    const res = await openaiChat({ ...args, retries: 2, sleep: noSleep });
    expect(res.text).toBe("hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 500 then succeeds", async () => {
    const fetchMock = scriptedFetch([errResponse(500, "overloaded"), okResponse("recovered")]);
    vi.stubGlobal("fetch", fetchMock);
    const res = await openaiChat({ ...args, retries: 2, sleep: noSleep });
    expect(res.text).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a network error (TypeError) then succeeds", async () => {
    const fetchMock = scriptedFetch([new TypeError("fetch failed"), okResponse("recovered")]);
    vi.stubGlobal("fetch", fetchMock);
    const res = await openaiChat({ ...args, retries: 1, sleep: noSleep });
    expect(res.text).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a permanent 400 - throws after one attempt", async () => {
    const fetchMock = scriptedFetch([errResponse(400, "bad model"), okResponse("never")]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(openaiChat({ ...args, retries: 2, sleep: noSleep })).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on persistent transient failure", async () => {
    const fetchMock = scriptedFetch([errResponse(503), errResponse(503), errResponse(503), errResponse(503)]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(openaiChat({ ...args, retries: 2, sleep: noSleep })).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("default (no retries) is a single attempt - unchanged for existing callers", async () => {
    const fetchMock = scriptedFetch([errResponse(500), okResponse("never")]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(openaiChat({ ...args, sleep: noSleep })).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
