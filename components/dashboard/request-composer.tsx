"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Mic, Square, ArrowUp, X, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILES = 4;
// Knowledge docs the assistant can read (mirrors lib/document-parser ALLOWED_DOC_EXT).
const DOC_EXT = /\.(pdf|docx|txt|md|csv)$/i;
const isImageFile = (f: File) => f.type.startsWith("image/");
const isAllowedFile = (f: File) => isImageFile(f) || DOC_EXT.test(f.name);

type ComposerPhase = "idle" | "uploading" | "recording" | "transcribing";

export function RequestComposer({
  onSend,
  disabled = false,
  sending = false,
  placeholder,
}: {
  onSend: (
    message: string,
    attachments: {
      images: { path: string; name: string }[];
      files: { path: string; name: string; type: string }[];
    },
    localPreviews: { images: { name: string; url: string }[]; fileNames: string[] }
  ) => Promise<void> | void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // Parallel to `files`: an object-URL for images, null for documents (chip only).
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [phase, setPhase] = useState<ComposerPhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Feature-detect mic support only on the client (never crash SSR).
  useEffect(() => {
    setMicSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined"
    );
  }, []);

  // Revoke object URLs when previews change / on unmount (docs have null URLs).
  useEffect(() => {
    return () => {
      previews.forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [previews]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // Clean up any active recording timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const recording = phase === "recording";
  const transcribing = phase === "transcribing";
  const uploading = phase === "uploading";
  const busy = disabled || sending || phase !== "idle";
  const canSend = !busy && text.trim().length > 0;

  // Build a previews array parallel to a file list: object-URL for images, null for docs.
  function buildPreviews(list: File[]): (string | null)[] {
    return list.map((f) => (isImageFile(f) ? URL.createObjectURL(f) : null));
  }

  function addFiles(selected: FileList | null) {
    setError(null);
    if (!selected || selected.length === 0) return;
    const all = Array.from(selected);
    const incoming = all.filter(isAllowedFile);
    if (incoming.length === 0) {
      setError("Attach an image or a document (PDF, DOCX, TXT, MD, or CSV).");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (incoming.length < all.length) {
      setError("Some files were skipped - only images and PDF/DOCX/TXT/MD/CSV are supported.");
    }
    setFiles((prev) => {
      const combined = [...prev, ...incoming];
      const kept = combined.length > MAX_FILES ? combined.slice(0, MAX_FILES) : combined;
      if (combined.length > MAX_FILES) setError(`You can attach up to ${MAX_FILES} files.`);
      setPreviews(buildPreviews(kept));
      return kept;
    });
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeFile(index: number) {
    setError(null);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function startRecording() {
    setError(null);
    if (!micSupported) return;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void finishRecording(recorder, stream);
      };
      recorderRef.current = recorder;
      recorder.start();
      setPhase("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      // Permission denied / unavailable - stop any tracks, surface a message.
      stream?.getTracks().forEach((t) => t.stop());
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser to use voice."
          : "Could not start recording on this device."
      );
      setPhase("idle");
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // triggers onstop → finishRecording
    }
  }

  async function finishRecording(recorder: MediaRecorder, stream: MediaStream | null) {
    setPhase("transcribing");
    try {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      if (blob.size === 0) {
        setPhase("idle");
        return;
      }
      const fd = new FormData();
      fd.append("audio", blob, "audio.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Could not transcribe the audio.");
        setPhase("idle");
        return;
      }
      const transcribed: string = data?.text ?? "";
      if (transcribed.trim()) {
        setText((prev) => (prev.trim() ? `${prev.trim()} ${transcribed.trim()}` : transcribed.trim()));
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transcribe the audio.");
      setPhase("idle");
    } finally {
      // Always release the microphone.
      stream?.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
    }
  }

  async function handleSend() {
    if (!canSend) return;
    const message = text.trim();
    setError(null);

    let imagePaths: { path: string; name: string }[] = [];
    let filePaths: { path: string; name: string; type: string }[] = [];

    // Optimistic previews: image thumbnails + plain doc names for the user bubble.
    const localImages = files
      .map((f, i) => ({ f, url: previews[i] }))
      .filter(({ f }) => isImageFile(f))
      .map(({ f, url }) => ({ name: f.name, url: url ?? URL.createObjectURL(f) }));
    const localFileNames = files.filter((f) => !isImageFile(f)).map((f) => f.name);

    try {
      if (files.length > 0) {
        setPhase("uploading");
        const fd = new FormData();
        fd.append("scope", "request");
        files.forEach((f) => fd.append("files", f));
        const upRes = await fetch("/api/uploads", { method: "POST", body: fd });
        const upData = await upRes.json().catch(() => null);
        if (!upRes.ok) {
          setError((upData && upData.error) || "Upload failed. Please try again.");
          setPhase("idle");
          return;
        }
        // Server preserves upload order, so classify by the local File at each index.
        const attachments: { path: string; name: string; type: string }[] = upData?.attachments ?? [];
        attachments.forEach((a, i) => {
          const src = files[i];
          if (src && isImageFile(src)) imagePaths.push({ path: a.path, name: a.name });
          else filePaths.push({ path: a.path, name: a.name, type: src?.type || a.type || "" });
        });
      }
      setPhase("idle");

      // Clear the composer; previews are now owned by the thread (don't revoke here).
      setText("");
      setFiles([]);
      setPreviews([]);
      if (fileInput.current) fileInput.current.value = "";

      await onSend(message, { images: imagePaths, files: filePaths }, { images: localImages, fileNames: localFileNames });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
      setPhase("idle");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const statusText = recording
    ? `Recording… ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} (tap to stop)`
    : transcribing
      ? "Transcribing…"
      : uploading
        ? "Uploading…"
        : null;

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Recording / transcribing status (assistive + visible) */}
      <p aria-live="polite" className={cn("text-xs text-muted-foreground", !statusText && "sr-only")}>
        {statusText ?? ""}
      </p>

      <div
        className={cn(
          "rounded-2xl border bg-background p-2 shadow-sm transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30",
          disabled && "opacity-60"
        )}
      >
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-1 pb-2 pt-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="relative">
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[i] as string}
                    alt={`Attached image: ${f.name}`}
                    className="h-16 w-16 rounded-lg border object-cover"
                  />
                ) : (
                  <span
                    className="flex h-16 max-w-[10rem] items-center gap-2 rounded-lg border bg-muted px-3 text-xs text-muted-foreground"
                    title={f.name}
                  >
                    <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{f.name}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={busy}
                  aria-label={`Remove ${f.name}`}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-1.5">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,.pdf,.docx,.txt,.md,.csv"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy || files.length >= MAX_FILES}
            aria-label="Attach image or document"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled || sending}
            rows={1}
            placeholder={placeholder ?? "Describe the change you'd like…"}
            aria-label="Message"
            className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-1 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed"
          />

          {micSupported && (
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={disabled || sending || transcribing || uploading}
              aria-label={recording ? "Stop recording" : "Record voice"}
              aria-pressed={recording}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 motion-safe:transition-transform",
                recording
                  ? "bg-destructive text-destructive-foreground motion-safe:animate-pulse"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {transcribing ? (
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : recording ? (
                <Square className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Mic className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          )}

          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            className="h-11 w-11 shrink-0 rounded-full"
          >
            {sending || uploading ? (
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <ArrowUp className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
