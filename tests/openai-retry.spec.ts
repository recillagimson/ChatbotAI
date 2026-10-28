import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openaiChat, isTransientOpenAIError, OpenAIChatError, MIN_ATTEMPT_MS } from "@/lib/openai";
import { generateReply } from "@/lib/anthropic";
import type { Chatbot } from "@/lib/types";

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

// 2xx but empty content + finish_reason "length": a reasoning model consumed the whole
// max_completion_tokens budget on hidden reasoning. Treated as a retryable truncation.
function emptyLengthResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message: { content: "" }, finish_reason: "length" }], usage: { total_tokens: 400 } }),
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

  it("retries an empty-because-truncated result (finish_reason=length)", () => {
    expect(isTransientOpenAIError(new OpenAIChatError("empty (length)", undefined, true))).toBe(true);
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

  it("an empty finish_reason=length reply is a retryable truncation", async () => {
    const fetchMock = scriptedFetch([emptyLengthResponse(), okResponse("recovered")]);
    vi.stubGlobal("fetch", fetchMock);
    const res = await openaiChat({ ...args, retries: 1, sleep: noSleep });
    expect(res.text).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("with retries:0 a truncated reply throws (no silent empty return to the canned fallback)", async () => {
    const fetchMock = scriptedFetch([emptyLengthResponse()]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(openaiChat({ ...args, sleep: noSleep })).rejects.toThrow(/finish_reason=length/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("doubles the token budget on a truncation retry so the reply can actually land", async () => {
    const bodies: Array<{ max_completion_tokens: number }> = [];
    let i = 0;
    const seq = [emptyLengthResponse(), okResponse("recovered")];
    const fetchMock = vi.fn(async (_url: unknown, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      const item = seq[Math.min(i, seq.length - 1)];
      i++;
      return item;
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await openaiChat({ ...args, maxTokens: 1200, retries: 1, sleep: noSleep });
    expect(res.text).toBe("recovered");
    expect(bodies[0].max_completion_tokens).toBe(1200);
    expect(bodies[1].max_completion_tokens).toBe(2400);
  });
});

/**
 * A deadline for the whole call, retries included. TikTok's reply rides the webhook's
 * HTTP response, and ManyChat stops waiting after about 10 seconds: two 8s attempts
 * could run 16s and the lead got nothing. With `deadlineAt`, every attempt fits in the
 * time left, a retry that can't fit is skipped, and the call throws in time for the
 * caller to send its fallback line.
 */
describe("openaiChat - deadline for the whole call", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const args = { model: "gpt-x", system: "s", messages: [{ role: "user" as const, content: "hi" }] };
  /** A clock the fetch stub moves forward: every attempt takes `ms`. */
  function clockedFetch(seq: Array<Response | Error>, ms: number) {
    let t = 0;
    const inner = scriptedFetch(seq);
    const fetchMock = vi.fn(async () => {
      t += ms;
      return inner();
    });
    return { fetchMock, now: () => t };
  }

  it("skips a retry that would not fit, and throws the attempt's own error", async () => {
    const { fetchMock, now } = clockedFetch([errResponse(503), okResponse("too late")], 2_000);
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      openaiChat({ ...args, retries: 1, sleep: noSleep, now, deadlineAt: 3_000 })
    ).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still retries when the retry fits", async () => {
    const { fetchMock, now } = clockedFetch([errResponse(503), okResponse("recovered")], 2_000);
    vi.stubGlobal("fetch", fetchMock);
    const res = await openaiChat({ ...args, retries: 1, sleep: noSleep, now, deadlineAt: 10_000 });
    expect(res.text).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a retry that runs out of time during its backoff reports the attempt's own error", async () => {
    let t = 0;
    const inner = scriptedFetch([errResponse(503), okResponse("never")]);
    const fetchMock = vi.fn(async () => {
      t += 1_000;
      return inner();
    });
    vi.stubGlobal("fetch", fetchMock);
    // The backoff overruns (a slow timer): 3s pass instead of 400ms.
    const slowSleep = async () => {
      t += 3_000;
    };
    await expect(
      openaiChat({ ...args, retries: 1, sleep: slowSleep, now: () => t, deadlineAt: 5_000 })
    ).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("generateReply hands its deadline to the call: too close, nothing is sent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const chatbot = { id: "b1", name: "Test", tone: "friendly" } as unknown as Chatbot;
    await expect(
      generateReply({ chatbot, kbBlock: "", history: [], userMessage: "hi", deadlineAt: Date.now() + 500 })
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts no attempt when less than the minimum is left", async () => {
    const fetchMock = scriptedFetch([okResponse("never")]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      openaiChat({ ...args, retries: 1, sleep: noSleep, now: () => 0, deadlineAt: MIN_ATTEMPT_MS - 1 })
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cuts an attempt's own timeout to the time left", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init.signal;
            init.signal.addEventListener("abort", () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              reject(e);
            });
          })
      )
    );
    const call = openaiChat({ ...args, timeoutMs: 8_000, sleep: noSleep, now: () => 0, deadlineAt: 3_000 });
    const settled = call.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(await settled).toMatchObject({ name: "AbortError" });
  });

  it("without a deadline nothing changes: the 8s attempt timeout is used as given", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init.signal;
            init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          })
      )
    );
    const settled = openaiChat({ ...args, timeoutMs: 8_000, sleep: noSleep }).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await settled;
  });
});
