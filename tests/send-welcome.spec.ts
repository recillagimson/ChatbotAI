import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The dashboard's Welcome button (POST /api/conversations/[id]/send-welcome).
 *
 * The incident (2026-10-06, HTKeem Bot, keyword-only replies on): the owner sent the
 * welcome voice note by hand to a lead who had never matched a keyword, the lead
 * answered, and the bot stayed silent, because the keyword gate still read the thread
 * as never engaged. Sending the welcome by hand now also hands the thread to the bot:
 * it stamps bot_forced_on_at, the same manual override the BOT_ON tag sets, which the
 * webhook's keyword gate already honours.
 */

// ---------------------------------------------------------------------------
// Route harness: the real handler over a small recording Supabase stand-in.
// ---------------------------------------------------------------------------

const flowSpy = vi.fn();
let admin: { id: string } | null;
let conversationRow: Record<string, unknown> | null;
let updates: Record<string, unknown>[];
let inserts: Record<string, unknown>[];
/** An update that writes this column fails, as a database error would. */
let failColumn: string | null;

function query() {
  let pending: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) chain[m] = () => chain;
  chain.update = (values: Record<string, unknown>) => {
    pending = values;
    updates.push(values);
    return chain;
  };
  chain.insert = async (row: Record<string, unknown>) => {
    inserts.push(row);
    return { error: null };
  };
  chain.single = async () => ({
    data: conversationRow,
    error: conversationRow ? null : { message: "not found" },
  });
  // `await supabase.from(t).update(...).eq(...)` resolves the chain itself.
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve(
      pending && failColumn && failColumn in pending
        ? { data: null, error: { message: "write failed" } }
        : { data: [{ id: "c1" }], error: null }
    );
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: () => query() }),
}));

vi.mock("@/lib/admin", () => ({
  requireSuperadmin: async () => admin,
}));

vi.mock("@/lib/manychat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/manychat")>()),
  resolveManychatApiKey: () => "mc-key",
  sendManychatFlow: (...args: unknown[]) => flowSpy(...args),
}));

async function postWelcome() {
  const { POST } = await import("@/app/api/conversations/[id]/send-welcome/route");
  const res = await POST(
    new Request("http://localhost/api/conversations/c1/send-welcome", { method: "POST" }),
    { params: Promise.resolve({ id: "c1" }) }
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const forcedOn = () => updates.filter((u) => "bot_forced_on_at" in u);

beforeEach(() => {
  flowSpy.mockReset();
  flowSpy.mockResolvedValue({});
  admin = { id: "admin-1" };
  conversationRow = {
    id: "c1",
    manychat_subscriber_id: "555",
    chatbots: { welcome_flow_ns: "content123", manychat_api_key_enc: "enc" },
  };
  updates = [];
  inserts = [];
  failColumn = null;
});

describe("sending the welcome by hand", () => {
  it("hands the thread to the bot, so a keyword-gated bot answers what comes next (the incident)", async () => {
    const { status, body } = await postWelcome();

    expect(status).toBe(200);
    expect(flowSpy).toHaveBeenCalledTimes(1);
    expect(forcedOn()).toHaveLength(1);
    expect(typeof forcedOn()[0].bot_forced_on_at).toBe("string");
    expect(body).toMatchObject({ ok: true, sent: true, engaged: true });
  });

  it("writes the override on its own, never inside the welcomed_at claim", async () => {
    // The claim only matches a thread never welcomed before, so an override folded into
    // it would be skipped on every re-send (and PostgREST rejects a whole update over
    // one missing column).
    await postWelcome();

    expect(Object.keys(forcedOn()[0])).toEqual(["bot_forced_on_at"]);
  });

  it("leaves the thread gated when the welcome did not go out", async () => {
    flowSpy.mockRejectedValue(new Error("ManyChat refused"));

    const { status, body } = await postWelcome();

    expect(status).toBe(502);
    expect(body).toMatchObject({ ok: false, reason: "send_failed" });
    expect(forcedOn()).toHaveLength(0);
  });

  it("says so when the welcome went out but the override could not be saved", async () => {
    // Reporting a failure here would invite a second click, and a second voice note to
    // a real lead. Reporting plain success would leave the owner believing the bot took
    // over while it still waits for a keyword.
    failColumn = "bot_forced_on_at";

    const { status, body } = await postWelcome();

    expect(status).toBe(200);
    expect(flowSpy).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ ok: true, sent: true, engaged: false });
  });

  it("does nothing for anyone but a superadmin", async () => {
    admin = null;

    const { status } = await postWelcome();

    expect(status).toBe(403);
    expect(flowSpy).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});
