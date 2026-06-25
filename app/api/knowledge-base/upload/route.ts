import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { indexEntry } from "@/lib/retrieval";
import { MAX_KB_CHARS_PER_CHATBOT } from "@/lib/kb-config";
import { extractTextFromFile, ALLOWED_DOC_EXT } from "@/lib/document-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 100_000; // protects the prompt token budget
const ALLOWED = ALLOWED_DOC_EXT;

/** Extract plain text from a supported upload, server-side. */
async function parseFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return extractTextFromFile({ buffer, name: file.name });
}

interface FileResult {
  name: string;
  ok: boolean;
  chars?: number;
  truncated?: boolean;
  needsReview?: boolean;
  indexed?: boolean;
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

  // Per-chatbot KB-size cap (mirrors the paste-text create route): bounds
  // embedding volume/cost. Tracked as a running total across this upload.
  const { data: sizeRows } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("chatbot_id", chatbotId);
  let kbChars = (sizeRows ?? []).reduce(
    (n, r) => n + (r.content?.length ?? 0),
    0
  );

  const results: FileResult[] = [];
  for (const file of files) {
    try {
      if (!ALLOWED.test(file.name)) {
        throw new Error("Unsupported type (use PDF, DOCX, TXT, MD, or CSV)");
      }
      if (file.size > MAX_FILE_BYTES) {
        throw new Error("File exceeds the 10 MB limit");
      }
      const rawText = (await parseFile(file)).trim();
      if (!rawText) {
        throw new Error("No readable text found in the file");
      }
      // Yield on the FULL extracted length (before truncation): a near-zero
      // ratio means an image/scanned PDF; a truncated large file is high-yield.
      const yieldPerKb = rawText.length / Math.max(1, file.size / 1024);
      const needsReview = yieldPerKb < 100;

      let text = rawText;
      let truncated = false;
      if (text.length > MAX_TEXT_CHARS) {
        text = text.slice(0, MAX_TEXT_CHARS);
        truncated = true;
      }

      if (kbChars + text.length > MAX_KB_CHARS_PER_CHATBOT) {
        throw new Error("Knowledge base size limit reached for this chatbot");
      }

      const { data: inserted, error } = await supabase
        .from("knowledge_base")
        .insert({
          chatbot_id: chatbotId,
          user_id: user.id,
          title: file.name,
          content: text,
          source_type: "upload",
          source_name: file.name,
          needs_review: needsReview,
        })
        .select("id, chatbot_id, user_id, content")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "insert failed");

      kbChars += text.length;
      const idx = await indexEntry(createServiceClient(), inserted);

      results.push({
        name: file.name,
        ok: true,
        chars: text.length,
        truncated,
        needsReview,
        indexed: idx.indexed,
      });
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
