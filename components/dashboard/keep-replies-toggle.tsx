"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SsCard } from "@/components/ss/card";

/**
 * Per-chatbot: keep the reactive AI reply ON even when a classifier tag
 * (subscribed / disqualified / bot) is set. BOT_OFF, human takeover, and a
 * lead's opt-out still silence the bot. Writes chatbots.keep_replies_when_tagged
 * through the owner's own RLS-scoped Supabase client (same as BotActiveToggle -
 * no service role), optimistic, reverting with an inline error on a failed write.
 */
export function KeepRepliesToggle({
  chatbotId,
  initial,
}: {
  chatbotId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setOn(next); // optimistic
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("chatbots")
      .update({ keep_replies_when_tagged: next })
      .eq("id", chatbotId);
    setSaving(false);
    if (dbError) {
      setOn(!next); // revert the optimistic flip
      setError("Couldn't update - try again.");
      return;
    }
    router.refresh();
  }

  return (
    <SsCard className="p-[22px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Label
            htmlFor="keep-replies-tagged"
            className="font-display text-[15px] font-bold text-ss-ink"
          >
            Keep replying when tagged
          </Label>
          <p className="mt-1 text-[13px] leading-snug text-ss-muted">
            Auto-reply even after the AI tags a chat subscribed or disqualified.
            BOT_OFF, human takeover, and a lead&rsquo;s &ldquo;stop&rdquo; still
            silence the bot.
          </p>
        </div>
        <Switch
          id="keep-replies-tagged"
          checked={on}
          disabled={saving}
          onCheckedChange={handleChange}
        />
      </div>
      {error && (
        <p role="status" className="mt-2 text-[13px] font-semibold text-ss-rose-ink">
          {error}
        </p>
      )}
    </SsCard>
  );
}
