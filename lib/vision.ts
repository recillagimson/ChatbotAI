// lib/vision.ts
// Turn an inbound image into a short factual TEXT description, so its content
// persists the way a voice-note transcript does — into the message row, burst
// consolidation (lib/debounce.ts), conversation history, and the rolling memory
// summary (lib/memory.ts).
//
// WHY: without this, an image is only ephemeral vision on the CURRENT reply turn.
// When a lead fires several photos in a rapid burst, the one surviving run only
// "sees" its own image; the earlier images collapse to "(media message)" and are
// invisible when the bot composes its consolidated reply — so it re-asks for
// things the customer already showed (e.g. a credit score sitting in a screenshot).
// A persisted text description fixes both the burst case and later turns that must
// reason over an image sent earlier in the conversation.
//
// Multi-tenant + generic: the prompt extracts whatever is visible for ANY business
// (text, numbers, names, prices, dates, charts) — it never assumes a domain.
import { openaiChat } from "./openai";

/** Vision model for image description. Defaults to the DM model (multimodal). */
export const VISION_MODEL =
  process.env.OPENAI_VISION_MODEL || process.env.OPENAI_DM_MODEL || "gpt-4.1-mini";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DESCRIPTION_CHARS = 1_200;

/** Generic, domain-agnostic extraction prompt (multi-tenant safe). */
export const IMAGE_DESCRIBE_PROMPT =
  "You help a business's DM assistant understand an image a customer just sent. " +
  "In 1-4 plain sentences, describe exactly what it shows so the assistant can reply " +
  "without asking the customer to repeat anything. Transcribe any visible text, numbers, " +
  "names, prices, dates, scores, and figures EXACTLY as shown. If it is a screenshot (a report, " +
  "chart, profile, receipt, order, or document), capture the key data points and their labels. " +
  "State only what is visible — do not guess, interpret, advise, or add anything not in the image.";

/** PURE: tidy a raw model description — strip CRs, collapse blank runs, hard cap. */
export function cleanDescription(raw: string): string {
  const t = (raw ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > MAX_DESCRIPTION_CHARS
    ? t.slice(0, MAX_DESCRIPTION_CHARS).trim() + "…"
    : t;
}

/**
 * PURE: the message-text label an image contributes, mirroring the voice-note
 * label ("[Voice message]: ..."). Empty string when there is nothing to add.
 */
export function imageTextPart(description: string): string {
  const d = (description ?? "").trim();
  return d ? `[Image]: ${d}` : "";
}

/**
 * Describe one image via the vision model. Returns a cleaned description, or ""
 * on ANY failure (no key, timeout, non-2xx, empty output) — the caller degrades
 * gracefully (the current reply turn still carries the raw image as vision).
 * Never throws.
 */
export async function describeImage(opts: { base64: string; mediaType: string }): Promise<string> {
  if (!opts.base64) return "";
  try {
    const { text } = await openaiChat({
      model: VISION_MODEL,
      system: IMAGE_DESCRIBE_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${opts.mediaType};base64,${opts.base64}` } },
            { type: "text", text: "Describe this image." },
          ],
        },
      ],
      maxTokens: 350,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return cleanDescription(text);
  } catch {
    return "";
  }
}
