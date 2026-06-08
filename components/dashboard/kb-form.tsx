"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function KnowledgeBaseForm({
  chatbots,
}: {
  chatbots: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [chatbotId, setChatbotId] = useState(chatbots[0]?.id ?? "");

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
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("knowledge_base").insert({
      chatbot_id: chatbotId,
      user_id: user.id,
      title,
      content,
      source_type: "manual",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setTitle("");
    setContent("");
    setLoading(false);
    router.refresh();
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
        router.refresh();
      }
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Shared: which chatbot this knowledge belongs to */}
      <div className="space-y-2">
        <Label htmlFor="chatbot">For chatbot</Label>
        <select
          id="chatbot"
          value={chatbotId}
          onChange={(e) => setChatbotId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {chatbots.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted-foreground">
        Add knowledge in <b>one</b> of two ways — you only need to do one.
      </p>

      {/* Option 1 — Upload files */}
      <form
        onSubmit={handleUpload}
        className="rounded-lg border bg-card p-5 space-y-3"
      >
        <div>
          <h3 className="font-semibold">Option 1 · Upload files</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            PDF, DOCX, TXT, MD, or CSV (max 10 MB each). We extract the text for
            you — no title needed.
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
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
            {uploadErr}
          </p>
        )}
        {uploadMsg && (
          <p className="text-sm bg-muted px-3 py-2 rounded">{uploadMsg}</p>
        )}
        <Button type="submit" disabled={uploading}>
          {uploading ? "Processing..." : "Upload files"}
        </Button>
      </form>

      {/* OR divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Option 2 — Paste text */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border bg-card p-5 space-y-4"
      >
        <div>
          <h3 className="font-semibold">Option 2 · Paste text</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Type or paste one entry — a single FAQ, policy, or note. Both fields
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
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Add entry"}
        </Button>
      </form>
    </div>
  );
}
