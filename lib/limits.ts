// Request-size limits for the API routes. Centralised so the caps are easy to
// audit and tune in one place. These guard against accidental quota burn and
// runaway payloads (a hung mic, a giant transcript paste, a malformed graph).

// Audio clip sent to /api/gemini/transcribe (raw bytes). ~8 MB ≈ several minutes
// of webm/opus, well above a single interview answer.
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

// /api/gemini/extract — transcripts array.
export const MAX_TRANSCRIPTS = 25;
export const MAX_TRANSCRIPT_TOTAL_CHARS = 200_000;

// /api/gemini/analyze — graph size.
export const MAX_ENTITIES = 300;
export const MAX_RELATIONSHIPS = 600;
