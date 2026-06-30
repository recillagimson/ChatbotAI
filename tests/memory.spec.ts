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
  test.skip(!hasKey, "OPENAI_API_KEY not set — skipping live AI tests");

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
});
