"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function FeedbackForm({ chatbotId }: { chatbotId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, chatbot_id: chatbotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not send your feedback.");
        setLoading(false);
        return;
      }
      setMessage("");
      setSuccess(true);
      setLoading(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your feedback.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="feedback">Your feedback</Label>
        <Textarea
          id="feedback"
          required
          rows={4}
          placeholder="Tell us what's working or what's not…"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setSuccess(false);
          }}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600">
          Thanks — your feedback reached the team.
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
