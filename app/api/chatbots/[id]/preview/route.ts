import { NextResponse, type NextRequest } from "next/server";
import { resolveChatbotAccess, ownerScope } from "@/lib/chatbot-access";
import { buildKbBlock, isEmptyKbBlock } from "@/lib/retrieval";
import { generateReply } from "@/lib/anthropic";
import { renderTrainedResponses, isUsableTrainingPair } from "@/lib/training";
import { pickSectionOverrides } from "@/lib/change-categories";
import type { Chatbot, Message, TrainingPair } from "@/lib/types";

export const runtime = "nodejs";
// Like every other AI-calling route: the reply below can take a single retry, and
// without this the platform default could cut it off before the route answers.
export const maxDuration = 60;

const MAX_LEN = 2000;
const MAX_HISTORY = 40;

/**
 * Bot Trainer sandbox reply. Runs the SAME reply pipeline as the ManyChat webhook
 * (persona + KB + guardrails + trained responses) with no ManyChat delivery and no
 * stored conversation - the transcript is ephemeral (client-held). Lets the owner
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
  const access = await resolveChatbotAccess();
  if (!access.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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

  const { data: chatbot, error } = await ownerScope(
    access.db.from("chatbots").select("*").eq("id", id),
    access
  ).single<Chatbot>();
  if (error || !chatbot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });

  // Optional proposed section texts, so a Request Changes proposal can be tried
  // before it goes live. Only the three prompt sections can be swapped in (see
  // pickSectionOverrides); every other setting stays the bot's own.
  const overrides = pickSectionOverrides(body?.sectionsOverride);
  const bot: Chatbot = overrides ? { ...chatbot, ...overrides } : chatbot;

  // Optional unsaved working set so the owner can "try" a correction before saving.
  const pairs: TrainingPair[] = Array.isArray(body?.trainingPairsOverride)
    ? (body.trainingPairsOverride as TrainingPair[])
    : (chatbot.training_pairs ?? []);

  // Which prompt path this bot actually uses (mirror of buildSystemPrompt's gate),
  // so the trainer can show the owner whether their persona/system_prompt is even read.
  const hasSections = !!(
    bot.persona_section?.trim() ||
    bot.offers_section?.trim() ||
    bot.rebuttals_section?.trim()
  );
  const promptMode = hasSections
    ? "section"
    : bot.system_prompt?.trim()
      ? "legacy"
      : "generic";

  // Correction counts using the SAME predicate the renderer uses, so "active" here
  // equals what actually reaches the model, and "skipped" flags enabled-but-blank pairs.
  const enabledPairs = pairs.filter((p) => p && p.enabled);
  const trainingActive = enabledPairs.filter((p) => isUsableTrainingPair(p)).length;
  const trainingSkipped = enabledPairs.length - trainingActive;

  try {
    const kb = await buildKbBlock({ supabase: access.db, chatbot, history, userMessage });
    const { text } = await generateReply({
      chatbot: bot,
      kbBlock: kb.block,
      history,
      userMessage,
      memorySummary: null,
      mediaCatalog: null,
      turnInstruction: null,
      scheduledStart: null,
      trainedResponses: renderTrainedResponses(pairs),
      // One retry on a transient provider error (429 / 5xx / timeout), as the
      // live webhook does; a blip here used to dead-end the owner's test.
      retries: 1,
    });
    // Diagnostics so the owner can SEE why a reply looked "off" - an empty KB
    // (kbChars 0 in retrieval mode = the model got no knowledge base for this
    // message), which prompt path is active, and how many corrections applied.
    const kbEmpty = isEmptyKbBlock(kb.block);
    return NextResponse.json({
      text,
      diag: {
        promptMode,
        kbMode: kb.mode,
        kbChunks: kb.chunks,
        kbTopSimilarity: kb.topSimilarity,
        // 0 when the model got no real KB (blank retrieval OR the NO_KB sentinel),
        // so the char count never implies content that isn't actually there.
        kbChars: kbEmpty ? 0 : kb.block.trim().length,
        kbEmpty,
        trainingTotal: pairs.length,
        trainingActive,
        trainingSkipped,
      },
    });
  } catch (err) {
    console.error("[trainer-preview] generate failed", err);
    return NextResponse.json(
      { error: "The bot couldn't generate a reply. Try again." },
      { status: 502 }
    );
  }
}
