import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { validateManychatApiKey } from "@/lib/manychat";

export const runtime = "nodejs";

/**
 * PUT /api/chatbots/[id]/manychat-key
 * Validate a ManyChat API key, encrypt it, and store it for this chatbot.
 * The plaintext key and its ciphertext are NEVER returned to the client.
 *
 * DELETE /api/chatbots/[id]/manychat-key
 * Clear the stored API key (sets column to NULL - not ""), reverting the
 * chatbot to the env-level fallback. NULL, not empty string, keeps the
 * resolver's hard-fail correct.
 */

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Parse body - reject empty / missing key immediately
  const body = await request.json().catch(() => null);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return NextResponse.json({ error: "API key is required." }, { status: 400 });
  }

  // Ownership check - RLS also enforces this; the explicit filter gives a clean 404
  const supabase = await createClient();
  const { data: chatbot, error: ownershipError } = await supabase
    .from("chatbots")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (ownershipError) return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  if (!chatbot) {
    return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
  }

  // Validate the key against ManyChat before storing
  const result = await validateManychatApiKey(apiKey);
  if (!result.ok) {
    console.warn("[manychat-key] ManyChat validation failed", result.error);
    return NextResponse.json(
      { error: "That ManyChat API key didn't work.", detail: result.error },
      { status: 400 }
    );
  }

  // Encrypt - guard so a missing master key gives a clear server error
  let enc: string;
  try {
    enc = encryptSecret(apiKey);
  } catch {
    return NextResponse.json(
      { error: "Server encryption key is not configured. Contact support." },
      { status: 500 }
    );
  }

  // Store - key and ciphertext never leave the server
  const { error } = await supabase
    .from("chatbots")
    .update({ manychat_api_key_enc: enc })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Failed to save the API key." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pageName: result.pageName ?? null });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Ownership check
  const supabase = await createClient();
  const { data: chatbot, error: ownershipError } = await supabase
    .from("chatbots")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (ownershipError) return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  if (!chatbot) {
    return NextResponse.json({ error: "Chatbot not found." }, { status: 404 });
  }

  // Clear - NULL (not "") so the resolver treats it as "not set"
  const { error } = await supabase
    .from("chatbots")
    .update({ manychat_api_key_enc: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Failed to clear the API key." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
