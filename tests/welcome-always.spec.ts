import { describe, it, expect } from "vitest";
import { welcomeAction, shouldSendWelcome, type WelcomeInput } from "@/lib/welcome";
import { splitBurst } from "@/lib/debounce";

/**
 * "Welcome every new contact" (chatbots.welcome_always). With it on, every first
 * message gets the Welcome VM; a bare opener gets the VM alone, anything else gets
 * the VM AND an AI answer. With it off, behavior is exactly as before.
 */
function input(over: Partial<WelcomeInput> = {}, bot: Partial<WelcomeInput["chatbot"]> = {}): WelcomeInput {
  return {
    welcomedAt: null,
    entryPoint: null,
    hasMedia: false,
    text: "how long does it take?",
    keywordMatched: false,
    ...over,
    chatbot: {
      welcome_enabled: true,
      welcome_flow_ns: "flow_1",
      welcome_keywords: ["67", "$67"],
      welcome_use_keyword_triggers: false,
      welcome_always: true,
      ...bot,
    },
  };
}

describe("welcomeAction with welcome_always on", () => {
  it("a question gets the welcome AND an answer", () => {
    expect(welcomeAction(input())).toBe("welcome_and_answer");
  });
  it("media gets the welcome AND an answer", () => {
    expect(welcomeAction(input({ hasMedia: true, text: "" }))).toBe("welcome_and_answer");
  });
  it("a bare greeting or welcome keyword gets the welcome alone", () => {
    expect(welcomeAction(input({ text: "hey" }))).toBe("welcome_only");
    expect(welcomeAction(input({ text: "$67" }))).toBe("welcome_only");
    expect(welcomeAction(input({ text: "67" }))).toBe("welcome_only");
  });
  it("a comment opt-in gets the welcome alone", () => {
    expect(welcomeAction(input({ entryPoint: "comment" }))).toBe("welcome_only");
  });
  it("an already-welcomed contact gets nothing", () => {
    expect(welcomeAction(input({ welcomedAt: "2026-10-01T00:00:00Z" }))).toBe("none");
  });
  it("a bot without a flow or with the welcome off gets nothing", () => {
    expect(welcomeAction(input({}, { welcome_flow_ns: null }))).toBe("none");
    expect(welcomeAction(input({}, { welcome_enabled: false }))).toBe("none");
  });
});

describe("welcomeAction with welcome_always off (unchanged behavior)", () => {
  const off = { welcome_always: false };
  it("a question goes to the AI only", () => {
    expect(welcomeAction(input({}, off))).toBe("none");
    expect(shouldSendWelcome(input({}, off))).toBe(false);
  });
  it("media goes to the AI only", () => {
    expect(welcomeAction(input({ hasMedia: true }, off))).toBe("none");
  });
  it("a greeting still gets the welcome", () => {
    expect(shouldSendWelcome(input({ text: "hi" }, off))).toBe(true);
  });
  it("a missing column reads as off", () => {
    expect(welcomeAction(input({}, { welcome_always: undefined }))).toBe("none");
  });
});

describe("the welcome marker dated before the lead's message", () => {
  it("leaves the lead's question unanswered for the reply step", () => {
    // Newest first, as the webhook reads history: the marker sits just BEFORE the question.
    const rows = [
      { id: "q", role: "user" as const, content: "how long does it take?" },
      { id: "m", role: "assistant" as const, content: "(sent welcome voice)" },
    ];
    const { burst, prior } = splitBurst(rows);
    expect(burst.map((r) => r.id)).toEqual(["q"]);
    expect(prior.map((r) => r.id)).toEqual(["m"]);
  });
});
