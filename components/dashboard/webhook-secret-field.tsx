"use client";

import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";

interface WebhookSecretFieldProps {
  chatbotId: string;
  secret: string;
}

export function WebhookSecretField({ chatbotId, secret: initialSecret }: WebhookSecretFieldProps) {
  const [secret, setSecret] = useState(initialSecret);
  const [rotating, setRotating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function handleRegenerate() {
    const confirmed = window.confirm(
      "Generate a new secret? You'll need to update the x-manychat-secret header in ManyChat with the new value."
    );
    if (!confirmed) return;

    setRotating(true);
    setNote(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/webhook-secret`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json() as { webhook_secret: string };
        setSecret(data.webhook_secret);
        setNote("New secret generated — update it in ManyChat now.");
      } else {
        setNote("Failed to regenerate secret. Please try again.");
      }
    } catch {
      setNote("Network error — please try again.");
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={secret}
          className="font-mono text-xs"
        />
        <CopyButton value={secret} />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={rotating}
        onClick={handleRegenerate}
      >
        {rotating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Regenerating…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate
          </>
        )}
      </Button>

      {note && (
        <p className="text-xs text-amber-600">{note}</p>
      )}
    </div>
  );
}
