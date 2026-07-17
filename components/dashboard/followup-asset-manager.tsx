"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssetThumb } from "@/components/dashboard/asset-thumb";
import { nextAssetKeys } from "@/lib/followup-assets";
import type { FollowupAsset, FollowupAssetKind } from "@/lib/types";

// Mirrors lib/storage.ts FOLLOWUP_BUCKET (not imported: that module also carries
// server-side Buffer helpers we keep out of the client bundle).
const FOLLOWUP_BUCKET = "followup-assets";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // ManyChat's media cap
const MAX_IMAGES = 5; // bulk-image upload cap
const KEY_RE = /^[a-z0-9_-]{1,40}$/;
const BASE_KEY_RE = /^[a-z0-9_-]{1,38}$/; // leaves room for the "_N" suffix
const KEY_HINT = "Key: 1–40 chars, lowercase letters/numbers/_/- only (e.g. results_video).";

const KIND_LABEL: Record<FollowupAssetKind, string> = {
  image: "Picture",
  video: "Video",
  audio: "Voice note",
  link: "Link",
};

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

function fileKindError(kind: FollowupAssetKind, file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB.`;
  }
  if (kind === "audio") {
    return AUDIO_MIMES.has(file.type)
      ? null
      : `"${file.name}" must be MP3, M4A, or WAV (Instagram/Messenger can't play ${file.type || "this format"}).`;
  }
  if (kind === "image" || kind === "video") {
    return file.type.startsWith(`${kind}/`) ? null : `"${file.name}" is not a ${kind} file.`;
  }
  return null;
}

/**
 * Manage a chatbot's follow-up asset library: upload pictures/videos/voice notes
 * or add a link. Media uploads go DIRECTLY from the browser to the public
 * followup-assets bucket (bucket RLS scopes writes to the owner's {userId}/
 * folder) — routing bytes through an API route would hit Vercel's ~4.5 MB body
 * limit long before ManyChat's 25 MB cap. The API route only records metadata.
 *
 * Pictures can be added in bulk: select up to 5 images at once and each is saved
 * as its own asset, keyed {base}_1, {base}_2, … from the Key field (a "base key"
 * when several are selected). Video/voice/link stay one-at-a-time.
 *
 * NOTE on Instagram: voice notes/videos only deliver on Messenger/Telegram; on
 * Instagram a step falls back to its text caption (native IG voice notes are set
 * up separately in ManyChat — see docs/followup-media.md).
 */
