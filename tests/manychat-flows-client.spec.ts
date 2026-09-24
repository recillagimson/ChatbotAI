import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Phase 3, 03-03 Part A: the Follow-ups tab makes ONE ManyChat flows request,
 * not three. WelcomeForm, LinkFlowForm and FollowupSequenceForm mount together
 * and all need the same list; each used to fire its own GET, which cost three
 * auth checks and three calls from Vercel syd1 to api.manychat.com in Frankfurt.
 *
 * This is request DEDUP, not a cache: nothing is kept once the request settles.
 */

type Mod = typeof import("@/components/dashboard/use-manychat-flows");

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const response = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let mod: Mod;

async function load({ browser }: { browser: boolean }) {
  // A fresh module per test, so the in-flight Map starts empty.
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", browser ? {} : undefined);
  mod = await import("@/components/dashboard/use-manychat-flows");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("in the browser, concurrent loads for one bot share a single request", () => {
  beforeEach(() => load({ browser: true }));

  it("three concurrent loads make one fetch and all get the same flows", async () => {
    const d = deferred<Response>();
    fetchMock.mockReturnValueOnce(d.promise);

    const a = mod.loadManychatFlows("bot-a");
    const b = mod.loadManychatFlows("bot-a");
    const c = mod.loadManychatFlows("bot-a");
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    d.resolve(response({ flows: [{ ns: "content1", name: "Welcome" }] }));
    const results = await Promise.all([a, b, c]);
    for (const r of results) {
      expect(r).toEqual({ flows: [{ ns: "content1", name: "Welcome" }], error: null });
    }
  });

  it("keeps nothing: once a request settles, the next load fetches again", async () => {
    fetchMock.mockResolvedValue(response({ flows: [] }));
    await mod.loadManychatFlows("bot-a");
    await mod.loadManychatFlows("bot-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("two different bots never share a request", async () => {
    fetchMock.mockResolvedValue(response({ flows: [] }));
    await Promise.all([mod.loadManychatFlows("bot-a"), mod.loadManychatFlows("bot-b")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual([
      "/api/chatbots/bot-a/manychat-flows",
      "/api/chatbots/bot-b/manychat-flows",
    ]);
  });

  it("asks the route with no-store and an encoded id", async () => {
    fetchMock.mockResolvedValue(response({ flows: [] }));
    await mod.loadManychatFlows("a/b c");
    expect(fetchMock).toHaveBeenCalledWith("/api/chatbots/a%2Fb%20c/manychat-flows", {
      cache: "no-store",
    });
  });

  it("surfaces the route's error message, or a fallback when it has none", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "Connect your ManyChat API key." }, false));
    expect(await mod.loadManychatFlows("bot-a")).toEqual({
      flows: [],
      error: "Connect your ManyChat API key.",
    });

    fetchMock.mockResolvedValueOnce(response({}, false));
    expect(await mod.loadManychatFlows("bot-a")).toEqual({
      flows: [],
      error: mod.FLOWS_FALLBACK_ERROR,
    });

    // A 200 whose body is not the expected shape is treated as a failure too.
    fetchMock.mockResolvedValueOnce(response({ flows: "nope" }));
    expect(await mod.loadManychatFlows("bot-a")).toEqual({
      flows: [],
      error: mod.FLOWS_FALLBACK_ERROR,
    });
  });

  it("a network failure resolves to the fallback and is not remembered", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await mod.loadManychatFlows("bot-a")).toEqual({
      flows: [],
      error: mod.FLOWS_FALLBACK_ERROR,
    });
    fetchMock.mockResolvedValueOnce(response({ flows: [{ ns: "c2", name: "Link" }] }));
    expect(await mod.loadManychatFlows("bot-a")).toEqual({
      flows: [{ ns: "c2", name: "Link" }],
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("on the server, nothing is shared", () => {
  beforeEach(() => load({ browser: false }));

  it("concurrent loads each make their own request", async () => {
    // During SSR a module-level Map would be shared by every tenant's requests
    // in the same Node process. The loader must refuse to share there.
    fetchMock.mockResolvedValue(response({ flows: [] }));
    const a = mod.loadManychatFlows("bot-a");
    const b = mod.loadManychatFlows("bot-a");
    expect(b).not.toBe(a);
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
