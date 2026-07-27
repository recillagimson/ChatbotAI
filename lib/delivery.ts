/**
 * Outbound-delivery tracking helpers. When a ManyChat push throws after its own
 * retries, the saved message row is marked `delivery_status='failed'` so the
 * reconcile cron (app/api/cron/reconcile-pushes) can retry it — instead of the
 * reply being silently lost. Best-effort by construction: a tracking write must
 * NEVER break the reply flow, so every helper swallows its own errors.
 */
import type { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

/** Insert a message row and return its id (or null on failure). Lets the caller
 *  mark THIS row failed if the subsequent push throws — no racy "recent message"
 *  guessing. Never throws. */
export async function insertMessageReturningId(
  supabase: ServiceClient,
  row: Record<string, unknown>
): Promise<string | null> {
  try {
    const { data } = await supabase.from("messages").insert(row).select("id").single();
    return (data as { id?: string } | null)?.id ?? null;
  } catch (err) {
    console.error("[delivery] insertMessageReturningId error", err);
    return null;
  }
}

/** Mark a saved message as failed-to-deliver so the reconcile cron retries it.
 *  Best-effort; a null id (insert failed) is a silent no-op. */
export async function markDeliveryFailed(
  supabase: ServiceClient,
  messageId: string | null | undefined
): Promise<void> {
  if (!messageId) return;
  try {
    await supabase.from("messages").update({ delivery_status: "failed" }).eq("id", messageId);
  } catch (err) {
    console.error("[delivery] markDeliveryFailed error", err);
  }
}
