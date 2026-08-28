import { NextResponse, type NextRequest } from "next/server";
import { resolveChatbotAccess, ownerScope } from "@/lib/chatbot-access";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/chatbots/[id]/webhook-secret
 * Rotate the per-chatbot webhook secret. Generates a new 24-byte hex token
 * (matching the DB default's encode(gen_random_bytes(24),'hex') format),
 * persists it, and returns it to the owner so they can copy it into ManyChat.
 *
 * This is the only method that returns a secret value - intentionally, because
 * the owner must copy the new secret into ManyChat immediately after rotation.
 */

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth
  const access = await resolveChatbotAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Ownership check - ownerScope adds the user_id filter for a non-superadmin; a
  // superadmin from /admin matches by id alone. RLS/service still enforces access.
  const { data: chatbot, error: ownershipError } = await ownerScope(
    access.db.from("chatbots").select("id").eq("id", id),
    access
  ).maybeSingle();
  if (ownershipError) return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  if (!chatbot) {
    return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
  }

  // Generate new secret: 24 random bytes as hex = 48 hex chars
  // Matches the DB column default: encode(gen_random_bytes(24), 'hex')
  const webhookSecret = randomBytes(24).toString("hex");

  // Persist
  const { error } = await ownerScope(
    access.db.from("chatbots").update({ webhook_secret: webhookSecret }).eq("id", id),
    access
  );
  if (error) {
    return NextResponse.json({ error: "Failed to rotate the webhook secret." }, { status: 500 });
  }

  // Return the new secret - the owner must copy it into ManyChat
  return NextResponse.json({ ok: true, webhook_secret: webhookSecret });
}
