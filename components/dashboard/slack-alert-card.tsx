"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SsCard } from "@/components/ss/card";

/**
 * Admin-only: this bot's Slack link for lead-contact alerts (a lead typed a phone
 * number or email). Rendered on the Overview tab only for a superadmin. The saved
 * link never reaches the browser; the page passes a masked hint. Writes go through
 * POST /api/admin/chatbots/[id]/slack-alert.
 */
export function SlackAlertCard({
  chatbotId,
  initialHint,
}: {
  chatbotId: string;
  initialHint: string | null;
}) {
  const router = useRouter();
  const [hint, setHint] = useState(initialHint);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<null | "save" | "remove" | "test">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(action: "save" | "remove" | "test") {
    if (action === "remove" && !window.confirm("Stop Slack alerts for this bot?")) return;
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/chatbots/${chatbotId}/slack-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? { action, url } : { action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Something went wrong. Try again." });
        return;
      }
      if (action === "test") {
        setMessage({ ok: true, text: "Test alert sent. Check the Slack channel." });
      } else {
        setHint(data.hint ?? null);
        setUrl("");
        setMessage({ ok: true, text: action === "save" ? "Saved." : "Slack alerts are off for this bot." });
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SsCard tone="indigo" className="p-[22px]">
      <div className="ss-eyebrow tracking-[0.14em] text-ss-indigo-600">Admin · Slack alerts</div>
      <Label htmlFor="slack-alert-url" className="mt-3 block font-display text-[15px] font-bold text-ss-ink">
        Lead contact alerts
      </Label>
      <p className="mt-1 text-[13px] leading-snug text-ss-muted">
        When a lead sends a phone number or email, this bot posts it to a Slack channel.
        Paste the channel&rsquo;s Incoming Webhook link. Without one, the contact is still
        saved and the conversation is still marked Needs attention.
      </p>

      <p className="mt-3 text-[13px] font-semibold text-ss-ink">
        {hint ? `Connected: ${hint}` : "Not connected"}
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          id="slack-alert-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://hooks.slack.com/services/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button type="button" onClick={() => call("save")} disabled={!url.trim() || busy !== null}>
          {busy === "save" ? "Saving…" : hint ? "Replace" : "Save"}
        </Button>
      </div>

      {hint && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => call("test")} disabled={busy !== null}>
            {busy === "test" ? "Sending…" : "Send test alert"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => call("remove")} disabled={busy !== null}>
            Remove
          </Button>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`mt-3 text-[13px] font-semibold ${message.ok ? "text-ss-ink" : "text-ss-rose-ink"}`}
        >
          {message.text}
        </p>
      )}
    </SsCard>
  );
}
