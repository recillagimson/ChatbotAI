// lib/document-parser.ts
// Shared server-side text extraction for uploaded documents. Lifted from the
// knowledge-base upload route so the change-request chat can read the same file
// types. PDF via unpdf, DOCX via mammoth, plain text/markdown/csv via UTF-8.
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

/** File extensions we can extract text from (PDF, Word, plain text family). */
export const ALLOWED_DOC_EXT = /\.(pdf|docx|txt|md|csv)$/i;

/** Per-attachment text cap when folding a file into a chat turn (token budget). */
export const MAX_DOC_CHARS = 20_000;

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
