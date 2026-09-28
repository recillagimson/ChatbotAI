import { NextResponse, type NextRequest } from "next/server";
import { resolveChatbotAccess, ownerScope, type ChatbotAccess } from "@/lib/chatbot-access";
import {
  sanitizeTrainingPair,
  sanitizeTrainingPairs,
  sameTrainingList,
  MAX_TRAINING_PAIRS,
  MAX_SCENARIO_CHARS,
  MAX_TRAINED_REPLY_CHARS,
} from "@/lib/training";
import type { TrainingPair } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one way corrections are written, now that there are two writers (the
 * Training tab and "Correct this reply" in Conversations):
 *  - POST adds ONE correction to whatever is stored now;
 *  - PUT replaces the list (the Training tab's Save), but only if the stored list
 *    is still the one that tab started from, so a stale tab can never drop a
 *    correction added somewhere else.
 * Both validate every field (lib/training.ts) and write with a compare-and-set on
 * chatbots.updated_at. Owner or superadmin, via the shared per-bot access check.
 */

type Access = Extract<ChatbotAccess, { ok: true }>;
type BotRow = { id: string; training_pairs: unknown; updated_at: string };

async function readBot(access: Access, id: string): Promise<BotRow | null> {
  const { data } = await ownerScope(
    access.db.from("chatbots").select("id, training_pairs, updated_at").eq("id", id),
    access
  ).maybeSingle();
  return (data as BotRow | null) ?? null;
}

async function writePairs(access: Access, id: string, pairs: TrainingPair[], updatedAt: string) {
  return ownerScope(
    access.db.from("chatbots").update({ training_pairs: pairs }).eq("id", id).eq("updated_at", updatedAt),
    access
  ).select("id");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveChatbotAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null);
  // The server mints the id: a client-chosen id could collide with a stored one.
  const pair = sanitizeTrainingPair(
    body?.pair && typeof body.pair === "object" ? { ...body.pair, id: undefined } : null
  );
  if (!pair) {
    return NextResponse.json(
      {
        error: `A correction needs both a situation (up to ${MAX_SCENARIO_CHARS} characters) and a reply (up to ${MAX_TRAINED_REPLY_CHARS}).`,
      },
      { status: 400 }
    );
  }

  // Read-append-write, retried once if another write lands in between.
  for (let attempt = 0; attempt < 2; attempt++) {
    const bot = await readBot(access, id);
    if (!bot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
    const current = Array.isArray(bot.training_pairs) ? (bot.training_pairs as TrainingPair[]) : [];
    if (current.length >= MAX_TRAINING_PAIRS) {
      return NextResponse.json(
        {
          error: `This bot already has ${MAX_TRAINING_PAIRS} corrections, the most it can use. Remove one on the Training tab first.`,
        },
        { status: 400 }
      );
    }
    const next = [...current, pair];
    const { data: written, error } = await writePairs(access, id, next, bot.updated_at);
    if (error) {
      console.error("[training-pairs] add failed", error);
      return NextResponse.json({ error: "Could not save the correction." }, { status: 500 });
    }
    if (written && written.length > 0) return NextResponse.json({ ok: true, pair, pairs: next });
  }
  return NextResponse.json(
    { error: "The bot changed at the same moment. Please try again." },
    { status: 409 }
  );
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveChatbotAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const bot = await readBot(access, id);
  if (!bot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });

  // Validated against the stored list, so corrections saved before the limits
  // existed stay savable while unchanged.
  const { pairs, error } = sanitizeTrainingPairs(body?.pairs, bot.training_pairs);
  if (error) return NextResponse.json({ error }, { status: 400 });

  if (!sameTrainingList(bot.training_pairs, body?.base)) {
    return NextResponse.json(
      {
        error:
          "Your corrections were changed somewhere else (for example from Conversations). Reload the page to see the latest, then make your edit again.",
      },
      { status: 409 }
    );
  }

  const { data: written, error: writeErr } = await writePairs(access, id, pairs, bot.updated_at);
  if (writeErr) {
    console.error("[training-pairs] save failed", writeErr);
    return NextResponse.json({ error: "Could not save your corrections." }, { status: 500 });
  }
  if (!written || written.length === 0) {
    return NextResponse.json(
      { error: "The bot changed at the same moment. Please save again." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, pairs });
}
