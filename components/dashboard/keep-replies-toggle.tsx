"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SsCard } from "@/components/ss/card";

type ReplySwitchColumn = "keep_replies_when_tagged" | "keep_replies_when_subscribed";

/**
 * Per-chatbot: keep the reactive AI reply ON through a tag that would otherwise
 * silence it. Two switches (lib/conversation-silence.ts):
 *  - keep_replies_when_tagged: disqualified and Bot / Spam threads;
 *  - keep_replies_when_subscribed: subscribed users (their follow-ups stay off).
 * BOT_OFF, human takeover, and a lead's opt-out still silence the bot, and a
 * "Needs attention" flag never does. Each switch writes its own chatbots column
 * through the owner's own RLS-scoped Supabase client (same as BotActiveToggle - no
 * service role), optimistic, reverting with an inline error on a failed write or
 * one that saved no row.
 */
export function KeepRepliesToggle({
  chatbotId,
  initialTagged,
  initialSubscribed,
}: {
  chatbotId: string;
  initialTagged: boolean;
  initialSubscribed: boolean;
}) {
  return (
    <SsCard className="p-[22px]">
      <div className="flex flex-col gap-5">
        <ReplySwitchRow
          chatbotId={chatbotId}
          column="keep_replies_when_tagged"
          initial={initialTagged}
          label="Keep replying when tagged"
          description={
            <>
              Auto-reply even after the AI tags a chat disqualified or Bot / Spam.
              BOT_OFF, human takeover, and a lead&rsquo;s &ldquo;stop&rdquo; still
              silence the bot.
            </>
          }
        />
        <ReplySwitchRow
          chatbotId={chatbotId}
          column="keep_replies_when_subscribed"
          initial={initialSubscribed}
          label="Keep replying to subscribed users"
          description={
            <>
              Auto-reply to people marked subscribed too. Their follow-ups stay
              off, and BOT_OFF, human takeover, and a lead&rsquo;s &ldquo;stop&rdquo;
              still silence the bot.
            </>
          }
        />
      </div>
    </SsCard>
  );
}

function ReplySwitchRow({
  chatbotId,
  column,
  initial,
  label,
  description,
}: {
  chatbotId: string;
  column: ReplySwitchColumn;
  initial: boolean;
  label: string;
  description: ReactNode;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `reply-switch-${column}`;

  async function handleChange(next: boolean) {
    setOn(next); // optimistic
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // Ask for the row back: an update RLS filters out (a bot no longer yours, say)
    // returns no error and no row, and must not read as saved.
    const { data: saved, error: dbError } = await supabase
      .from("chatbots")
      .update({ [column]: next })
      .eq("id", chatbotId)
      .select("id");
    setSaving(false);
    if (dbError || !saved?.length) {
      setOn(!next); // revert the optimistic flip
      setError("Couldn't update - try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Label htmlFor={id} className="font-display text-[15px] font-bold text-ss-ink">
            {label}
          </Label>
          <p className="mt-1 text-[13px] leading-snug text-ss-muted">{description}</p>
        </div>
        <Switch id={id} checked={on} disabled={saving} onCheckedChange={handleChange} />
      </div>
      {error && (
        <p role="status" className="mt-2 text-[13px] font-semibold text-ss-rose-ink">
          {error}
        </p>
      )}
    </div>
  );
}
