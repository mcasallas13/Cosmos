import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import type { Graph } from "@/lib/types";
import { EXTRACTION_SYSTEM } from "@/lib/prompts";
import { generateWithFallback, stripFences, isValidSessionId } from "@/lib/gemini";

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

function validateRefs(graph: Graph): string[] {
  const ids = new Set(graph.entities.map((e) => e.id));
  const errors: string[] = [];
  for (const r of graph.relationships) {
    if (!ids.has(r.source)) errors.push(`Rel ${r.id}: unknown source "${r.source}"`);
    if (!ids.has(r.target)) errors.push(`Rel ${r.id}: unknown target "${r.target}"`);
  }
  return errors;
}

async function runExtraction(content: string): Promise<Graph> {
  const raw = await generateWithFallback(EXTRACTION_SYSTEM, content);
  return JSON.parse(stripFences(raw)) as Graph;
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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
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
    const content = Array.isArray(body.transcripts)
      ? body.transcripts.join("\n\n---\n\n")
      : String(body.transcripts ?? "");
    const graph = await runExtraction(content);
    const errors = validateRefs(graph);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Reference validation failed", errors, graph }, { status: 422 });
    }
    // Persist latest extracted graph so it can be reloaded
    writeFileSync(join(process.cwd(), "seed", "latest-graph.json"), JSON.stringify(graph, null, 2));
    // Persist to named session if a valid ID was provided
    if (sessionId && isValidSessionId(sessionId)) {
      const dir = join(process.cwd(), "seed", "sessions");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${sessionId}.md`), content);
      writeFileSync(join(dir, `${sessionId}-graph.json`), JSON.stringify(graph, null, 2));
    }
    return NextResponse.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
