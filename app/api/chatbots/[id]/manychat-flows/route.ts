import { NextResponse, type NextRequest } from "next/server";
import { resolveChatbotAccess, ownerScope } from "@/lib/chatbot-access";
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

  const access = await resolveChatbotAccess(); // owner (incl. view-as) OR superadmin from /admin
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ownerScope adds the user_id filter for a non-superadmin; a superadmin's service
  // client matches by id alone. Both give a clean 404 when the bot isn't accessible.
  const { data: chatbot, error } = await ownerScope(
    access.db.from("chatbots").select("id, manychat_api_key_enc").eq("id", id),
    access
  ).maybeSingle();
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
