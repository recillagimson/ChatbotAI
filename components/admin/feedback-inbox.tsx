"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FeedbackStatus = "new" | "read" | "resolved";

export type FeedbackItem = {
  id: string;
  message: string;
  status: FeedbackStatus;
  created_at: string;
  admin_note: string | null;
  clientEmail: string | null;
  clientName: string | null;
  botName: string | null;
};

function statusBadge(status: FeedbackStatus) {
  switch (status) {
    case "new":
      return <Badge variant="default">New</Badge>;
    case "read":
      return <Badge variant="secondary">Read</Badge>;
    case "resolved":
      return <Badge variant="success">Resolved</Badge>;
  }
}

export function FeedbackInbox({ items }: { items: FeedbackItem[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">No feedback here yet.</p>;
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <FeedbackCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [note, setNote] = useState(item.admin_note ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const client = item.clientName || item.clientEmail || "Unknown";

  async function run(label: string, targetStatus: FeedbackStatus) {
    setError(null);
    setBusy(label);
    try {
      const res = await fetch(`/api/admin/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus, admin_note: note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.error) || "Something went wrong. Try again.");
        setBusy(null);
        return;
      }
      // The server re-renders with the new status; this card re-initializes
      // from fresh props.
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const noteId = `feedback-note-${item.id}`;

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(item.status)}
          <span className="text-sm font-medium">{client}</span>
          {item.botName && (
            <span className="text-xs text-muted-foreground">{item.botName}</span>
          )}
          <time
            dateTime={item.created_at}
            className="text-xs text-muted-foreground tabular-nums"
          >
            {new Date(item.created_at).toLocaleDateString()}
          </time>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm">{item.message}</p>

        <div className="space-y-2">
          <Label htmlFor={noteId}>Internal note</Label>
          <Textarea
            id={noteId}
            rows={2}
            placeholder="Optional note for the team."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy !== null}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {item.status === "new" && (
            <>
              <Button
                type="button"
                size="lg"
                onClick={() => run("read", "read")}
                disabled={busy !== null}
              >
                {busy === "read" ? "Saving…" : "Mark read"}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => run("resolved", "resolved")}
                disabled={busy !== null}
              >
                {busy === "resolved" ? "Saving…" : "Mark resolved"}
              </Button>
            </>
          )}
          {item.status === "read" && (
            <>
              <Button
                type="button"
                size="lg"
                onClick={() => run("resolved", "resolved")}
                disabled={busy !== null}
              >
                {busy === "resolved" ? "Saving…" : "Mark resolved"}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => run("reopen", "new")}
                disabled={busy !== null}
              >
                {busy === "reopen" ? "Saving…" : "Reopen"}
              </Button>
            </>
          )}
          {item.status === "resolved" && (
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => run("reopen", "new")}
              disabled={busy !== null}
            >
              {busy === "reopen" ? "Saving…" : "Reopen"}
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            variant="secondary"
            onClick={() => run("save-note", item.status)}
            disabled={busy !== null}
          >
            {busy === "save-note" ? "Saving…" : "Save note"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
