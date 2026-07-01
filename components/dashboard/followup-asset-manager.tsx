"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FollowupAsset, FollowupAssetKind } from "@/lib/types";

// Mirrors lib/storage.ts FOLLOWUP_BUCKET (not imported: that module also carries
// server-side Buffer helpers we keep out of the client bundle).
const FOLLOWUP_BUCKET = "followup-assets";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // ManyChat's media cap

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
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setKey("");
    setLabel("");
    setDescription("");
    setUrl("");
    setFile(null);
  }

  async function postMetadata(body: Record<string, unknown>): Promise<Response> {
    return fetch("/api/followup-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function addAsset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const k = key.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(k)) {
      setError("Key: 1–40 chars, lowercase letters/numbers/_/- only (e.g. results_video).");
      return;
    }
    setBusy(true);
    try {
      const base = { chatbot_id: chatbotId, key: k, label, description };
      let res: Response;
      if (kind === "link") {
        res = await postMetadata({ ...base, kind, url });
      } else {
        if (!file) {
          setError("Choose a file to upload.");
          return;
        }
        const invalid = fileKindError(kind, file);
        if (invalid) {
          setError(invalid);
          return;
        }
        // 1. Upload straight to storage under the owner's folder (RLS-enforced).
        const supabase = createClient();
        const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
        const path = `${userId}/followup/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(FOLLOWUP_BUCKET)
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) {
          setError(`Upload failed: ${upErr.message}`);
          return;
        }
        // 2. Record the metadata row; if that fails, clean up the orphan object.
        res = await postMetadata({ ...base, kind, storage_path: path, mime: file.type });
        if (!res.ok) {
          await supabase.storage.from(FOLLOWUP_BUCKET).remove([path]).catch(() => {});
        }
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save asset.");
        return;
      }
      reset();
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: FollowupAsset) {
    setError(null);
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

  return (
    <div className="space-y-6">
      {assets.length > 0 && (
        <ul className="divide-y rounded-md border">
          {assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 p-3">
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
                    {a.kind === "link" ? a.url : "preview"}
                  </a>
                )}
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="asset-kind">Type</Label>
            <select
              id="asset-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as FollowupAssetKind)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="image">Picture</option>
              <option value="video">Video</option>
              <option value="audio">Voice note</option>
              <option value="link">Link</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="asset-key">Key</Label>
            <Input
              id="asset-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="results_video"
            />
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
            <Label htmlFor="asset-file">File (max 25 MB{kind === "audio" ? ", MP3/M4A/WAV" : ""})</Label>
            <Input
              id="asset-file"
              type="file"
              accept={kind === "image" ? "image/*" : kind === "video" ? "video/*" : ".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
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
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Add asset"}
        </Button>
      </form>
    </div>
  );
}
