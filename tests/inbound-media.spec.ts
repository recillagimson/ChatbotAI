/**
 * E2E for inbound-media understanding, against the REAL OpenAI APIs the bot uses.
 *
 * - Photo: Playwright renders an image with known text/numbers, then runs it
 *   through the production vision path (generateReply, OpenAI multimodal) and
 *   asserts the model actually read the image.
 * - Voice: synthesize a spoken clip (OpenAI TTS) with known words, then run it
 *   through the production transcriber (transcribeAudio / Whisper) and assert the
 *   transcript matches.
 *
 * No dev server, no Supabase, no ManyChat - this isolates "does the AI truly
 * understand the photo / voice note." Needs OPENAI_API_KEY (loaded from
 * .env.local by playwright.config.ts); skips if absent.
 *
 * Run: npx playwright test
 */
import { test, expect } from "@playwright/test";
import { generateReply } from "../lib/anthropic";
import { transcribeAudio } from "../lib/transcribe";
import type { Chatbot } from "../lib/types";

const hasKey = !!process.env.OPENAI_API_KEY;

// A minimal, neutral chatbot so generateReply just answers the question about
// the media (no persona getting in the way of the assertion).
const testBot = {
  id: "00000000-0000-0000-0000-000000000000",
  user_id: "00000000-0000-0000-0000-000000000000",
  name: "Test Bot",
  business_description: "A test assistant.",
  tone: "friendly",
  manychat_page_id: null,
  manychat_api_key_enc: null,
  webhook_secret: "x",
  instagram_username: null,
  system_prompt: null,
  persona_section: "You are a concise, helpful assistant. Answer the user's question directly.",
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

test.describe("inbound media understanding (real OpenAI)", () => {
  test.skip(!hasKey, "OPENAI_API_KEY not set - skipping live AI tests");

  test("analyzes a photo: reads the amount shown in the image", async ({ page }) => {
    // Render a realistic "screenshot a customer might send" with a known number.
    await page.setViewportSize({ width: 600, height: 360 });
    await page.setContent(`
      <html><body style="margin:0">
        <div id="card" style="width:600px;height:360px;font-family:Arial,sans-serif;
             background:#fff;color:#111;padding:40px;box-sizing:border-box">
          <h1 style="margin:0 0 24px">Credit Card Statement</h1>
          <p style="font-size:22px">Current balance</p>
          <p style="font-size:48px;font-weight:bold;color:#b00020">$4,275.00</p>
          <p style="font-size:20px">Status: Past due</p>
        </div>
      </body></html>
    `);
    const png = await page.locator("#card").screenshot({ type: "png" });
    const base64 = png.toString("base64");

    const { text } = await generateReply({
      chatbot: testBot,
      kbBlock: "",
      history: [],
      userMessage: "Look at this image the customer sent. What is the current balance amount shown? Reply with just the number.",
      images: [{ base64, mediaType: "image/png" }],
    });

    console.log("[photo] model reply:", text);
    // Robust to formatting ("$4,275", "4275.00", "4,275"): compare digits only.
    const digits = text.replace(/[^0-9]/g, "");
    expect(digits).toContain("4275");
  });

  test("understands a voice message: transcribes the spoken words", async () => {
    const spoken = "Hi, I really need help fixing my bad credit score. Can someone call me back?";

    // Synthesize a real voice note with OpenAI TTS.
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "tts-1", voice: "alloy", input: spoken, response_format: "mp3" }),
    });
    expect(ttsRes.ok, `TTS failed: ${ttsRes.status}`).toBeTruthy();
    const audio = Buffer.from(await ttsRes.arrayBuffer());
    expect(audio.length).toBeGreaterThan(1000);

    // Run it through the exact transcriber the webhook uses for voice notes.
    const blob = new Blob([new Uint8Array(audio)], { type: "audio/mpeg" });
    const transcript = (await transcribeAudio(blob, "voice.mp3")).toLowerCase();

    console.log("[voice] transcript:", transcript);
    expect(transcript).toContain("credit");
    expect(transcript.length).toBeGreaterThan(10);
  });
});
