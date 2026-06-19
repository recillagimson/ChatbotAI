"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ChangeRequestForm({ chatbotId }: { chatbotId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [requestText, setRequestText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatbot_id: chatbotId, request_text: requestText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not submit your request.");
        setLoading(false);
        return;
      }
      setRequestText("");
      setSuccess(true);
      setLoading(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="change-request">What would you like changed?</Label>
        <Textarea
          id="change-request"
          required
          rows={5}
          placeholder="Make my bot sound more premium and stop quoting prices. Also mention we ship internationally."
          value={requestText}
          onChange={(e) => {
            setRequestText(e.target.value);
            setSuccess(false);
          }}
        />
        <p className="text-xs text-muted-foreground">
          This can take a few seconds while the AI drafts a proposal for the team.
        </p>
      </div>
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600">
          Sent to the SpeedSettr team — we&apos;ll review and apply it.
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
