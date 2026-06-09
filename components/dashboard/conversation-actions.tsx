"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";

export function ConversationActions({
  conversationId,
  currentStatus,
}: {
  conversationId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic: flip the button the instant it's clicked, before the server
  // round-trip. Revert if the update fails.
  const [paused, setPaused] = useState(currentStatus === "ai_paused");

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

  return (
    <div className="flex gap-2">
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
    </div>
  );
}
