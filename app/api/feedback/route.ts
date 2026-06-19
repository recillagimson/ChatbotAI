import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  message: z.string().min(1).max(4000),
  chatbot_id: z.string().uuid().optional(),
  attachments: z
    .array(
      z.object({
        path: z.string(),
        name: z.string(),
        type: z.string(),
        size: z.number(),
      })
    )
    .max(5)
    .optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please write your feedback." }, { status: 400 });
  }
  const { message, chatbot_id, attachments } = parsed.data;

  // Defense-in-depth over storage RLS: every attachment must live in the
  // caller's own folder ({user.id}/...).
  if (attachments?.some((a) => !a.path.startsWith(user.id + "/"))) {
    return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
  }

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

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    chatbot_id: boundChatbotId,
    message,
    status: "new",
    attachments: attachments ?? [],
  });
  if (error) return NextResponse.json({ error: "Could not send your feedback." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
