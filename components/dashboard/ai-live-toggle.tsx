"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/**
 * The workspace master switch - "AI replies are live".
 *
 * The design keeps this on screen at every moment for one reason: a bot that is
 * silently paused is the worst failure mode this product has. So it states the
 * current condition in words, not just a switch position, and turns rose the
 * moment replies stop.
 *
 * It writes `chatbots.is_active` for every chatbot the owner has, through their
 * own RLS-scoped client - the same flag and the same path the per-bot toggle
 * uses, so the two always agree.
 */
export function AiLiveToggle({
  live,
  botIds,
  className,
}: {
  live: boolean;
  botIds: string[];
  className?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(live);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = botIds.length === 0 || pending;

  async function toggle() {
    if (disabled) return;
    const next = !on;
    setOn(next); // optimistic
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("chatbots")
      .update({ is_active: next })
      .in("id", botIds);
    if (dbError) {
      setOn(!next);
      setError("Couldn't update - try again.");
      return;
    }
    startTransition(() => router.refresh());
  }

  const label = on
    ? "AI replies are live"
    : botIds.length === 0
      ? "No chatbot yet"
      : "AI replies are OFF";

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        role="switch"
        aria-checked={on}
        aria-label={
          on
            ? "AI replies are live. Turn off auto-replies for every chatbot."
            : "AI replies are off. Turn on auto-replies for every chatbot."
        }
        className={cn(
          "flex items-center gap-2.5 rounded-full border py-[7px] pl-[11px] pr-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          on
            ? "border-ss-green-line bg-ss-green-bg focus-visible:ring-ss-green"
            : "border-ss-rose-line bg-ss-rose-tint focus-visible:ring-ss-rose",
          disabled ? "cursor-not-allowed opacity-70" : "hover:brightness-[0.98]"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-[7px] w-[7px] shrink-0 rounded-full",
            on
              ? "bg-ss-green shadow-[0_0_0_3px_rgba(5,150,105,.16)]"
              : "bg-ss-rose shadow-[0_0_0_3px_rgba(225,29,72,.16)]"
          )}
        />
        <span
          className={cn(
            "whitespace-nowrap text-[12.5px] font-semibold leading-none",
            on ? "text-ss-green-ink" : "text-ss-rose-ink"
          )}
        >
          {label}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "flex h-[17px] w-[30px] shrink-0 items-center rounded-full px-[2px] transition-colors",
            on ? "justify-end bg-ss-green" : "justify-start bg-ss-rose/40"
          )}
        >
          <span className="h-[13px] w-[13px] rounded-full bg-white" />
        </span>
      </button>
      {error && (
        <p
          role="status"
          className="absolute right-0 top-full z-10 mt-1.5 whitespace-nowrap rounded-ctl bg-ss-rose px-2.5 py-1.5 text-[11px] font-semibold text-white"
        >
          {error}
        </p>
      )}
    </div>
  );
}
