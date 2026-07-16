"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";

/**
 * Client-side master on/off for a chatbot. Flips chatbots.is_active via the
 * owner's own RLS-scoped Supabase client (same owner-scoped update the other
 * settings forms use — no service role), then refreshes so the server-rendered
 * status badge re-reads. Off = the webhook can't find an active chatbot, so the
 * bot stops auto-replying to ALL of this owner's DMs (bot-wide, same flag the
 * admin toggles). Instant + optimistic; reverts + shows an inline error on a
 * failed write. Distinct from the per-conversation "Pause AI (take over)".
 */
export function BotActiveToggle({
  chatbotId,
  initialActive,
}: {
  chatbotId: string;
  initialActive: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setActive(next); // optimistic
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("chatbots")
      .update({ is_active: next })
      .eq("id", chatbotId);
    setSaving(false);
    if (dbError) {
      setActive(!next); // revert the optimistic flip
      setError("Couldn't update — try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">AI auto-replies</span>
        <Switch
          checked={active}
          onCheckedChange={handleChange}
          disabled={saving}
          aria-label="Turn the bot's AI auto-replies on or off"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        When off, the bot stops auto-replying to all your DMs until you turn it back on.
      </p>
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>
      )}
    </div>
  );
}
