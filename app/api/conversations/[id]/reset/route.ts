import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { resetConversation } from "@/lib/reset-conversation";

export const runtime = "nodejs";

/**
 * ADMIN-ONLY: reset a conversation to brand-new state from the inbox - the same wipe
 * the RESET_KEYWORD webhook word performs (delete the transcript + restore
 * fresh-conversation defaults), so the welcome VM, keyword triggers, and follow-ups
 * can be re-tested without touching ManyChat. Gated on the REAL superadmin (never the
 * impersonated client, so a superadmin "viewing as" a client can still reset the
 * client's thread); operates cross-tenant via the service client. Never throws to the
 * client.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin(); // real user, never impersonated
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServiceClient(); // admin operates cross-tenant

  // Confirm the conversation exists before wiping (honest 404 vs. a silent no-op).
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = await resetConversation(supabase, id);
  if (!result.ok) {
    console.error("[conversation-reset] failed", id, result.error);
    return NextResponse.json({ ok: false, reason: "reset_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
