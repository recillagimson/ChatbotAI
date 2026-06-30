// lib/inbound-media.ts
// Inbound media for DM replies. A contact can send a photo, voice note, video,
// document, or sticker; ManyChat forwards the attachment URL(s) in the webhook
// body. This module normalizes those fields, classifies each attachment, and
// (in processInboundMedia) turns it into something the AI can use: images go to
// the vision model, audio/video are transcribed, documents are read as text.
//
// The pure helpers here (normalize/classify/host-allowlist/compose) are
// unit-tested in scripts/test-inbound-media.ts. The async processInboundMedia()
// at the bottom does the network + storage work and is verified end-to-end.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanContactField } from "./contact";
import { transcribeAudio } from "./transcribe";
import { extractTextFromFile, MAX_DOC_CHARS } from "./document-parser";
import { UPLOAD_BUCKET } from "./storage";

export type MediaKind = "image" | "audio" | "video" | "document" | "unknown";

/** One attachment to process. `declaredType` is a MIME or kind hint from the
 *  webhook (e.g. "image/jpeg", "image", "file") used only when the fetched
 *  response doesn't carry a usable Content-Type. */
export interface MediaItem {
  url: string;
  declaredType?: string;
}

/** Result of turning inbound attachments into AI-usable inputs. */
export interface ProcessedMedia {
  /** Images to attach to the current vision turn (base64 data, not data-URL). */
  images: { base64: string; mediaType: string }[];
  /** Text derived from media (transcripts, document text, fallback notes). */
  textParts: string[];
  /** Durable pointers for the inbox: storage path + MIME of what we re-hosted. */
  stored: { url: string; type: string }[];
  /** True if at least one attachment couldn't be read (drives a graceful note). */
  unsupported: boolean;
}

// --- pure helpers ----------------------------------------------------------

function asStr(v: unknown): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
}

/** Lowercased file extension from a URL path (query string stripped), or null. */
function extFromUrl(url: string): string | null {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split("?")[0];
  }
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : null;
}

/**
 * Classify an attachment. Prefers the Content-Type (or a kind hint like
 * "image"/"file"), then falls back to the URL's file extension.
 */
export function classifyMedia(contentType: string | null | undefined, url: string): MediaKind {
  const ct = (contentType ?? "").toLowerCase().trim();

  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("audio/")) return "audio";
  if (ct.startsWith("video/")) return "video";
  if (ct === "application/pdf") return "document";
  if (ct.includes("wordprocessingml") || ct.includes("msword")) return "document";
  if (ct.startsWith("text/")) return "document";

  // kind keyword hints from named webhook fields / attachment_type
  if (ct === "image") return "image";
  if (ct === "audio") return "audio";
  if (ct === "video") return "video";
  if (ct === "file" || ct === "document") return "document";

  const ext = extFromUrl(url);
  if (ext) {
    if (/^(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/.test(ext)) return "image";
    if (/^(mp3|m4a|aac|ogg|oga|wav|opus|amr|flac)$/.test(ext)) return "audio";
    if (/^(mp4|mov|webm|mpeg|mpg|m4v|3gp)$/.test(ext)) return "video";
    if (/^(pdf|docx|txt|md|csv)$/.test(ext)) return "document";
  }
  return "unknown";
}

/** CDN host suffixes we'll fetch media from. ".x" = host or any subdomain. */
const DEFAULT_ALLOWED_SUFFIXES = [
  "lookaside.fbsbx.com",
  ".fbcdn.net",
  ".cdninstagram.com",
  ".cdn.manychat.com",
  ".manychat.com",
];

function allowedSuffixes(): string[] {
  const extra = (process.env.MEDIA_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_SUFFIXES, ...extra];
}

/**
 * SSRF guard: only fetch media from the expected CDN hosts. Rejects bad URLs,
 * non-http(s) schemes, and anything off the allowlist (incl. internal IPs).
 */
export function isAllowedMediaHost(url: string): boolean {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowedSuffixes().some((suf) =>
    suf.startsWith(".") ? host === suf.slice(1) || host.endsWith(suf) : host === suf
  );
}

/**
 * Pull every media URL out of a webhook body, tolerating the different field
 * shapes a ManyChat flow might map. Drops empties and unresolved "{{...}}"
 * placeholders, splits the comma/space list field, and de-dupes by URL.
 */
