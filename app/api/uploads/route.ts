import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { uploadAttachment, CLAUDE_IMAGE_TYPES } from "@/lib/storage";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;
// Images Claude can read + PDFs (PDFs are stored for the team, not sent to the model).
const ALLOWED_TYPES = new Set<string>([...CLAUDE_IMAGE_TYPES, "application/pdf"]);

/**
 * POST /api/uploads
 * Validate and store image/file attachments in the private `request-uploads`
 * bucket, scoped to the caller's own folder. Returns Attachment refs the client
 * then includes in a feedback POST or a change-request chat turn. Shared by the
 * feedback page and the request chat.
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

  const scopeRaw = form.get("scope");
  const scope = scopeRaw === "feedback" || scopeRaw === "request" ? scopeRaw : null;
  if (!scope) return NextResponse.json({ error: "Invalid scope." }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "No files provided." }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Up to ${MAX_FILES} files at a time.` }, { status: 400 });
  }

  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `"${f.name}" is larger than 10 MB.` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(f.type)) {
      return NextResponse.json(
        { error: `"${f.name}" must be an image (PNG/JPG/WebP/GIF) or PDF.` },
        { status: 400 }
      );
    }
  }

  const supabase = await createClient();
  const attachments: Attachment[] = [];
  try {
    for (const file of files) {
      attachments.push(await uploadAttachment(supabase, { userId: user.id, scope, file }));
    }
  } catch (err) {
    console.error("[uploads] failed", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attachments });
}
