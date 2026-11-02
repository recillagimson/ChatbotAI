import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { isSlackWebhookUrl, maskSlackUrl } from "@/lib/lead-contact";
import { postToSlack } from "@/lib/lead-contact-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), url: z.string().trim().max(500) }),
  z.object({ action: z.literal("remove") }),
  z.object({ action: z.literal("test") }),
]);

/**
 * POST /api/admin/chatbots/[id]/slack-alert - superadmin-only control of the bot's
 * lead-contact Slack link (chatbots.slack_alert_url).
 *   save   : store a Slack Incoming Webhook link (validated as hooks.slack.com)
 *   remove : clear it (alerts stop; contacts are still saved and tagged)
 *   test   : post a sample alert to the stored link
 * The link itself is never sent back to the browser, only a masked hint.
 * Service role, like the other admin writes (requireSuperadmin checks the REAL user).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid chatbot." }, { status: 400 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;

  const supabase = createServiceClient();
  const { data: bot, error: readErr } = await supabase
    .from("chatbots")
    .select("id, name, slack_alert_url")
    .eq("id", id)
    .maybeSingle<{ id: string; name: string; slack_alert_url: string | null }>();
  if (readErr) {
    console.error("[slack-alert] read failed", readErr);
    return NextResponse.json(
      { error: "Couldn't load this bot. Has the slack-alert migration been run?" },
      { status: 500 }
    );
  }
  if (!bot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });

  if (body.action === "test") {
    if (!isSlackWebhookUrl(bot.slack_alert_url)) {
      return NextResponse.json({ error: "Save a Slack link first." }, { status: 400 });
    }
    const ok = await postToSlack(bot.slack_alert_url, {
      botName: `TEST - ${bot.name}`,
      platform: "instagram",
      leadName: "Test Lead",
      handle: "testlead",
      phone: "5551234567",
      email: "test@example.com",
      message: "This is a test alert from SpeedSettr. You can ignore it.",
      conversationUrl: null,
    });
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json(
          { error: "Slack refused the test. Check the link is still active in Slack." },
          { status: 502 }
        );
  }

  let next: string | null = null;
  if (body.action === "save") {
    if (!isSlackWebhookUrl(body.url)) {
      return NextResponse.json(
        { error: "That isn't a Slack webhook link. It starts with https://hooks.slack.com/services/" },
        { status: 400 }
      );
    }
    next = body.url.trim();
  }
  const { error } = await supabase.from("chatbots").update({ slack_alert_url: next }).eq("id", id);
  if (error) {
    console.error("[slack-alert] save failed", error);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, hint: next ? maskSlackUrl(next) : null });
}
