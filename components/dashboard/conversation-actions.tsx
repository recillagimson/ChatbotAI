"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const paused = currentStatus === "ai_paused";

  async function toggle() {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("conversations")
      .update({ status: paused ? "active" : "ai_paused" })
      .eq("id", conversationId);
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex gap-2">
      <Button onClick={toggle} disabled={loading} variant="outline" size="sm">
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
