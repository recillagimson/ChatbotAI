/**
 * E2E for conversation memory, against the REAL OpenAI API the bot uses.
 *
 * - Summarize: fold a chat containing known facts into a running summary and
 *   assert the summary captured them (the production summarizer).
 * - Remember: generate a reply with a memory summary in context and assert the
 *   bot uses it instead of re-asking (the production reply path).
 *
 * No dev server, no Supabase. Needs OPENAI_API_KEY (loaded from .env.local by
 * playwright.config.ts); skips if absent.
 *
 * Run: npx playwright test tests/memory.spec.ts
 */
import { test, expect } from "@playwright/test";
import { generateReply } from "../lib/anthropic";
import { summarizeConversation } from "../lib/memory";
import type { Chatbot } from "../lib/types";

const hasKey = !!process.env.OPENAI_API_KEY;

const testBot = {
  id: "00000000-0000-0000-0000-000000000000",
  user_id: "00000000-0000-0000-0000-000000000000",
  name: "Test Bot",
  business_description: "A helpful funding & credit assistant.",
  tone: "friendly",
  manychat_page_id: null,
  manychat_api_key_enc: null,
  webhook_secret: "x",
  instagram_username: null,
  system_prompt: null,
  persona_section:
    "You are a concise, helpful assistant. Use the conversation memory and answer the user's question directly.",
  offers_section: null,
  rebuttals_section: null,
  is_active: true,
  retrieval_active: false,
  auto_followup_enabled: false,
  auto_followup_days: 0,
  auto_followup_repeat: false,
  auto_followup_max: 0,
  auto_followup_template: null,
  created_at: new Date(0).toISOString(),
} as unknown as Chatbot;

test.describe("conversation memory (real OpenAI)", () => {
  test.skip(!hasKey, "OPENAI_API_KEY not set - skipping live AI tests");

  test("summarizes a long chat: captures the lead's name and goal", async () => {
    const msgs = [
      { role: "user", content: "hey, my name is Maria" },
      { role: "assistant", content: "Hi Maria! How can I help?" },
      { role: "user", content: "I'm trying to get business funding, around $50,000" },
      { role: "assistant", content: "Got it. Do you have any collections on your credit?" },
      { role: "user", content: "yeah, two collections and a late payment" },
      { role: "user", content: "my email is maria@example.com if you need it" },
    ];

    const summary = (await summarizeConversation(null, msgs)).toLowerCase();
    console.log("[memory] summary:", summary);
    expect(summary).toContain("maria");
    expect(summary).toContain("50"); // $50,000 funding goal
    expect(summary).toMatch(/fund|collection/); // captured the situation
  });

  test("uses memory to avoid re-asking: recalls the lead's name", async () => {
    const { text } = await generateReply({
      chatbot: testBot,
      kbBlock: "",
      history: [{ role: "user", content: "what's my name again?" }],
      userMessage: "what's my name again?",
      memorySummary:
        "The lead's name is Maria. She wants $50,000 in business funding. She has two collections and already gave her email.",
    });
    console.log("[memory] reply:", text);
    expect(text).toMatch(/maria/i);
  });

  // A funding/credit persona like the LGF bot, to test continuity behavior.
  const coachBot = {
    ...testBot,
    persona_section:
      "You are Evan, a hype funding & credit coach. You DM leads on Instagram. Your usual opener when someone new messages is 'yoo whats good, you saw the reel right? you tryna fix your credit or get funded?'. Keep it short and casual.",
  } as unknown as Chatbot;

  const OPENER = /whats good|saw (the|my) reel|what.?s your situation|fix your credit or get|you tryna fix/i;

  test("does not re-greet when the conversation is already going", async () => {
    const history: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "yoo whats good, you saw the reel right? you tryna fix your credit or get funded?" },
      { role: "user", content: "credit" },
      { role: "assistant", content: "bet, we can clean that up. what's your score looking like?" },
    ];
    const { text } = await generateReply({
      chatbot: coachBot,
      kbBlock: "",
      history,
      userMessage: "hi",
    });
    console.log("[continuity] re-greet reply:", text);
    expect(text).not.toMatch(OPENER);
  });

  test("does not re-ask the goal it already knows", async () => {
    const history: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "yoo whats good, you tryna fix your credit or get funded?" },
      { role: "user", content: "fix my credit" },
      { role: "assistant", content: "bet, lets get it. whats your score at right now?" },
    ];
    const { text } = await generateReply({
      chatbot: coachBot,
      kbBlock: "",
      history,
      userMessage: "63",
    });
    console.log("[continuity] re-ask reply:", text);
    expect(text).not.toMatch(/fix your credit or get funded|credit or.*funding/i);
  });

  test("acknowledges a link it already sent instead of restarting", async () => {
    const link = "https://www.skool.com/lgf/about?ref=abc";
    const history: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "how do i start" },
      { role: "assistant", content: `bet here you go ${link} once you sign up we get rolling` },
    ];
    const { text } = await generateReply({
      chatbot: coachBot,
      kbBlock: "",
      history,
      userMessage: "can i get the link",
    });
    console.log("[continuity] link-again reply:", text);
    // Should not restart the intro; should either resend the link or say it was already sent.
    expect(text).not.toMatch(OPENER);
    expect(text.toLowerCase()).toMatch(/skool\.com|already|sent|here it is|here you go|above/);
  });
});
