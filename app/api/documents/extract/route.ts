import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  ALLOWED_DOC_EXT,
  MAX_SECTION_EXTRACT_CHARS,
  extractTextFromFile,
} from "@/lib/document-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (mirror /api/uploads)

/**
 * POST /api/documents/extract
 * Stateless document → text. Accepts a single multipart `file`, extracts its
 * plain text (PDF/DOCX/TXT/MD/CSV), and returns `{ text }`. Nothing is stored -
 * the client drops the text into an editable section field. Used by the prompts
 * page (Personality upload) and available to the request-change flow.
 *
 * Auth: any logged-in user. No DB write, no storage, no ownership to check -
 * the file is read in-memory and discarded.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `"${file.name}" is larger than 10 MB.` }, { status: 400 });
  }
  if (!ALLOWED_DOC_EXT.test(file.name)) {
    return NextResponse.json(
      { error: `"${file.name}" must be a PDF, DOCX, TXT, MD, or CSV.` },
      { status: 400 }
    );
  }

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    text = (await extractTextFromFile({ buffer, name: file.name })).trim();
  } catch (err) {
    console.error("[documents/extract] failed", err);
    return NextResponse.json(
      { error: "Could not read this file (it may be scanned, encrypted, or empty)." },
      { status: 422 }
    );
  }
  if (!text) {
    return NextResponse.json({ error: "No readable text found in this file." }, { status: 422 });
  }

  // A prompt section can be large (pasting one is uncapped, personas run ~100k chars),
  // so cap only at a large, section-appropriate ceiling - NOT the 20k chat-turn budget
  // that used to cut uploads mid-word. Return `truncated` so the client can warn instead
  // of silently dropping text when a file genuinely exceeds the ceiling.
  const truncated = text.length > MAX_SECTION_EXTRACT_CHARS;
  return NextResponse.json({ text: text.slice(0, MAX_SECTION_EXTRACT_CHARS), truncated });
}
