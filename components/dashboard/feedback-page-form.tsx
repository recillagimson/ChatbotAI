"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";

const MAX_FILES = 5;
const GENERAL = "__general__";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FeedbackPageForm({
  chatbots,
}: {
  chatbots: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [chatbotId, setChatbotId] = useState<string>(GENERAL);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<"idle" | "uploading" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const busy = phase !== "idle";

  function addFiles(selected: FileList | null) {
    setError(null);
    setSuccess(false);
    if (!selected || selected.length === 0) return;
    const incoming = Array.from(selected);
    setFiles((prev) => {
      const combined = [...prev, ...incoming];
      if (combined.length > MAX_FILES) {
        setError(`You can attach up to ${MAX_FILES} files. Extra files were not added.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
    // Allow re-selecting the same file later.
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeFile(index: number) {
    setError(null);
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccess(false);

    if (!message.trim()) {
      setError("Please write your feedback.");
      return;
    }

    try {
      let attachments: { path: string; name: string; type: string; size: number }[] = [];

      if (files.length > 0) {
        setPhase("uploading");
        const fd = new FormData();
        fd.append("scope", "feedback");
        files.forEach((f) => fd.append("files", f));
        const upRes = await fetch("/api/uploads", { method: "POST", body: fd });
        const upData = await upRes.json().catch(() => null);
        if (!upRes.ok) {
          setError((upData && upData.error) || "Upload failed. Please try again.");
          setPhase("idle");
          return;
        }
        attachments = upData?.attachments ?? [];
      }

      setPhase("sending");
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          chatbot_id: chatbotId === GENERAL ? undefined : chatbotId,
          attachments,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Could not send your feedback.");
        setPhase("idle");
        return;
      }

      setMessage("");
      setFiles([]);
      setChatbotId(GENERAL);
      if (fileInput.current) fileInput.current.value = "";
      setSuccess(true);
      setPhase("idle");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your feedback.");
      setPhase("idle");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-lg border bg-card p-5"
    >
      {chatbots.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="feedback-chatbot">Which chatbot? (optional)</Label>
          <select
            id="feedback-chatbot"
            value={chatbotId}
            onChange={(e) => setChatbotId(e.target.value)}
            disabled={busy}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value={GENERAL}>General / not bot-specific</option>
            {chatbots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="feedback-message">Your feedback</Label>
        <Textarea
          id="feedback-message"
          required
          rows={5}
          placeholder="Tell us what's working or what's not…"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setSuccess(false);
          }}
          disabled={busy}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-files">Attachments (optional)</Label>
        <input
          id="feedback-files"
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={(e) => addFiles(e.target.files)}
          disabled={busy || files.length >= MAX_FILES}
          className="block w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Images (PNG, JPG, WebP, GIF) or PDF · up to {MAX_FILES} files, 10 MB each.
        </p>
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs"
              >
                <span className="max-w-[14rem] truncate font-medium">{f.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatBytes(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={busy}
                  aria-label={`Remove ${f.name}`}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">
          Sent — thanks! The team will take a look.
        </p>
      )}

      <Button type="submit" size="lg" disabled={busy}>
        {phase === "uploading"
          ? "Uploading…"
          : phase === "sending"
            ? "Sending…"
            : "Send feedback"}
      </Button>
    </form>
  );
}
