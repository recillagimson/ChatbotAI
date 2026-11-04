"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { SsButton } from "@/components/ss/controls";
import { Callout } from "@/components/ss/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/ui/copy-button";

const MIN = 8;
// No look-alike characters (0/O, 1/l/I), so it's easy to read out or retype.
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
}

/**
 * Superadmin control on the client page: set a new password for a client who
 * can't log in. Shows the new password once so the admin can copy and send it.
 */
export function ResetPasswordForm({ userId, email }: { userId: string; email: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setDone(null);
    if (password.length < MIN) {
      setError(`Password must be at least ${MIN} characters.`);
      return;
    }
    if (!window.confirm(`Set a new password for ${email}? Their old password stops working.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || "Something went wrong.");
        return;
      }
      setDone(password);
      setPassword("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-snug text-ss-muted">
        Set a new password for <span className="font-semibold text-ss-ink">{email}</span>, then
        send it to them. They can change it later under Settings.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="admin-new-pw">New password</Label>
          <Input
            id="admin-new-pw"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={`At least ${MIN} characters`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setDone(null);
            }}
          />
        </div>
        <SsButton
          type="button"
          variant="outline"
          onClick={() => {
            setPassword(generatePassword());
            setDone(null);
            setError(null);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Generate
        </SsButton>
        <SsButton type="button" onClick={submit} disabled={busy || !password}>
          {busy ? "Saving…" : "Set password"}
        </SsButton>
      </div>

      {error && <Callout tone="rose">{error}</Callout>}

      {done && (
        <Callout tone="indigo" title="Password updated">
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <code className="rounded bg-ss-chip px-2 py-1 font-mono text-[13px] text-ss-ink">
              {done}
            </code>
            <CopyButton value={done} />
          </div>
          <p className="mt-2">
            Send this to the client now. It won&apos;t be shown again after you leave this page.
          </p>
        </Callout>
      )}
    </div>
  );
}
