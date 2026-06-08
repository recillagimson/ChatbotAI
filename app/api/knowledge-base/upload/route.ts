import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 100_000; // protects the prompt token budget
const ALLOWED = /\.(pdf|docx|txt|md|csv)$/i;

/** Extract plain text from a supported upload, server-side. */
async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  // .txt / .md / .csv → read as UTF-8
  return buf.toString("utf-8");
}

interface FileResult {
  name: string;
  ok: boolean;
  chars?: number;
  truncated?: boolean;
  error?: string;
}

/**
 * Upload one or more files for a chatbot's knowledge base. Files are parsed to
 * text server-side and stored as `knowledge_base` rows (source_type='upload').
 * The reply pipeline already reads all KB entries, so uploads need no further
 * wiring. Runs as the authenticated user under RLS ("own kb").
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const chatbotId = form.get("chatbot_id");
  if (typeof chatbotId !== "string" || !chatbotId) {
    return NextResponse.json({ error: "chatbot_id required" }, { status: 400 });
  }

  // Confirm the chatbot belongs to this user (RLS also enforces this on insert).
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("id")
    .eq("id", chatbotId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!chatbot) {
    return NextResponse.json({ error: "chatbot not found" }, { status: 404 });
  }

  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files uploaded" }, { status: 400 });
  }

  const results: FileResult[] = [];
  for (const file of files) {
    try {
      if (!ALLOWED.test(file.name)) {
        throw new Error("Unsupported type (use PDF, DOCX, TXT, MD, or CSV)");
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new Error("File exceeds the 10 MB limit");
      }
      let text = (await parseFile(file)).trim();
      if (!text) {
        throw new Error("No readable text found in the file");
      }
      let truncated = false;
      if (text.length > MAX_TEXT_CHARS) {
        text = text.slice(0, MAX_TEXT_CHARS);
        truncated = true;
      }

      const { error } = await supabase.from("knowledge_base").insert({
        chatbot_id: chatbotId,
        user_id: user.id,
        title: file.name,
        content: text,
        source_type: "upload",
        source_name: file.name,
      });
      if (error) throw new Error(error.message);

      results.push({ name: file.name, ok: true, chars: text.length, truncated });
    } catch (err) {
      results.push({
        name: file.name,
        ok: false,
        error: err instanceof Error ? err.message : "Failed to process file",
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json(
    { ok: okCount > 0, saved: okCount, results },
    { status: okCount > 0 ? 200 : 400 }
  );
}
