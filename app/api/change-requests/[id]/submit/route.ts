import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { ChangeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: cr } = await supabase
    .from("change_requests")
    .select("id, status, transcript")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cr) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const row = cr as Pick<ChangeRequest, "id" | "status" | "transcript">;

  if (row.status !== "draft") {
    return NextResponse.json({ error: "This request was already submitted." }, { status: 400 });
  }
  if (!row.transcript || row.transcript.length === 0) {
    return NextResponse.json({ error: "Add a message before submitting." }, { status: 400 });
  }

  const { error } = await supabase
    .from("change_requests")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not submit your request." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
