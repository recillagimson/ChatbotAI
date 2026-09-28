import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatTurn, draftChangeRequest, UNAPPLIED_PROPOSAL_TEXT } from "@/lib/openai-changes";
import type { Chatbot } from "@/lib/types";

/**
 * The change assistant's one repair round (lib/openai-changes.ts proposeWithRepair):
 * when the model's edit names a passage that is not in the live text, the exchange
 * is replayed with a tool result explaining what failed and a forced second call.
 * OpenAI is faked; nothing leaves the machine.
 */

const BASE = "Coaching is $97 a month.\nThe course is $7.";

function toolResponse(args: object, content: string | null = null, finish = "tool_calls") {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "propose_changes", arguments: JSON.stringify(args) } },
            ],
          },
          finish_reason: finish,
        },
      ],
      usage: { total_tokens: 100 },
    }),
  };
}

function textResponse(content: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { total_tokens: 10 } }),
  };
}

const turn = () =>
  chatTurn({
    chatbot: { name: "Acme" },
    kbEntries: [],
    messages: [{ role: "user", content: "Raise coaching to $99" }],
    category: "offers",
    currentSection: BASE,
  });

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("proposeWithRepair (via chatTurn / draftChangeRequest)", () => {
  it("repairs a proposal whose passage did not match, replaying the tool call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(toolResponse({ summary: "x", edits: [{ find: "$97 per month", replace: "$99 a month" }] }))
      .mockResolvedValueOnce(
        toolResponse({ summary: "Coaching goes to $99.", edits: [{ find: "$97 a month", replace: "$99 a month" }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    const out = await turn();
    expect(out.proposal?.section_content).toBe(BASE.replace("$97", "$99"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.tool_choice).toEqual({ type: "function", function: { name: "propose_changes" } });
    const msgs = second.messages;
    const assistant = msgs[msgs.length - 2];
    const tool = msgs[msgs.length - 1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.tool_calls[0].id).toBe("call_1");
    expect(tool).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(tool.content).toMatch(/not found/);
  });

  it("says it could not line the change up when the repair fails too, never claiming success", async () => {
    const bad = toolResponse({ summary: "x", edits: [{ find: "Nope", replace: "y" }] }, "Here's the change!");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(bad));
    const out = await turn();
    expect(out.proposal).toBeUndefined();
    expect(out.assistantText).toBe(UNAPPLIED_PROPOSAL_TEXT);
  });

  it("does not retry a plain question", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(textResponse("Which price do you mean?"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await turn();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.assistantText).toBe("Which price do you mean?");
  });

  it("skips the repair when too little of the shared time budget is left", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(toolResponse({ summary: "x", edits: [{ find: "Nope", replace: "y" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValueOnce(t0).mockReturnValue(t0 + 45_000);
    const out = await turn();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.proposal).toBeUndefined();
  });

  it("the admin draft throws with the reason when nothing applies", async () => {
    const bad = toolResponse({ summary: "x", edits: [{ find: "Nope", replace: "y" }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(bad));
    await expect(
      draftChangeRequest({
        chatbot: { name: "Acme" } as unknown as Chatbot,
        kbEntries: [],
        requestText: "Raise coaching to $99",
        category: "offers",
        currentSection: BASE,
      })
    ).rejects.toThrow(/did not apply/);
  });
});
