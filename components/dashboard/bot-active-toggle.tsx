"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/**
 * Per-chatbot master on/off.
 *
 * Flips `chatbots.is_active` through the owner's own RLS-scoped Supabase client
 * (the same owner-scoped update the other settings forms use - no service role),
 * then refreshes so the server-rendered status re-reads. Off = the webhook can't
 * find an active chatbot, so this bot stops auto-replying to every DM on it.
 * Optimistic, and reverts with an inline error on a failed write.
 *
 * Distinct from the per-conversation "Pause AI (take over)", and from the top
 * bar's workspace-wide switch - this one is scoped to a single bot.
 *
 * `dark` renders it on the chatbot page's navy health strip.
 */
export function BotActiveToggle({
  chatbotId,
  initialActive,
  dark = false,
}: {
  chatbotId: string;
  initialActive: boolean;
  dark?: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange() {
    const next = !active;
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
      setError("Couldn't update - try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className={cn("flex flex-col items-end gap-1.5")}>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        disabled={saving}
        onClick={handleChange}
        aria-label="Turn this chatbot's AI auto-replies on or off"
        className={cn(
          "flex h-[29px] w-[52px] shrink-0 items-center rounded-full px-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          dark ? "focus-visible:ring-offset-ss-navy" : "focus-visible:ring-offset-white",
          active
            ? "justify-end bg-ss-mint focus-visible:ring-ss-mint"
            : dark
              ? "justify-start bg-white/20 focus-visible:ring-white/50"
              : "justify-start bg-ss-dash focus-visible:ring-ss-indigo",
          saving && "opacity-70"
        )}
      >
        <span className="h-[23px] w-[23px] rounded-full bg-white shadow-sm" />
      </button>
      {error && (
        <p
          role="status"
          className={cn(
            "text-[11px] font-semibold leading-none",
            dark ? "text-ss-rose-soft" : "text-ss-rose-ink"
          )}
        >
          {error}
        </p>
      )}
    </div>
  );
}