export function FollowupAssetManager({
  chatbotId,
  userId,
  assets,
  usedKeys,
}: {
  chatbotId: string;
  userId: string;
  assets: FollowupAsset[];
  usedKeys: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState<FollowupAssetKind>("image");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0); // bump to visually clear the file input
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Object-URL previews parallel to `files`, rebuilt+revoked whenever the
  // selection changes (and on unmount). Mirrors the pattern in request-composer.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const isBulkImage = kind === "image" && files.length > 1;

  function reset() {
    setKey("");
    setLabel("");
    setDescription("");
    setUrl("");
    setFiles([]);
    setFileInputKey((n) => n + 1);
  }

  async function postMetadata(body: Record<string, unknown>): Promise<Response> {
    return fetch("/api/followup-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Upload one file to storage + record its metadata row. Cleans up the orphan
  // object if the metadata insert fails. Returns a per-file result (never throws).
  async function uploadOne(file: File, k: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClient();
    const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const path = `${userId}/followup/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from(FOLLOWUP_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) return { ok: false, error: `upload failed: ${upErr.message}` };
    const res = await postMetadata({ chatbot_id: chatbotId, key: k, label, description, kind, storage_path: path, mime: file.type });
    if (!res.ok) {
      await supabase.storage.from(FOLLOWUP_BUCKET).remove([path]).catch(() => {});
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: json.error ?? "could not save" };
    }
    return { ok: true };
  }

  async function addAsset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const k = key.trim().toLowerCase();

    // Link: a single metadata POST (no file).
    if (kind === "link") {
      if (!KEY_RE.test(k)) { setError(KEY_HINT); return; }
      setBusy(true);
      try {
        const res = await postMetadata({ chatbot_id: chatbotId, key: k, label, description, kind, url });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) { setError(json.error ?? "Could not save asset."); return; }
        reset();
        setNotice("Link added ✓");
        startTransition(() => router.refresh());
      } finally {
        setBusy(false);
      }
      return;
    }

    // Media (image/video/audio): need at least one file.
    if (files.length === 0) { setError("Choose a file to upload."); return; }
    // Validate every selected file up-front (all-or-nothing).
    for (const f of files) {
      const invalid = fileKindError(kind, f);
      if (invalid) { setError(invalid); return; }
    }

    // Bulk images: the Key field is a BASE — each image gets {base}_1, {base}_2, …
    if (isBulkImage) {
      const base = k || "image";
      if (!BASE_KEY_RE.test(base)) {
        setError("Base key: 1–38 chars, lowercase letters/numbers/_/- only (e.g. results).");
        return;
      }
      const keys = nextAssetKeys(base, files.length, assets.map((a) => a.key));
      setBusy(true);
      let ok = 0;
      const fails: string[] = [];
      try {
        for (let i = 0; i < files.length; i++) {
          setProgress(`Uploading ${i + 1} of ${files.length}…`);
          const r = await uploadOne(files[i], keys[i]);
          if (r.ok) ok += 1;
          else fails.push(`${files[i].name}: ${r.error}`);
        }
      } finally {
        setBusy(false);
        setProgress(null);
      }
      if (ok > 0) {
        reset();
        startTransition(() => router.refresh());
      }
      if (fails.length) setError(`Added ${ok} of ${files.length}. Failed — ${fails.join("; ")}`);
      else setNotice(`Added ${ok} image${ok === 1 ? "" : "s"} ✓`);
      return;
    }

    // Single media (one image, or a video/voice note): the exact typed key.
    if (!KEY_RE.test(k)) { setError(KEY_HINT); return; }
    setBusy(true);
    try {
      const r = await uploadOne(files[0], k);
      if (r.ok) {
        reset();
        setNotice("Asset added ✓");
        startTransition(() => router.refresh());
      } else {
        setError(r.error ?? "Could not save asset.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: FollowupAsset) {
    setError(null);
    setNotice(null);
    const inUse = usedKeys.includes(asset.key);
    const warning = inUse
      ? `"${asset.key}" is used by your follow-up sequence — that step will send TEXT ONLY until you pick another asset.\n\nDelete it anyway?`
      : `Delete "${asset.key}"? This can't be undone.`;
    if (!window.confirm(warning)) return;
    const res = await fetch(`/api/followup-assets?id=${asset.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not delete asset.");
      return;
    }
    startTransition(() => router.refresh());
  }

  // Preview of the keys a bulk-image batch will produce (pure; validated on submit).
  const keyPreview = isBulkImage
    ? nextAssetKeys(key.trim().toLowerCase() || "image", files.length, assets.map((a) => a.key))
    : [];

  return (
    <div className="space-y-6">
      {assets.length > 0 && (
        <ul className="divide-y rounded-md border">
          {assets.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3">
              <div className="flex min-w-0 items-center gap-3">
                <AssetThumb kind={a.kind} url={a.url} className="h-12 w-12" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{a.key}</code>
                    <span className="text-xs text-muted-foreground">{KIND_LABEL[a.kind]}</span>
                    {usedKeys.includes(a.key) && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        in sequence
                      </span>
                    )}
                  </div>
                  {(a.label || a.description) && (
                    <p className="truncate text-sm text-muted-foreground">
                      {a.label}
                      {a.label && a.description ? " — " : ""}
                      {a.description}
                    </p>
                  )}
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      {a.kind === "link" ? a.url : "open"}
                    </a>
                  )}
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(a)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addAsset} className="space-y-3 rounded-md border border-dashed p-4">
        <p className="text-sm font-medium">Add an asset</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="asset-kind">Type</Label>
            <select
              id="asset-kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as FollowupAssetKind);
                setFiles([]);
                setFileInputKey((n) => n + 1);
                setError(null);
                setNotice(null);
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="image">Picture</option>
              <option value="video">Video</option>
              <option value="audio">Voice note</option>
              <option value="link">Link</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="asset-key">{kind === "image" ? "Key / base key" : "Key"}</Label>
            <Input
              id="asset-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={kind === "image" ? "results" : "results_video"}
            />
            {kind === "image" && (
              <p className="text-xs text-muted-foreground">
                Adding several? This becomes a base — each image gets _1, _2, …
              </p>
            )}
          </div>
        </div>

        {kind === "link" ? (
          <div className="space-y-1">
            <Label htmlFor="asset-url">Link URL</Label>
            <Input
              id="asset-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://g.page/r/your-review-link"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="asset-file">
              {kind === "image" ? "Images" : "File"} (max 25 MB
              {kind === "audio" ? ", MP3/M4A/WAV" : ""}
              {kind === "image" ? `, up to ${MAX_IMAGES}` : ""})
            </Label>
            <Input
              key={fileInputKey}
              id="asset-file"
              type="file"
              multiple={kind === "image"}
              accept={kind === "image" ? "image/*" : kind === "video" ? "video/*" : ".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav"}
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setFiles(kind === "image" ? list.slice(0, MAX_IMAGES) : list.slice(0, 1));
              }}
            />
            {isBulkImage && (
              <p className="text-xs text-muted-foreground">
                {files.length} images selected → keys: {keyPreview.join(", ")}
              </p>
            )}
            {/* Pre-upload preview: image/video thumbnails, or a player for voice notes. */}
            {files.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {files.map((f, i) =>
                  kind === "audio" ? (
                    <audio key={i} controls src={previews[i]} className="h-9" />
                  ) : (
                    <AssetThumb key={i} kind={kind} url={previews[i]} className="h-16 w-16" />
                  )
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="asset-label">Label (optional)</Label>
          <Input
            id="asset-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="60-sec results walkthrough"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="asset-desc">When to send (helps the AI)</Label>
          <Textarea
            id="asset-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Send when the lead asks for proof or case studies."
          />
        </div>

        {error && (
          <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        {notice && !error && <p className="text-sm text-green-600">{notice}</p>}
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        <Button type="submit" disabled={busy}>
          {busy
            ? (progress ?? "Saving...")
            : isBulkImage
              ? `Add ${files.length} images`
              : "Add asset"}
        </Button>
      </form>
    </div>
  );
}
