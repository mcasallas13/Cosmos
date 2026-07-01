import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import type { Graph, Entity, Insight, Analysis } from "@/lib/types";
import { ANALYSIS_SYSTEM } from "@/lib/prompts";
import { computeFinancialImpact, FINANCE_INPUTS } from "@/lib/finance";
import {
  generateWithFallback,
  stripFences,
  isValidSessionId,
  MalformedModelOutputError,
  geminiErrorResponse,
} from "@/lib/gemini";
import { writeFileAtomic } from "@/lib/atomicWrite";
import { validateRefs } from "@/lib/graph";
import { MAX_ENTITIES, MAX_RELATIONSHIPS } from "@/lib/limits";
import { K12_PROJECT_ID } from "@/lib/projects";

type Crossover = {
  shared: Entity;
  initiatives: Entity[];
  owners: Entity[];   // persons who own the shared entity
  systems: Entity[];  // systems the shared entity uses
};

// Deterministically find entities connected to 2+ initiatives.
function findCrossovers(graph: Graph): Crossover[] {
  const byId = new Map(graph.entities.map((e) => [e.id, e]));
  const initiativeIds = new Set(
    graph.entities.filter((e) => e.type === "initiative").map((e) => e.id)
  );

  // For every non-initiative entity, collect which initiatives it touches.
  const entityToInits = new Map<string, Set<string>>();
  for (const r of graph.relationships) {
    if (initiativeIds.has(r.target) && !initiativeIds.has(r.source)) {
      const s = entityToInits.get(r.source) ?? new Set();
      s.add(r.target);
      entityToInits.set(r.source, s);
    }
    if (initiativeIds.has(r.source) && !initiativeIds.has(r.target)) {
      const s = entityToInits.get(r.target) ?? new Set();
      s.add(r.source);
      entityToInits.set(r.target, s);
    }
  }

  const crossovers: Crossover[] = [];
  for (const [entityId, initSet] of entityToInits) {
    if (initSet.size < 2) continue;
    const shared = byId.get(entityId);
    if (!shared) continue;

    const owners = graph.relationships
      .filter((r) => r.target === entityId && r.type === "owns")
      .map((r) => byId.get(r.source))
      .filter((e): e is Entity => !!e);

    const systems = graph.relationships
      .filter((r) => r.source === entityId && r.type === "uses")
      .map((r) => byId.get(r.target))
      .filter((e): e is Entity => !!e);

    crossovers.push({
      shared,
      initiatives: [...initSet].map((id) => byId.get(id)!).filter(Boolean),
      owners,
      systems,
    });
  }

  // Processes are more valuable crossovers than persons or systems.
  const typePriority: Record<string, number> = { process: 0, person: 1, system: 2, initiative: 3 };
  crossovers.sort((a, b) => (typePriority[a.shared.type] ?? 3) - (typePriority[b.shared.type] ?? 3));
  return crossovers;
}

// Enumerate each initiative and the processes connected to it, so the model's
// processSummary reliably covers BOTH flows rather than just the richest one.
function describeFlows(graph: Graph): string {
  const byId = new Map(graph.entities.map((e) => [e.id, e]));
  const initiatives = graph.entities.filter((e) => e.type === "initiative");
  if (initiatives.length === 0) return "(no initiatives detected)";

  return initiatives
    .map((init) => {
      const connectedIds = new Set<string>();
      for (const r of graph.relationships) {
        if (r.source === init.id) connectedIds.add(r.target);
        if (r.target === init.id) connectedIds.add(r.source);
      }
      const steps = [...connectedIds]
        .map((id) => byId.get(id))
        .filter((e): e is Entity => !!e && e.type === "process")
        .map((e) => e.name);
      return `- ${init.name}: ${steps.length ? steps.join(" → ") : "(steps not detailed)"}`;
    })
    .join("\n");
}

