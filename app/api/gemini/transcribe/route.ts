import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/gemini";

// Accepts a raw audio clip in the request body and returns its transcription.
// The Gemini key stays server-side; the browser only ever sends/receives bytes.
export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Empty audio body" }, { status: 400 });
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
