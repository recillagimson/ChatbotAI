import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/admin";
import { resolveSteps, sendFollowup, type FollowupChatbot } from "@/lib/followup";
import { resolveManychatApiKey } from "@/lib/manychat";
import {
  fetchFollowupAssets,
  resolveAssetByKey,
  stepAssetKeys,
} from "@/lib/followup-assets";
import type { Conversation, FollowupAsset } from "@/lib/types";

export const runtime = "nodejs";

// Chatbot columns resolveSteps() (FollowupChatbot) + resolveManychatApiKey() +
// the asset fetch (id) all need.
type TestChatbot = FollowupChatbot & {
  id: string;
  manychat_api_key_enc: string | null;
};

type TestRow = Pick<
  Conversation,
  | "id"
  | "manychat_subscriber_id"
  | "contact_name"
  | "platform"
  | "status"
  | "followup_count"
  | "followup_step_index"
  | "last_followup_at"
> & { chatbots: TestChatbot };

/**
 * ADMIN-ONLY test affordance: fire a conversation's NEXT follow-up step right now,
 * bypassing the silence-delay + tag gates (evaluateFollowup is NOT called) so any
 * test conversation can exercise the real sendFollowup delivery path — including the
 * Option B ManyChat voice/video FLOW trigger. sendFollowup's atomic claim still
 * refuses a self-muted or paused/taken-over chat (safety floor). Repeated calls walk
 * and wrap the sequence (VM1 -> VM2 -> VM3 -> VM1 ...). Never throws to the client.
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

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, manychat_subscriber_id, contact_name, platform, status, " +
        "followup_count, followup_step_index, last_followup_at, " +
        "chatbots!inner(id, auto_followup_enabled, auto_followup_days, auto_followup_template, " +
        "auto_followup_steps, auto_followup_loop_last, auto_followup_loop_mode, manychat_api_key_enc)"
    )
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const row = data as unknown as TestRow;
  const cb = row.chatbots;

  if (!row.manychat_subscriber_id) {
    return NextResponse.json({ ok: false, reason: "no_subscriber" }, { status: 400 });
  }

  const steps = resolveSteps(cb);
  if (!steps.length) {
    return NextResponse.json({ ok: false, reason: "no_steps" }, { status: 400 });
  }

  const index = row.followup_step_index ?? 0;
  const step = steps[index % steps.length];

  // Resolve the step's asset(s) exactly like the cron. A flow-only step has none.
  const assets: FollowupAsset[] = [];
  const keys = stepAssetKeys(step);
  if (keys.length) {
    const lib = await fetchFollowupAssets(supabase, cb.id);
    for (const key of keys) {
      const asset = resolveAssetByKey(lib, key);
      if (asset) assets.push(asset);
    }
  }

  let apiKey: string;
  try {
    apiKey = resolveManychatApiKey(cb);
  } catch {
    return NextResponse.json(
      { ok: false, reason: "manychat_key_unavailable" },
      { status: 502 }
    );
  }

  try {
    const content = await sendFollowup(
      supabase,
      row,
      step,
      assets,
      new Date(),
      apiKey,
      index + 1
      // no messageTag: in-window test
    );
    if (content === null) {
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: "muted_or_paused_or_empty",
      });
    }
    return NextResponse.json({ ok: true, sent: true, content });
  } catch (err) {
    console.error("[test-followup] send failed", id, err);
    return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 502 });
  }
}
