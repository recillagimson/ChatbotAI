"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

interface ManychatKeyFieldProps {
  chatbotId: string;
  configured: boolean;
}

interface Message {
  ok: boolean;
  text: string;
}

export function ManychatKeyField({ chatbotId, configured }: ManychatKeyFieldProps) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [isConfigured, setIsConfigured] = useState(configured);

  async function handleSave() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/manychat-key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (res.ok) {
        const pageName = (data as { pageName?: string }).pageName;
        setMessage({
          ok: true,
          text: pageName ? `Connected to ${pageName} ✓` : "API key saved ✓",
        });
        setApiKey("");
        setIsConfigured(true);
        router.refresh();
      } else {
        const { error, detail } = data as { error: string; detail?: string };
        setMessage({ ok: false, text: detail ? `${error} (${detail})` : error });
      }
    } catch {
      setMessage({ ok: false, text: "Network error - please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/chatbots/${chatbotId}/manychat-key`, {
        method: "DELETE",
      });
      if (res.ok) {
        setIsConfigured(false);
        setMessage({ ok: true, text: "API key removed." });
        router.refresh();
      } else {
        const data = await res.json() as { error: string };
        setMessage({ ok: false, text: data.error ?? "Failed to remove key." });
      }
    } catch {
      setMessage({ ok: false, text: "Network error - please try again." });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="manychat-api-key">ManyChat API key</Label>
        <p className="text-xs text-muted-foreground">
          Find it in ManyChat → Settings → API. Stored encrypted; we never show it again.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {isConfigured ? (
          <span className="text-green-600 font-medium">● Connected</span>
        ) : (
          <span className="text-muted-foreground">○ Not connected - using the global key</span>
        )}
      </div>

      <PasswordInput
        id="manychat-api-key"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={
          isConfigured ? "•••••••• (a key is saved)" : "Paste your ManyChat API key"
        }
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={saving || !apiKey.trim()}
          onClick={handleSave}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>

        {isConfigured && (
          <Button
            type="button"
            variant="outline"
            disabled={removing || saving}
            onClick={handleRemove}
          >
            {removing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Removing…
              </>
            ) : (
              "Remove"
            )}
          </Button>
        )}
      </div>

      {message && (
        <p
          className={`text-sm ${
            message.ok ? "text-green-600" : "text-destructive"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
