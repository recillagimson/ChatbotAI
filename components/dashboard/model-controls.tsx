"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SsCard } from "@/components/ss/card";
import { cn } from "@/lib/utils";
import { ALLOWED_REPLY_MODELS } from "@/lib/model-tiers";

/**
 * Admin-only per-chatbot cost controls, rendered on the Overview tab ONLY for a
 * superadmin (the page server-gates visibility via requireSuperadmin). Two
 * independent controls:
 *   - reply_model: override the reactive-reply model for this bot (null = tier default).
 *   - force_retrieval: force KB vector retrieval regardless of KB size (cuts tokens;
 *     needs the bot's KB reindexed first, else it safely serves full-context).
 * Writes through the owner's own RLS-scoped browser client (same as
 * KeepRepliesToggle / BotActiveToggle - no service role); optimistic, reverting
 * with an inline error on a failed write. Each control saves independently.
 */
export function ModelControls({
  chatbotId,
  initialReplyModel,
  initialForceRetrieval,
}: {
  chatbotId: string;
  initialReplyModel: string | null;
  initialForceRetrieval: boolean;
}) {
  const router = useRouter();
  const [replyModel, setReplyModel] = useState(initialReplyModel ?? "");
  const [forceRetrieval, setForceRetrieval] = useState(initialForceRetrieval);
  const [savingModel, setSavingModel] = useState(false);
  const [savingRetrieval, setSavingRetrieval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveModel(next: string) {
    const prev = replyModel;
    setReplyModel(next); // optimistic
    setSavingModel(true);
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("chatbots")
      // Empty string -> null so an unset override means "use the tier default".
      .update({ reply_model: next === "" ? null : next })
      .eq("id", chatbotId);
    setSavingModel(false);
    if (dbError) {
      setReplyModel(prev); // revert
      setError("Couldn't update the model - try again.");
      return;
    }
    router.refresh();
  }

  async function saveRetrieval(next: boolean) {
    setForceRetrieval(next); // optimistic
    setSavingRetrieval(true);
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("chatbots")
      .update({ force_retrieval: next })
      .eq("id", chatbotId);
    setSavingRetrieval(false);
    if (dbError) {
      setForceRetrieval(!next); // revert
      setError("Couldn't update retrieval - try again.");
      return;
    }
    router.refresh();
  }

  return (
    <SsCard tone="indigo" className="p-[22px]">
      <div className="ss-eyebrow tracking-[0.14em] text-ss-indigo-600">
        Admin · cost controls
      </div>

      {/* Reply model override */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Label
            htmlFor="reply-model"
            className="font-display text-[15px] font-bold text-ss-ink"
          >
            Reply model
          </Label>
          <p className="mt-1 text-[13px] leading-snug text-ss-muted">
            The model this bot uses to write DM replies. Leave on the default
            unless you&rsquo;re tuning cost or quality for this bot specifically.
          </p>
        </div>
        <select
          id="reply-model"
          value={replyModel}
          disabled={savingModel}
          onChange={(e) => saveModel(e.target.value)}
          className={cn(
            "flex h-10 min-w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          )}
          aria-label="Reply model"
        >
          <option value="">Use default</option>
          {ALLOWED_REPLY_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="my-4 h-px bg-ss-rule-indigo" />

      {/* Force retrieval */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Label
            htmlFor="force-retrieval"
            className="font-display text-[15px] font-bold text-ss-ink"
          >
            Force KB retrieval
          </Label>
          <p className="mt-1 text-[13px] leading-snug text-ss-muted">
            Send only the most relevant knowledge-base chunks each reply instead
            of the whole KB - big token savings on large or busy bots. Reindex
            this bot&rsquo;s knowledge base first; until then it safely keeps
            using the full KB.
          </p>
        </div>
        <Switch
          id="force-retrieval"
          checked={forceRetrieval}
          disabled={savingRetrieval}
          onCheckedChange={saveRetrieval}
        />
      </div>

      {error && (
        <p role="status" className="mt-3 text-[13px] font-semibold text-ss-rose-ink">
          {error}
        </p>
      )}
    </SsCard>
  );
}
