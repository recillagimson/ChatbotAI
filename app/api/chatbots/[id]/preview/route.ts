import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { buildKbBlock } from "@/lib/retrieval";
import { generateReply } from "@/lib/anthropic";
import { renderTrainedResponses } from "@/lib/training";
import type { Chatbot, Message, TrainingPair } from "@/lib/types";

export const runtime = "nodejs";

const MAX_LEN = 2000;
const MAX_HISTORY = 40;

/**
 * Bot Trainer sandbox reply. Runs the SAME reply pipeline as the ManyChat webhook
 * (persona + KB + guardrails + trained responses) with no ManyChat delivery and no
 * stored conversation — the transcript is ephemeral (client-held). Lets the owner
 * test the bot and preview a correction (trainingPairsOverride) before saving.
 *
 * Auth: getCurrentUser() (impersonation-aware) + RLS; the chatbot is loaded scoped
 * to the current user, matching app/api/conversations/[id]/reply/route.ts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const userMessage = typeof body?.userMessage === "string" ? body.userMessage.trim() : "";
  if (!userMessage) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (userMessage.length > MAX_LEN) {
    return NextResponse.json({ error: `Message too long (max ${MAX_LEN}).` }, { status: 400 });
  }

  const history: Pick<Message, "role" | "content">[] = Array.isArray(body?.history)
    ? body.history
        .filter(
          (m: unknown): m is { role: string; content: string } =>
            !!m && typeof (m as { content?: unknown }).content === "string"
        )
        .slice(-MAX_HISTORY)
        .map((m: { role: string; content: string }) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }))
    : [];

  const supabase = await createClient();
  const { data: chatbot, error } = await supabase
    .from("chatbots")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<Chatbot>();
  if (error || !chatbot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });

  // Optional unsaved working set so the owner can "try" a correction before saving.
  const pairs: TrainingPair[] = Array.isArray(body?.trainingPairsOverride)
    ? (body.trainingPairsOverride as TrainingPair[])
    : (chatbot.training_pairs ?? []);

  try {
    const kb = await buildKbBlock({ supabase, chatbot, history, userMessage });
    const { text } = await generateReply({
      chatbot,
      kbBlock: kb.block,
      history,
      userMessage,
      memorySummary: null,
      mediaCatalog: null,
      turnInstruction: null,
      scheduledStart: null,
      trainedResponses: renderTrainedResponses(pairs),
    });
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[trainer-preview] generate failed", err);
    return NextResponse.json(
      { error: "The bot couldn't generate a reply. Try again." },
      { status: 502 }
    );
  }
}
