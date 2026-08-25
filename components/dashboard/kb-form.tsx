"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SsButton } from "@/components/ss/controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function KnowledgeBaseForm({
  chatbotId,
}: {
  // The selected chatbot is owned by the parent (KnowledgeBaseManager) so the
  // file list and this form stay in sync. The chatbot selector lives there, not here.
  chatbotId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Paste-text entry
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File upload
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatbot_id: chatbotId, title, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not save entry.");
        setLoading(false);
        return;
      }
      setTitle("");
      setContent("");
      setLoading(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save entry.");
      setLoading(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadErr(null);
    setUploadMsg(null);
    const files = fileInput.current?.files;
    if (!chatbotId) {
      setUploadErr("Pick a chatbot first.");
      return;
    }
    if (!files || files.length === 0) {
      setUploadErr("Choose at least one file.");
      return;
    }

    const fd = new FormData();
    fd.append("chatbot_id", chatbotId);
    Array.from(files).forEach((f) => fd.append("files", f));

    setUploading(true);
    try {
      const res = await fetch("/api/knowledge-base/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadErr(data?.error ?? "Upload failed.");
      } else {
        const results: { name: string; ok: boolean; error?: string }[] =
          data.results ?? [];
        const failed = results.filter((r) => !r.ok);
        setUploadMsg(
          `Added ${data.saved} file${data.saved === 1 ? "" : "s"} to the knowledge base.` +
            (failed.length
              ? ` ${failed.length} failed: ${failed
                  .map((f) => `${f.name} (${f.error})`)
                  .join(", ")}`
              : "")
        );
        if (fileInput.current) fileInput.current.value = "";
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ss-muted">
        Add knowledge in <b className="font-semibold text-ss-body">one</b> of two ways - you only need to do one.
      </p>

      {/* Option 1 - Upload files */}
      <form
        onSubmit={handleUpload}
        className="space-y-3 rounded-ctl-lg border border-ss-line bg-ss-page-alt p-5"
      >
        <div>
          <h3 className="font-display font-bold text-ss-ink">Option 1 · Upload files</h3>
          <p className="mt-0.5 text-xs text-ss-muted">
            PDF, DOCX, TXT, MD, or CSV (max 10 MB each). We extract the text for
            you - no title needed.
          </p>
        </div>
        <Input
          id="kb-files"
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.csv"
          className="cursor-pointer"
        />
        {uploadErr && (
          <p className="rounded-ctl bg-ss-rose-tint px-3 py-2 text-sm text-ss-rose-ink">
            {uploadErr}
          </p>
        )}
        {uploadMsg && (
          <p className="rounded-ctl bg-ss-hair px-3 py-2 text-sm text-ss-body">{uploadMsg}</p>
        )}
        <SsButton type="submit" variant="primary" size="md" disabled={uploading}>
          {uploading ? "Processing..." : "Upload files"}
        </SsButton>
      </form>

      {/* OR divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-ss-line" />
        <span className="ss-eyebrow text-ss-muted">or</span>
        <div className="h-px flex-1 bg-ss-line" />
      </div>

      {/* Option 2 - Paste text */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-ctl-lg border border-ss-line bg-ss-page-alt p-5"
      >
        <div>
          <h3 className="font-display font-bold text-ss-ink">Option 2 · Paste text</h3>
          <p className="mt-0.5 text-xs text-ss-muted">
            Type or paste one entry - a single FAQ, policy, or note. Both fields
            are required.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            required
            placeholder="Shipping policy"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="content">Content</Label>
          <Textarea
            id="content"
            required
            rows={6}
            placeholder="We ship within 1-2 business days. Domestic orders arrive in 3-5 days. International orders 7-14 days. We do not ship to PO boxes."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        {error && (
          <p className="rounded-ctl bg-ss-rose-tint px-3 py-2 text-sm text-ss-rose-ink">
            {error}
          </p>
        )}
        <SsButton type="submit" variant="primary" size="md" disabled={loading}>
          {loading ? "Saving..." : "Add entry"}
        </SsButton>
      </form>
    </div>
  );
}
