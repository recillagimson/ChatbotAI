"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SsButton } from "@/components/ss/controls";

/** Copy a submission as plain text (to paste into a prompt draft) and flip its status. */
export function IntakeActions({ id, status, text }: { id: string; status: "new" | "reviewed"; text: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the answers and copy them by hand.");
    }
  }

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/intakes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status === "new" ? "reviewed" : "new" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't update the status. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SsButton variant="outline" size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy all answers"}
      </SsButton>
      <SsButton variant={status === "new" ? "primary" : "ghost"} size="sm" onClick={toggle} disabled={busy}>
        {status === "new" ? "Mark reviewed" : "Mark as new"}
      </SsButton>
      {error && <span className="text-[12px] text-ss-rose-ink">{error}</span>}
    </div>
  );
}
