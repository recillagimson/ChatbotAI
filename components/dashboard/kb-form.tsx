"use client";

import { useState } from "react";
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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
  );
}
