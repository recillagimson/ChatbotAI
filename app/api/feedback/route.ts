import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  message: z.string().min(1).max(4000),
  chatbot_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please write your feedback." }, { status: 400 });
  }
  const { message, chatbot_id } = parsed.data;

  const supabase = await createClient();

  // If a chatbot was named, confirm the client owns it (else store as general feedback).
  let boundChatbotId: string | null = null;
  if (chatbot_id) {
    const { data: owned } = await supabase
      .from("chatbots")
      .select("id")
      .eq("id", chatbot_id)
      .eq("user_id", user.id)
      .maybeSingle();
    boundChatbotId = owned ? chatbot_id : null;
  }

  const { error } = await supabase
    .from("feedback")
    .insert({ user_id: user.id, chatbot_id: boundChatbotId, message, status: "new" });
  if (error) return NextResponse.json({ error: "Could not send your feedback." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
