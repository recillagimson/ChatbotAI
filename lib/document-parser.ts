// lib/document-parser.ts
// Shared server-side text extraction for uploaded documents. Lifted from the
// knowledge-base upload route so the change-request chat can read the same file
// types. PDF via unpdf, DOCX via mammoth, plain text/markdown/csv via UTF-8.
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

/** File extensions we can extract text from (PDF, Word, plain text family). */
export const ALLOWED_DOC_EXT = /\.(pdf|docx|txt|md|csv)$/i;

/** Per-attachment text cap when folding a file into a chat turn (token budget).
 *  This is a CHAT-TURN budget - do NOT reuse it as a stored-section cap. */
export const MAX_DOC_CHARS = 20_000;

/**
 * Cap for a document uploaded to FILL A PROMPT SECTION (persona / offers / rebuttals).
 * Deliberately far larger than MAX_DOC_CHARS: pasting a section has no cap and real
 * personas already run ~100k chars, so the old 20k cut sections mid-word (dropping whole
 * rules). Still bounded - a section is injected into every reply, so a runaway file
 * shouldn't land whole - and env-overridable for tuning.
 */
export const MAX_SECTION_EXTRACT_CHARS =
  Number(process.env.MAX_SECTION_EXTRACT_CHARS) || 200_000;

/**
 * Extract plain text from a supported document buffer. `name` drives the parser
 * by extension. Throws for unsupported types; callers decide how to surface it.
 */
export async function extractTextFromFile(input: {
  buffer: Buffer;
  name: string;
}): Promise<string> {
  const name = input.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(input.buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: input.buffer });
    return value;
  }
  if (/\.(txt|md|csv)$/i.test(name)) {
    return input.buffer.toString("utf-8");
  }
  throw new Error("Unsupported type (use PDF, DOCX, TXT, MD, or CSV)");
}
