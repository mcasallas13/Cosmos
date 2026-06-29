import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/gemini";
import { MAX_AUDIO_BYTES } from "@/lib/limits";

// Accepts a raw audio clip in the request body and returns its transcription.
// The Gemini key stays server-side; the browser only ever sends/receives bytes.
export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  // Reject oversized clips before buffering when the client declares a length,
  // and again after reading in case the header lied or was absent.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio too large (max ${MAX_AUDIO_BYTES} bytes)` },
      { status: 413 }
    );
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Empty audio body" }, { status: 400 });
  }
  if (buf.length > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio too large (max ${MAX_AUDIO_BYTES} bytes)` },
      { status: 413 }
    );
  }

  const mimeType = request.headers.get("content-type") || "audio/webm";
  const base64 = buf.toString("base64");

  try {
    const text = await transcribeAudio(base64, mimeType);
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
