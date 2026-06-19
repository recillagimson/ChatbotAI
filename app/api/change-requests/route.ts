import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { draftChangeRequest } from "@/lib/anthropic";
import type { Chatbot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  chatbot_id: z.string().uuid(),
  request_text: z.string().min(1).max(4000),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please write what you'd like changed." }, { status: 400 });
  }
  const { chatbot_id, request_text } = parsed.data;

  const supabase = await createClient();

  // Ownership + the fields draftChangeRequest needs (NOT select *).
  const { data: chatbot } = await supabase
    .from("chatbots")
    .select("id, name, business_description, tone, system_prompt")
    .eq("id", chatbot_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!chatbot) return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });

  // Insert the request FIRST so a slow/failed draft never loses it.
  const { data: inserted, error: insertError } = await supabase
    .from("change_requests")
    .insert({ chatbot_id, user_id: user.id, request_text, status: "pending" })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return NextResponse.json({ error: "Could not submit your request." }, { status: 500 });
  }

  // Auto-draft with Sonnet (non-fatal).
  try {
    const { data: kbRows } = await supabase
      .from("knowledge_base")
      .select("title")
      .eq("chatbot_id", chatbot_id);
    const kbTitles = (kbRows ?? []).map((r: { title: string }) => r.title).filter(Boolean);

    const { proposal, model } = await draftChangeRequest({
      chatbot: chatbot as Chatbot,
      kbTitles,
      requestText: request_text,
    });
    await supabase
      .from("change_requests")
      .update({ proposed: proposal, model_used: model })
      .eq("id", inserted.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "draft failed";
    await supabase.from("change_requests").update({ draft_error: msg }).eq("id", inserted.id);
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
