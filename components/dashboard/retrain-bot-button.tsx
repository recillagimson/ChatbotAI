"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { SsButton } from "@/components/ss/controls";

interface RetrainBotButtonProps {
  chatbotId: string;
  variant?: "primary" | "navy" | "outline" | "soft";
  size?: "sm" | "md" | "lg";
  className?: string;
}

interface Result {
  ok: boolean;
  text: string;
}

/**
 * Rebuilds a chatbot's knowledge index (re-embeds every KB entry) and clears the
 * short-lived reply/dedup caches, so edits take effect right away. POSTs to
 * /api/chatbots/[id]/reindex - impersonation-aware, so it works under admin "view as".
 */
export function RetrainBotButton({
  chatbotId,
  variant = "primary",
  size = "md",
  className,
}: RetrainBotButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleRetrain() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/reindex`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        entries?: number;
        indexed?: number;
        error?: string;
      };
      if (res.ok) {
        const entries = data.entries ?? 0;
        const indexed = data.indexed ?? 0;
        const unit = entries === 1 ? "entry" : "entries";
        const detail =
          indexed > 0
            ? `${indexed} of ${entries} ${unit} re-indexed`
            : `${entries} ${unit} refreshed`;
        setResult({ ok: true, text: `Retrained - ${detail}, caches cleared ✓` });
        router.refresh();
      } else {
        setResult({ ok: false, text: data.error ?? "Retrain failed - please try again." });
      }
    } catch {
      setResult({ ok: false, text: "Network error - please try again." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={className}>
      <SsButton
        type="button"
        variant={variant}
        size={size}
        disabled={running}
        onClick={handleRetrain}
        title="Rebuild the knowledge index and clear caches so your latest edits take effect"
      >
        {running ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Retraining…
          </>
        ) : (
          <>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Retrain bot
          </>
        )}
      </SsButton>
      {result && (
        <p
          role="status"
          className={`mt-2 text-[11.5px] font-medium leading-snug ${
            result.ok ? "text-ss-green-ink" : "text-ss-rose-ink"
          }`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
