import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import type { Graph } from "@/lib/types";
import { EXTRACTION_SYSTEM } from "@/lib/prompts";
import {
  generateWithFallback,
  stripFences,
  isValidSessionId,
  MalformedModelOutputError,
  geminiErrorResponse,
} from "@/lib/gemini";
import { writeFileAtomic } from "@/lib/atomicWrite";
import { validateRefs, GRAPH_RESPONSE_SCHEMA } from "@/lib/graph";
import { MAX_TRANSCRIPTS, MAX_TRANSCRIPT_TOTAL_CHARS } from "@/lib/limits";

function loadSeedTranscripts(): string {
  const seedDir = join(process.cwd(), "seed");
  const files = readdirSync(seedDir)
    .filter((f) => f.startsWith("transcript-") && (f.endsWith(".md") || f.endsWith(".txt")))
    .sort();

  if (files.length === 0) throw new Error("No transcript files found in seed/");

  return files
    .map((f) => {
      const content = readFileSync(join(seedDir, f), "utf-8");
      return `=== ${f} ===\n${content}`;
    })
    .join("\n\n");
}

async function runExtraction(content: string): Promise<Graph> {
  const raw = await generateWithFallback(EXTRACTION_SYSTEM, content, {
    responseMimeType: "application/json",
    responseSchema: GRAPH_RESPONSE_SCHEMA,
  });
  try {
    return JSON.parse(stripFences(raw)) as Graph;
  } catch {
    throw new MalformedModelOutputError();
  }
}

// GET /api/gemini/extract — runs extraction on seed transcripts
export async function GET() {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }
  try {
    const content = loadSeedTranscripts();
    const graph = await runExtraction(content);
    const errors = validateRefs(graph);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Reference validation failed", errors, graph }, { status: 422 });
    }
    return NextResponse.json(graph);
  } catch (err) {
    const { status, body } = geminiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/gemini/extract — accepts { transcripts: string[] } in body
export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }
  try {
    const body = await request.json();
    const { sessionId } = body as { sessionId?: string };

    if (!Array.isArray(body.transcripts)) {
      return NextResponse.json({ error: "transcripts must be an array of strings" }, { status: 400 });
    }
    if (body.transcripts.length === 0) {
      return NextResponse.json({ error: "No transcripts provided" }, { status: 400 });
    }
    if (body.transcripts.length > MAX_TRANSCRIPTS) {
      return NextResponse.json(
        { error: `Too many transcripts (max ${MAX_TRANSCRIPTS})` },
        { status: 413 }
      );
    }
    const transcripts = body.transcripts.map((t: unknown) => String(t ?? ""));
    const content = transcripts.join("\n\n---\n\n");
    if (content.length > MAX_TRANSCRIPT_TOTAL_CHARS) {
      return NextResponse.json(
        { error: `Transcripts too large (max ${MAX_TRANSCRIPT_TOTAL_CHARS} characters)` },
        { status: 413 }
      );
    }

    const graph = await runExtraction(content);
    const errors = validateRefs(graph);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Reference validation failed", errors, graph }, { status: 422 });
    }
    // Persist latest extracted graph so it can be reloaded
    writeFileAtomic(join(process.cwd(), "seed", "latest-graph.json"), JSON.stringify(graph, null, 2));
    // Persist to named session if a valid ID was provided
    if (sessionId && isValidSessionId(sessionId)) {
      const dir = join(process.cwd(), "seed", "sessions");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileAtomic(join(dir, `${sessionId}.md`), content);
      writeFileAtomic(join(dir, `${sessionId}-graph.json`), JSON.stringify(graph, null, 2));
    }
    return NextResponse.json(graph);
  } catch (err) {
    const { status, body } = geminiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
