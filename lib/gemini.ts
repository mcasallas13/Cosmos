import { GoogleGenerativeAI } from "@google/generative-ai";

// Shared model fallback chain. The first model is the default; later ones are
// tried only when an earlier one returns a retryable error (see shouldFallback).
export const GEMINI_MODELS = [
  process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// Whether to fall back to the next model in GEMINI_MODELS. We advance on 503
// (model overloaded) and on 429 (quota/rate-limit exceeded). Free-tier quota is
// per-model-per-day, so a 429 on one model can succeed on the next one in the
// chain — falling back keeps the demo working once a model's daily cap is hit.
function shouldFallback(err: Error): boolean {
  return err.message.includes("503") || err.message.includes("429");
}

// Strip markdown fences / surrounding prose from a model response, leaving JSON.
export function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return text.trim();
}

// Run a single-prompt generation, falling back through GEMINI_MODELS on a
// retryable error (model overloaded / quota exceeded — see shouldFallback).
export async function generateWithFallback(
  systemInstruction: string,
  prompt: string
): Promise<string> {
  let last: Error = new Error("No models available");
  for (const model of GEMINI_MODELS) {
    try {
      const m = genAI.getGenerativeModel({ model, systemInstruction });
      const result = await m.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
      if (!shouldFallback(last)) throw last;
    }
  }
  throw last;
}

// Transcribe a spoken audio clip to plain text, falling back through
// GEMINI_MODELS on a retryable error (see shouldFallback). Clip is inline base64.
export async function transcribeAudio(
  base64Audio: string,
  mimeType: string
): Promise<string> {
  const instruction =
    "You are a speech-to-text transcriber. Transcribe the spoken audio to plain " +
    "text verbatim. Return only the transcription, with no commentary, labels, or " +
    "quotation marks. If the audio contains no discernible speech, return an empty string.";

  let last: Error = new Error("No models available");
  for (const model of GEMINI_MODELS) {
    try {
      const m = genAI.getGenerativeModel({ model });
      const result = await m.generateContent([
        { text: instruction },
        { inlineData: { mimeType, data: base64Audio } },
      ]);
      return result.response.text().trim();
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
      if (!shouldFallback(last)) throw last;
    }
  }
  throw last;
}

// Session ids are interpolated into filesystem paths, so they must not contain
// path separators or traversal sequences. Allow only word chars and dashes.
export function isValidSessionId(id: string): boolean {
  return /^[\w-]+$/.test(id) && !id.includes("..");
}
