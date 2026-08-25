"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Starts impersonation for a client (POST /api/admin/view-as) and drops the
 * admin into the client's real dashboard at /dashboard. Superadmin-only (the
 * route enforces it). `variant="button"` renders a full button; the default is a
 * compact inline link suited to table rows.
 */
export function ViewAsButton({
  clientId,
  label = "View as client",
  variant = "link",
}: {
  clientId: string;
  label?: string;
  variant?: "link" | "button";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError((data && data.error) || "Could not start the client view.");
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not start the client view.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 font-semibold leading-none transition-colors disabled:opacity-60",
          variant === "button"
            ? "rounded-[10px] bg-ss-indigo-600 px-[13px] py-2.5 text-[12.5px] text-white hover:bg-ss-indigo-700"
            : "text-[12.5px] text-ss-indigo-600 hover:text-ss-indigo-800"
        )}
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        {busy ? "Opening…" : label}
      </button>
      {error && <span className="text-[11.5px] text-ss-rose-ink">{error}</span>}
    </span>
  );
}
