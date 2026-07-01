import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "./types";

export const UPLOAD_BUCKET = "request-uploads";

/** PUBLIC bucket for follow-up media (ManyChat fetches these by public URL). */
export const FOLLOWUP_BUCKET = "followup-assets";

/** Image media types we allow into Claude (must match the upload validator). */
export const CLAUDE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

/** The public URL for an object in the public followup-assets bucket. */
export function publicAssetUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(FOLLOWUP_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Remove a follow-up asset object from the public bucket. Throws on failure —
 * supabase-js remove() reports errors in its return value rather than throwing,
 * so callers relying on try/catch need this check. Removing an already-missing
 * object is NOT an error (retries converge).
 * (Uploads to this bucket happen directly from the browser — see
 * followup-asset-manager.tsx — never through the server, because Vercel's
 * ~4.5 MB request-body cap is far below ManyChat's 25 MB media cap.)
 */
export async function removePublicAsset(supabase: SupabaseClient, path: string): Promise<void> {
  const { error } = await supabase.storage.from(FOLLOWUP_BUCKET).remove([path]);
  if (error) throw new Error(`storage remove failed: ${error.message}`);
}

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

/** Download a stored object as a raw Buffer (for extracting text from documents). */
export async function downloadAsBuffer(
  supabase: SupabaseClient,
  path: string
): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const { data, error } = await supabase.storage.from(UPLOAD_BUCKET).download(path);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return { buffer, mediaType: data.type || "application/octet-stream" };
}
