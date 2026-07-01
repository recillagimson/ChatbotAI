"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Pause, Play, CheckCircle2, RotateCcw } from "lucide-react";

export function ConversationActions({
  conversationId,
  currentStatus,
  confirmedAt = null,
}: {
  conversationId: string;
  currentStatus: string;
  confirmedAt?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic: flip the button the instant it's clicked, before the server
  // round-trip. Revert if the update fails.
  const [paused, setPaused] = useState(currentStatus === "ai_paused");
  const [confirmed, setConfirmed] = useState(!!confirmedAt);

  function toggle() {
    const next = !paused;
    setPaused(next);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ status: next ? "ai_paused" : "active" })
        .eq("id", conversationId);
      if (error) {
        setPaused(!next); // revert on failure
        return;
      }
      router.refresh();
    });
  }

  // Confirming a lead stops the auto follow-up drip (cron excludes confirmed_at).
  function toggleConfirmed() {
    const next = !confirmed;
    setConfirmed(next);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update(
          next
            ? { confirmed_at: new Date().toISOString(), confirmed_by: "manual" }
            : { confirmed_at: null, confirmed_by: null }
        )
        .eq("id", conversationId);
      if (error) {
        setConfirmed(!next); // revert on failure
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={toggle} disabled={isPending} variant="outline" size="sm">
        {paused ? (
          <>
            <Play className="h-4 w-4 mr-2" /> Resume AI replies
          </>
        ) : (
          <>
            <Pause className="h-4 w-4 mr-2" /> Pause AI (take over)
          </>
        )}
      </Button>
      <Button
        onClick={toggleConfirmed}
        disabled={isPending}
        variant={confirmed ? "outline" : "default"}
        size="sm"
      >
        {confirmed ? (
          <>
            <RotateCcw className="h-4 w-4 mr-2" /> Reopen (resume follow-ups)
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Mark confirmed
          </>
        )}
      </Button>
    </div>
  );
}