export function normalizeMediaItems(body: Record<string, unknown>): MediaItem[] {
  const items: MediaItem[] = [];

  const add = (raw: unknown, opts?: { declaredType?: string; split?: boolean }) => {
    const v = cleanContactField(asStr(raw));
    if (!v) return;
    const pieces = opts?.split ? v.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : [v];
    for (const p of pieces) {
      if (/^https?:\/\//i.test(p)) items.push({ url: p, declaredType: opts?.declaredType });
    }
  };

  add(body.attachment_url, { declaredType: cleanContactField(asStr(body.attachment_type)) ?? undefined });
  add(body.attachment_urls, { split: true });
  add(body.image_url, { declaredType: "image" });
  add(body.audio_url, { declaredType: "audio" });
  add(body.video_url, { declaredType: "video" });
  add(body.file_url, { declaredType: "document" });

  const seen = new Set<string>();
  return items.filter((it) => (seen.has(it.url) ? false : (seen.add(it.url), true)));
}

/**
 * Build the effective user message the AI sees: the typed text plus any
 * media-derived text parts (transcripts already carry their own labels).
 * Never returns empty.
 */
export function composeUserMessage(opts: { text?: string | null; textParts?: string[] }): string {
  const text = (opts.text ?? "").trim();
  const parts = (opts.textParts ?? []).map((p) => p.trim()).filter(Boolean);
  const all = [text, ...parts].filter(Boolean);
  return all.join("\n\n") || "(media message)";
}

// --- async processing ------------------------------------------------------

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 25 * 1024 * 1024; // Whisper's hard limit; comfortable for images too.
// A non-browser UA — Meta/Supabase REST can 401 browser-like agents (see memory).
const FETCH_UA = "SpeedSettr-Media/1.0";
const UNSUPPORTED_NOTE =
  "[Note: the customer sent an attachment that couldn't be read. Politely acknowledge it and ask them to describe it or resend it.]";

/** Pick a filename (with a sensible extension) so Whisper/parsers detect the format. */
function filenameFor(kind: MediaKind, contentType: string, url: string): string {
  const ct = contentType.toLowerCase();
  const fromCt: Record<string, string> = {
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
    "audio/aac": "aac", "audio/ogg": "ogg", "audio/opus": "ogg", "audio/wav": "wav",
    "audio/x-wav": "wav", "audio/webm": "webm", "audio/amr": "amr",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/mpeg": "mpeg",
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt", "text/csv": "csv", "text/markdown": "md",
  };
  const ext = fromCt[ct] || extFromUrl(url) || (kind === "audio" ? "mp3" : kind === "video" ? "mp4" : "bin");
  return `media.${ext}`;
}

const MAX_REDIRECTS = 3;

async function fetchMedia(startUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let url = startUrl;
    // Follow redirects manually and re-validate the host on EVERY hop. Auto
    // redirect-following would let an allowlisted CDN URL 3xx to an internal
    // address (cloud metadata, RFC1918) and bypass isAllowedMediaHost — SSRF.
    // (DNS rebinding of a real CDN domain is out of scope; the allowlist is the
    // gate at each hop.)
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedMediaHost(url)) return null;
      const res = await fetch(url, {
        headers: { "User-Agent": FETCH_UA, Accept: "*/*" },
        signal: controller.signal,
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        try {
          url = new URL(loc, url).toString(); // resolve relative redirects
        } catch {
          return null;
        }
        continue;
      }
      if (!res.ok) return null;
      const declared = Number(res.headers.get("content-length") || "0");
      if (declared > MAX_BYTES) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;
      const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
      return { buffer, contentType };
    }
    return null; // too many redirects
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Re-host a fetched attachment to the request-uploads bucket; return its path. */
async function storeMedia(
  supabase: SupabaseClient,
  opts: { userId: string; buffer: Buffer; contentType: string; ext: string }
): Promise<{ url: string; type: string } | null> {
  const type = opts.contentType || "application/octet-stream";
  const path = `${opts.userId}/inbound/${crypto.randomUUID()}.${opts.ext}`;
  const { error } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(path, opts.buffer, { contentType: type, upsert: false });
  if (error) return null;
  return { url: path, type };
}

/**
 * Download, classify, and turn each inbound attachment into AI-usable inputs.
 * Never throws — any per-item failure degrades to `unsupported` with a note so
 * the bot still replies. Off-allowlist hosts are skipped (SSRF guard).
 */
export async function processInboundMedia(
  items: MediaItem[],
  ctx: { supabase: SupabaseClient; userId: string }
): Promise<ProcessedMedia> {
  const out: ProcessedMedia = { images: [], textParts: [], stored: [], unsupported: false };

  for (const item of items) {
    if (!isAllowedMediaHost(item.url)) {
      out.unsupported = true;
      continue;
    }

    const fetched = await fetchMedia(item.url);
    if (!fetched) {
      out.unsupported = true;
      out.textParts.push(UNSUPPORTED_NOTE);
      continue;
    }

    const kind = classifyMedia(fetched.contentType || item.declaredType, item.url);
    const filename = filenameFor(kind, fetched.contentType, item.url);
    const ext = filename.split(".").pop() || "bin";

    try {
      if (kind === "image") {
        const mediaType = fetched.contentType || "image/jpeg";
        out.images.push({ base64: fetched.buffer.toString("base64"), mediaType });
        const stored = await storeMedia(ctx.supabase, { userId: ctx.userId, buffer: fetched.buffer, contentType: mediaType, ext });
        if (stored) out.stored.push(stored);
      } else if (kind === "audio" || kind === "video") {
        const blob = new Blob([new Uint8Array(fetched.buffer)], { type: fetched.contentType || "application/octet-stream" });
        const transcript = (await transcribeAudio(blob, filename)).trim();
        const label = kind === "audio" ? "Voice message" : "Video";
        out.textParts.push(transcript ? `[${label}]: ${transcript}` : `[${label} with no audible speech]`);
        const stored = await storeMedia(ctx.supabase, { userId: ctx.userId, buffer: fetched.buffer, contentType: fetched.contentType, ext });
        if (stored) out.stored.push(stored);
      } else if (kind === "document") {
        const text = (await extractTextFromFile({ buffer: fetched.buffer, name: filename })).trim();
        out.textParts.push(text ? `[Attached document]: ${text.slice(0, MAX_DOC_CHARS)}` : UNSUPPORTED_NOTE);
        const stored = await storeMedia(ctx.supabase, { userId: ctx.userId, buffer: fetched.buffer, contentType: fetched.contentType, ext });
        if (stored) out.stored.push(stored);
      } else {
        out.unsupported = true;
        out.textParts.push(UNSUPPORTED_NOTE);
      }
    } catch {
      // Transcription / parsing failed — still acknowledge gracefully.
      out.unsupported = true;
      out.textParts.push(UNSUPPORTED_NOTE);
    }
  }

  return out;
}
