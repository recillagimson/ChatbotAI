import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { resolveManychatApiKey, listManychatFlows } from "@/lib/manychat";

export const runtime = "nodejs";

/**
 * GET /api/chatbots/[id]/manychat-flows
 * List the chatbot's ManyChat flows (ns + name) for the follow-up step picker.
 * The API key is resolved + used server-side only; it never reaches the client.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser(); // impersonation-aware (admin view-as) — gotcha #7
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = await createClient();
  // RLS also enforces ownership; the explicit filter gives a clean 404.
  const { data: chatbot, error } = await supabase
    .from("chatbots")
    .select("id, manychat_api_key_enc")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!chatbot) {
    return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
  }

  let apiKey: string;
  try {
    apiKey = resolveManychatApiKey(chatbot);
  } catch {
    return NextResponse.json(
      { error: "Connect your ManyChat API key on this chatbot first." },
      { status: 502 }
    );
  }

  try {
    const flows = await listManychatFlows(apiKey);
    return NextResponse.json({ flows });
  } catch (err) {
    return NextResponse.json(
      { error: "Couldn't load your ManyChat flows.", detail: err instanceof Error ? err.message : "error" },
      { status: 502 }
    );
  }
}
