import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { publicAssetUrl, removePublicAsset } from "@/lib/storage";
import type { FollowupAsset, FollowupAssetKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Metadata-only route. Media BYTES are uploaded directly from the browser to the
// public followup-assets bucket (owner-folder RLS) - routing them through here
// would hit Vercel's ~4.5 MB request-body limit long before ManyChat's 25 MB cap.
const MEDIA_KINDS = new Set<FollowupAssetKind>(["image", "video", "audio"]);
// Audio must be a format Messenger/Telegram can actually play (no ogg/webm).
const AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
]);
// Asset key: short lowercase handle used by steps + [[SEND_ASSET: key]] directives.
const KEY_RE = /^[a-z0-9_-]{1,40}$/;

const ASSET_COLUMNS =
  "id, chatbot_id, user_id, key, label, description, kind, storage_path, url, mime, created_at";

function normalizeKey(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function isHttpsUrl(raw: unknown): raw is string {
  try {
    return new URL(String(raw)).protocol === "https:";
  } catch {
    return false;
  }
}

function mimeAllowed(kind: FollowupAssetKind, mime: string): boolean {
  if (kind === "audio") return AUDIO_MIMES.has(mime);
  return mime.startsWith(`${kind}/`);
}

/** GET /api/followup-assets?chatbot_id=… - list a chatbot's assets (RLS-scoped). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const chatbotId = request.nextUrl.searchParams.get("chatbot_id");
  if (!chatbotId) return NextResponse.json({ error: "Missing chatbot_id." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("followup_assets")
    .select(ASSET_COLUMNS)
    .eq("chatbot_id", chatbotId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[followup-assets] list failed", error);
    return NextResponse.json({ error: "Could not load assets." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, assets: (data ?? []) as FollowupAsset[] });
}

/**
 * POST /api/followup-assets - record an asset's metadata (JSON only).
 *  - kind image/video/audio: `storage_path` of an object the client already
 *    uploaded to the followup-assets bucket (must live under the caller's own
 *    {user.id}/ folder), plus its `mime`.
 *  - kind link: an external https `url`.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const chatbotId = String(body.chatbot_id ?? "");
  const key = normalizeKey(body.key);
  const kind = String(body.kind ?? "") as FollowupAssetKind;
  const label = (String(body.label ?? "").trim() || null) as string | null;
  const description = (String(body.description ?? "").trim() || null) as string | null;

  if (!chatbotId) return NextResponse.json({ error: "Missing chatbot_id." }, { status: 400 });
  if (!KEY_RE.test(key)) {
    return NextResponse.json(
      { error: "Key must be 1–40 chars: lowercase letters, numbers, _ or -." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Ownership is enforced by RLS on insert (with check user_id = auth.uid()) and
  // the chatbot FK; we also pre-check for a friendly error.
  const { data: owned } = await supabase
    .from("chatbots")
    .select("id")
    .eq("id", chatbotId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });

  let storage_path: string | null = null;
  let assetUrl: string;
  let mime: string | null = null;

  if (kind === "link") {
    if (!isHttpsUrl(body.url)) {
      return NextResponse.json({ error: "Link must be a valid https:// URL." }, { status: 400 });
    }
    assetUrl = String(body.url);
  } else if (MEDIA_KINDS.has(kind)) {
    storage_path = String(body.storage_path ?? "");
    mime = String(body.mime ?? "");
    // The object must live under the caller's OWN folder - same guard as the
    // request-uploads paths elsewhere. (Bucket RLS already enforces this on
    // write; this stops metadata rows pointing at someone else's objects.)
    if (!storage_path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid storage path." }, { status: 400 });
    }
    if (!mimeAllowed(kind, mime)) {
      const allowed = kind === "audio" ? "MP3, M4A, or WAV" : `a ${kind} file`;
      return NextResponse.json({ error: `File must be ${allowed}.` }, { status: 400 });
    }
    assetUrl = publicAssetUrl(supabase, storage_path);
    // Confirm the object actually exists (the client uploads first) so we never
    // save a row whose public URL 404s when ManyChat fetches it.
    try {
      const head = await fetch(assetUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(8_000),
      });
      if (!head.ok) {
        return NextResponse.json(
          { error: "Uploaded file not found - try the upload again." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Could not verify the uploaded file - try again." },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json({ error: "kind must be image, video, audio, or link." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("followup_assets")
    .insert({
      chatbot_id: chatbotId,
      user_id: user.id,
      key,
      label,
      description,
      kind,
      storage_path,
      url: assetUrl,
      mime,
    })
    .select(ASSET_COLUMNS)
    .single();

  if (error) {
    // The client owns the just-uploaded object and cleans it up on failure.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `An asset with key "${key}" already exists.` },
        { status: 409 }
      );
    }
    console.error("[followup-assets] insert failed", error);
    return NextResponse.json({ error: "Could not save asset." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, asset: data as FollowupAsset });
}

/**
 * DELETE /api/followup-assets?id=… - remove an asset. The storage object goes
 * FIRST: if that fails we keep the row and report the error (retry converges -
 * removing an already-gone object succeeds), so no orphaned public files.
 */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const supabase = await createClient();
  // RLS restricts this select to the caller's own assets.
  const { data: asset } = await supabase
    .from("followup_assets")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  if (asset.storage_path) {
    try {
      await removePublicAsset(supabase, asset.storage_path);
    } catch (err) {
      console.error("[followup-assets] storage remove failed", asset.storage_path, err);
      return NextResponse.json(
        { error: "Could not delete the file - try again." },
        { status: 500 }
      );
    }
  }

  const { error } = await supabase.from("followup_assets").delete().eq("id", id);
  if (error) {
    console.error("[followup-assets] delete failed", error);
    return NextResponse.json({ error: "Could not delete asset." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
