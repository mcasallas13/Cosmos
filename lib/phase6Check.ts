import { loadSeedSessions } from "./sessions";
import type { Analysis, Graph, Session } from "./types";

const BASE = "http://localhost:3000";

function sessionToTranscript(s: Session): string {
  const { name, role, team } = s.participant;
  const teamClause = team ? ` on the ${team} team` : "";
  const header =
    `=== Session: ${name} ===\n` +
    `SPEAKER IDENTITY — this transcript is the first-person account of ${name}, ${role}${teamClause}.\n` +
    `**Participant:** ${name}, ${role}${team ? `, ${team}` : ""}\n`;
  const body = s.turns
    .map((t) => `**${t.speaker === "atlas" ? "Atlas" : name}:** ${t.text}`)
    .join("\n\n");
  return `${header}\n${body}`;
}

// Resolve the entity ids the crossover insight must reference, from the
// generated graph (ids vary run-to-run; we match by type/name, not literals).
function expectedIds(graph: Graph) {
  const proc = graph.entities.find((e) => e.type === "process" && /eligib/i.test(e.name));
  const inits = graph.entities.filter((e) => e.type === "initiative");
  const maria = graph.entities.find((e) => e.type === "person" && /maria/i.test(e.name));
  return { proc, inits, maria };
}

async function runOnce(graph: Graph, n: number): Promise<boolean> {
  const res = await fetch(`${BASE}/api/gemini/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph }),
  });
  const analysis = (await res.json()) as Analysis;
  if (!res.ok) {
    console.log(`Run ${n}: REQUEST FAILED`, analysis);
    return false;
  }

  const summary = analysis.processSummary ?? "";
  const hero = analysis.insights.find((i) => !i.needsHumanReview);
  const { proc, inits, maria } = expectedIds(graph);

  const summaryBothFlows = /recruit/i.test(summary) && /scholarship/i.test(summary);
  const involved = new Set(hero?.entitiesInvolved ?? []);
  const hasProc = !!proc && involved.has(proc.id);
  const hasBothInits = inits.length >= 2 && inits.every((i) => involved.has(i.id));
  const hasMaria = !!maria && involved.has(maria.id);
  const mentionsEligibility = /eligib/i.test(hero?.title ?? "") || /eligib/i.test(hero?.explanation ?? "");
  const money = hero?.financialImpact?.value === 34560;
  const isCrossover = hero?.type === "crossover";
  const highConf = hero?.confidence === "high";

  const pass =
    summaryBothFlows && hasProc && hasBothInits && hasMaria &&
    mentionsEligibility && money && isCrossover && highConf;

  console.log(`\n── Run ${n} ${pass ? "PASS" : "FAIL"} ─────────────────────────`);
  console.log(`  processSummary: ${summary.slice(0, 150)}${summary.length > 150 ? "…" : ""}`);
  console.log(`    both flows named: ${summaryBothFlows}`);
  console.log(`  insight: "${hero?.title ?? "(none)"}"`);
  console.log(`    type=crossover:${isCrossover} eligibility:${mentionsEligibility} conf=high:${highConf} value=$34,560:${money}`);
  console.log(`    entitiesInvolved=${JSON.stringify(hero?.entitiesInvolved ?? [])}`);
  console.log(`    has[eligibilityProc:${hasProc} bothInitiatives:${hasBothInits} maria:${hasMaria}]`);
  return pass;
}

async function main() {
  const transcripts = loadSeedSessions().map(sessionToTranscript);

  // Generate the graph once (the "generated graph" the acceptance refers to).
  const exRes = await fetch(`${BASE}/api/gemini/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcripts }),
  });
  const graph = (await exRes.json()) as Graph;
  if (!exRes.ok) {
    console.error("Extraction failed:", graph);
    process.exit(1);
  }
  console.log(`Generated graph: ${graph.entities.length} entities, ${graph.relationships.length} relationships`);

  let passes = 0;
  for (let n = 1; n <= 5; n++) {
    if (await runOnce(graph, n)) passes++;
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`Acceptance: ${passes}/5 runs PASS  →  ${passes === 5 ? "PASS" : "FAIL"}`);
  if (passes !== 5) process.exit(1);
}

main();
