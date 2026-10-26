import { describe, it, expect, vi, beforeEach } from "vitest";
import { code, callArgs } from "./helpers/source";

/**
 * An AI follow-up step never sends its own instruction.
 *
 * The incident (2026-10-26, Alex Bot): every AI call failed from 2026-10-25 22:31 UTC.
 * On an AI step (`ai_generate`), the step's `text` is guidance for the model, but when
 * generation came back empty the drip fell back to that text, so 8 leads received
 * messages like "Bring up the current offer: when they join the Diamond Academy, ...
 * don't open with "for sure" or "got you" since they haven't replied."
 *
 * Now: an AI step sends only the AI's own words. With none, it sends nothing and keeps
 * its turn (no claim), so the next cron run tries the AI again.
 */

vi.mock("@/lib/manychat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/manychat")>()),
  sendManychatMedia: vi.fn(async () => {}),
  sendManychatFlow: vi.fn(async () => {}),
}));

import { sendManychatMedia, sendManychatFlow } from "@/lib/manychat";
import { sendFollowup, followupMessageText, aiStepWroteNothing } from "@/lib/followup";
import type { FollowupStep } from "@/lib/types";

const INSTRUCTION =
  'Bring up the current offer. Then push them to join, e.g. "want me to get you in?" No link in this message.';

const aiStep = (over: Partial<FollowupStep> = {}): FollowupStep => ({
  delay_hours: 6,
  asset_keys: [],
  asset_key: null,
  text: INSTRUCTION,
  flow_ns: null,
  flow_name: null,
  flow_ns_fb: null,
  flow_name_fb: null,
  ai_generate: true,
  ...over,
});

const conversation = {
  id: "conv-1",
  manychat_subscriber_id: "sub-1",
  contact_name: "Test Lead",
  followup_count: 1,
  followup_step_index: 1,
  last_followup_at: "2026-10-26T02:30:24.000Z",
  platform: "messenger" as const,
};

/** A chainable stand-in for the Supabase client that records every write. */
function fakeSupabase() {
  const writes: { table: string; op: "update" | "insert"; payload: Record<string, unknown> }[] = [];
  const chain = () => {
    const q: Record<string, unknown> = {};
    q.eq = () => q;
    q.is = () => q;
    q.select = async () => ({ data: [{ id: conversation.id }], error: null });
    q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(ok, bad);
    return q;
  };
  const client = {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        writes.push({ table, op: "update", payload });
        return chain();
      },
      insert: (payload: Record<string, unknown>) => {
        writes.push({ table, op: "insert", payload });
        return chain();
      },
    }),
  };
  return { writes, client: client as unknown as Parameters<typeof sendFollowup>[0] };
}

const NOW = new Date("2026-10-26T09:00:21.000Z");

beforeEach(() => {
  vi.mocked(sendManychatMedia).mockClear();
  vi.mocked(sendManychatFlow).mockClear();
});

describe("followupMessageText: the words a step may send", () => {
  it("an AI step never sends its instruction", () => {
    expect(followupMessageText(aiStep(), undefined)).toBe("");
    expect(followupMessageText(aiStep(), null)).toBe("");
  });

  it("an AI step sends the AI's own words", () => {
    expect(followupMessageText(aiStep(), "hey, still thinking about it?")).toBe("hey, still thinking about it?");
  });

  it("a plain step sends its own text", () => {
    const plain = aiStep({ ai_generate: false, text: "last one from me, hit me back anytime" });
    expect(followupMessageText(plain, undefined)).toBe("last one from me, hit me back anytime");
  });
});

describe("aiStepWroteNothing: the cron's skip-and-retry rule", () => {
  it("is true for an AI step with no AI words, even when the step has instruction text", () => {
    expect(aiStepWroteNothing(aiStep(), undefined, "messenger")).toBe(true);
    expect(aiStepWroteNothing(aiStep(), "   ", "instagram")).toBe(true);
  });

  it("is true for an AI step with pictures but no AI words (never a picture with no message)", () => {
    expect(aiStepWroteNothing(aiStep({ asset_keys: ["proof_collections_1"] }), undefined, "messenger")).toBe(true);
  });

  it("is false once the AI wrote something", () => {
    expect(aiStepWroteNothing(aiStep(), "hey, you get my last message?", "messenger")).toBe(false);
  });

  it("is false for a plain step and for a step whose flow fires", () => {
    expect(aiStepWroteNothing(aiStep({ ai_generate: false }), undefined, "messenger")).toBe(false);
    expect(aiStepWroteNothing(aiStep({ flow_ns: "content2026" }), undefined, "instagram")).toBe(false);
  });
});

describe("sendFollowup on an AI step", () => {
  it("with no AI words: sends nothing, writes nothing, keeps its turn", async () => {
    const { writes, client } = fakeSupabase();
    const out = await sendFollowup(client, conversation, aiStep(), [], NOW, "mc-key", 2, {});
    expect(out).toBeNull();
    expect(sendManychatMedia).not.toHaveBeenCalled();
    expect(sendManychatFlow).not.toHaveBeenCalled();
    expect(writes).toEqual([]); // no claim, so the next run retries this step
  });

  it("with AI words: sends exactly those words, never the instruction", async () => {
    const { writes, client } = fakeSupabase();
    const words = "hey Test Lead, my team can go after 1 inquiry on your Experian for free. want me to get you in?";
    const out = await sendFollowup(client, conversation, aiStep(), [], NOW, "mc-key", 2, { overrideText: words });
    expect(out).toBe(words);
    expect(sendManychatMedia).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendManychatMedia).mock.calls[0][0];
    expect(sent.text).toBe(words);
    expect(JSON.stringify(vi.mocked(sendManychatMedia).mock.calls)).not.toContain("Bring up the current offer");
    const recorded = writes.find((w) => w.table === "messages");
    expect(recorded?.payload.content).toBe(words);
    expect(recorded?.payload.ai_generated).toBe(true);
  });
});

describe("sendFollowup on a plain step (unchanged)", () => {
  it("still sends the step's own text", async () => {
    const { client } = fakeSupabase();
    const plain = aiStep({ ai_generate: false, text: "last one from me, hit me back anytime" });
    const out = await sendFollowup(client, conversation, plain, [], NOW, "mc-key", 3, {});
    expect(out).toBe("last one from me, hit me back anytime");
    expect(vi.mocked(sendManychatMedia).mock.calls[0][0].text).toBe("last one from me, hit me back anytime");
  });
});

describe("the follow-up cron uses the rule", () => {
  const CRON = "app/api/cron/followups/route.ts";

  it("skips an AI step the AI wrote nothing for, whatever its text says", () => {
    const src = code(CRON);
    const calls = callArgs(src, "aiStepWroteNothing");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("overrideText");
  });
});
