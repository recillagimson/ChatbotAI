"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RetrainBotButtonProps {
  chatbotId: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
  className?: string;
}

interface Result {
  ok: boolean;
  text: string;
}

/**
 * Rebuilds a chatbot's knowledge index (re-embeds every KB entry) and clears the
 * short-lived reply/dedup caches, so edits take effect right away. POSTs to
 * /api/chatbots/[id]/reindex — impersonation-aware, so it works under admin "view as".
 */
export function RetrainBotButton({
  chatbotId,
  variant = "outline",
  size = "default",
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
        setResult({ ok: true, text: `Retrained — ${detail}, caches cleared ✓` });
        router.refresh();
      } else {
        setResult({ ok: false, text: data.error ?? "Retrain failed — please try again." });
      }
    } catch {
      setResult({ ok: false, text: "Network error — please try again." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={running}
        onClick={handleRetrain}
        title="Rebuild the knowledge index and clear caches so your latest edits take effect"
      >
        {running ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Retraining…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retrain bot
          </>
        )}
      </Button>
      {result && (
        <p className={`mt-2 text-xs ${result.ok ? "text-green-600" : "text-destructive"}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}
