import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper's per-file limit

/**
 * POST /api/transcribe
 * Audio (FormData "audio") -> text via OpenAI Whisper. Used by the request-chat
 * composer's mic button; the transcribed text is dropped into the input for the
 * client to edit before sending. Audio is not persisted.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid audio upload." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No audio provided." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording is too long." }, { status: 400 });
  }

  try {
    const text = await transcribeAudio(audio, audio.name || "audio.webm");
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    console.error("[transcribe] failed", err);
    return NextResponse.json({ error: "Could not transcribe the audio." }, { status: 502 });
  }
}