function buildPrompt(graph: Graph): string {
  const crossovers = findCrossovers(graph);

  const graphJson = JSON.stringify(graph, null, 2);
  const flows = describeFlows(graph);

  if (crossovers.length === 0) {
    return `Graph:\n${graphJson}\n\nINITIATIVE FLOWS (describe BOTH in processSummary):\n${flows}\n\nNo crossovers were detected. Find the single highest-value insight.`;
  }

  const best = crossovers[0];
  const nameOf = (e: Entity) => `"${e.name}" (id: ${e.id})`;
  const initiativeList = best.initiatives.map(nameOf).join(", ");
  const ownerList = best.owners.length ? `\n- Owner(s): ${best.owners.map(nameOf).join(", ")}` : "";
  const systemList = best.systems.length ? `\n- System(s) used: ${best.systems.map(nameOf).join(", ")}` : "";

  // entitiesInvolved hint — all relevant ids for the insight panel and map highlighting
  const involvedIds = [
    ...best.initiatives.map((e) => e.id),
    best.shared.id,
    ...best.owners.map((e) => e.id),
    ...best.systems.map((e) => e.id),
  ];

  const fi = computeFinancialImpact();
  const hoursPerWeek = (FINANCE_INPUTS.applicationsPerWeek * FINANCE_INPUTS.minutesPerApplication) / 60;

  return `Graph:
${graphJson}

INITIATIVE FLOWS (describe BOTH end to end in processSummary):
${flows}

PRE-ANALYSIS — CROSSOVER DETECTED:
- Shared entity: ${nameOf(best.shared)} (type: ${best.shared.type})
- Connected to ${best.initiatives.length} initiatives: ${initiativeList}${ownerList}${systemList}

Your insight MUST report this crossover.
Set entitiesInvolved to exactly: ${JSON.stringify(involvedIds)}

Financial model (use these exact numbers — do not change them):
- ${FINANCE_INPUTS.applicationsPerWeek} applications/week pass through the shared step
- ${FINANCE_INPUTS.minutesPerApplication} minutes of manual review per application = ${hoursPerWeek.toFixed(0)} hours/week
- Fully loaded coordinator cost: $${FINANCE_INPUTS.hourlyRateFullyLoaded}/hour × ${FINANCE_INPUTS.activeWeeksPerYear} weeks = $${fi.value.toLocaleString()}/year`;
}

type EntityAttributes = Record<string, Record<string, string>>;

async function callGemini(
  prompt: string
): Promise<{ processSummary: string; insight: Insight; entityAttributes?: EntityAttributes }> {
  const raw = await generateWithFallback(ANALYSIS_SYSTEM, prompt);
  try {
    return JSON.parse(stripFences(raw)) as {
      processSummary: string;
      insight: Insight;
      entityAttributes?: EntityAttributes;
    };
  } catch {
    throw new MalformedModelOutputError();
  }
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }
  try {
    const { graph, sessionId, projectId } = await request.json() as {
      graph: Graph;
      sessionId?: string;
      projectId?: string;
    };

    if (!graph || !Array.isArray(graph.entities) || !Array.isArray(graph.relationships)) {
      return NextResponse.json({ error: "Invalid graph: expected { entities[], relationships[] }" }, { status: 400 });
    }
    if (graph.entities.length > MAX_ENTITIES || graph.relationships.length > MAX_RELATIONSHIPS) {
      return NextResponse.json(
        { error: `Graph too large (max ${MAX_ENTITIES} entities, ${MAX_RELATIONSHIPS} relationships)` },
        { status: 413 }
      );
    }

    const refErrors = validateRefs(graph);
    if (refErrors.length > 0) {
      return NextResponse.json({ error: "Reference validation failed", errors: refErrors }, { status: 422 });
    }

    const prompt = buildPrompt(graph);
    const { processSummary, insight: hero, entityAttributes: modelAttrs } = await callGemini(prompt);
    hero.financialImpact = computeFinancialImpact();

    // Deterministically guarantee the shared crossover step carries hoursPerWeek
    // (the same basis as the financial model), then layer the model's estimates
    // for the other processes on top.
    const crossovers = findCrossovers(graph);
    const sharedHours = String(
      Math.round((FINANCE_INPUTS.applicationsPerWeek * FINANCE_INPUTS.minutesPerApplication) / 60)
    );
    const entityAttributes: EntityAttributes = { ...(modelAttrs ?? {}) };
    if (crossovers[0]) {
      entityAttributes[crossovers[0].shared.id] = {
        ...(entityAttributes[crossovers[0].shared.id] ?? {}),
        hoursPerWeek: sharedHours,
      };
    }

    // The secondary human-review finding is specific to the seed K-12 scenario
    // (it references proc-award / proc-payment). Append it only when the graph
    // actually contains the entities it points at — so an unrelated user project
    // never gets this phantom review bolted onto its analysis.
    const secondary = JSON.parse(
      readFileSync(join(process.cwd(), "seed", "secondary-insight-review.json"), "utf-8")
    ) as Insight;
    const graphIds = new Set(graph.entities.map((e) => e.id));
    const secondaryMatchesGraph = secondary.entitiesInvolved.every((id) => graphIds.has(id));
    const insights = secondaryMatchesGraph ? [hero, secondary] : [hero];

    const analysis: Analysis = { processSummary, insights, entityAttributes };
    // `latest-analysis.json` is the prepared-demo artifact. Writing it on every
    // user-project analyze would clobber the shared file, so scope it: only the
    // K-12/prepared default (no projectId, or the reserved id) touches it. User
    // projects persist their analysis inside their own project JSON instead.
    if (!projectId || projectId === K12_PROJECT_ID) {
      writeFileAtomic(join(process.cwd(), "seed", "latest-analysis.json"), JSON.stringify(analysis, null, 2));
    }
    if (sessionId && isValidSessionId(sessionId)) {
      const dir = join(process.cwd(), "seed", "sessions");
      writeFileAtomic(join(dir, `${sessionId}-analysis.json`), JSON.stringify(analysis, null, 2));
    }
    return NextResponse.json(analysis);
  } catch (err) {
    const { status, body } = geminiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
