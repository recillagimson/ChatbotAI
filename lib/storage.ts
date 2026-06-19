import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "./types";

export const UPLOAD_BUCKET = "request-uploads";

/** Image media types we allow into Claude (must match the upload validator). */
export const CLAUDE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

/** Store one File under {userId}/{scope}/{uuid}-{safeName}. RLS enforces the folder. */
export async function uploadAttachment(
  supabase: SupabaseClient,
  opts: { userId: string; scope: "feedback" | "request"; file: File }
): Promise<Attachment> {
  const safeName = (opts.file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const path = `${opts.userId}/${opts.scope}/${crypto.randomUUID()}-${safeName}`;
  const buf = Buffer.from(await opts.file.arrayBuffer());
  const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, buf, {
    contentType: opts.file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return {
    path,
    name: opts.file.name || safeName,
    type: opts.file.type || "application/octet-stream",
    size: opts.file.size,
  };
}

/** Short-lived signed URL for viewing a private object (admin review / owner history). */
export async function signAttachment(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data } = await supabase.storage.from(UPLOAD_BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/** Download a stored object as base64 (for embedding images into a Claude message). */
export async function downloadAsBase64(
  supabase: SupabaseClient,
  path: string
): Promise<{ base64: string; mediaType: string } | null> {
  const { data, error } = await supabase.storage.from(UPLOAD_BUCKET).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return { base64: buf.toString("base64"), mediaType: data.type || "application/octet-stream" };
}
