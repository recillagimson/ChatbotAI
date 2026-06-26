"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

/**
 * Always-visible bar shown while a superadmin is "viewing as" a client. Exit
 * clears the impersonation cookie (DELETE /api/admin/view-as) and returns to the
 * client's admin detail page.
 */
export function ImpersonationBanner({
  clientLabel,
  clientId,
}: {
  clientLabel: string;
  clientId: string;
}) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function exit() {
    setExiting(true);
    try {
      await fetch("/api/admin/view-as", { method: "DELETE" });
    } catch {
      /* fall through to navigation regardless */
    }
    router.push(`/admin/clients/${clientId}`);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" aria-hidden="true" />
        Viewing as <span className="font-semibold">{clientLabel}</span> — changes
        save to their account.
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        className="rounded-md bg-amber-950/10 px-3 py-1 font-semibold transition-colors hover:bg-amber-950/20 disabled:opacity-60"
      >
        {exiting ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
