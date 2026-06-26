import { readFileSync } from "fs";
import { join } from "path";
import { loadSeedSessions } from "./sessions";
import { loadAndValidateGraph } from "./validateGraph";
import type { Insight } from "./types";

const seedDir = join(process.cwd(), "seed");

console.log("── Phase 1 acceptance ─────────────────────────────");

// 1. Seed sessions
const sessions = loadSeedSessions(seedDir);
console.log(`\nSeed sessions (${sessions.length}):`);
for (const s of sessions) {
  console.log(
    `  ${s.participant.name} / ${s.participant.role}  —  ` +
      `${s.turns.length} turns, ${s.durationSec}s, ${s.date}  ->  status "${s.status}"`
  );
}
const allReady = sessions.length === 3 && sessions.every((s) => s.status === "ready");
const allIdentified = sessions.every(
  (s) => s.participant.name.length > 0 && s.participant.role.length > 0
);

// 2. Graph validation
const graphResult = loadAndValidateGraph(join(seedDir, "graph.json"));
if (!graphResult.ok) {
  console.error("\nGraph validation FAILED:");
  graphResult.errors.forEach((e) => console.error("  ", e));
  process.exit(1);
}
const { graph } = graphResult;
console.log(`\nGraph: ${graph.entities.length} entities, ${graph.relationships.length} relationships`);

// 3. Expected insight loads as an Insight
const expected = JSON.parse(
  readFileSync(join(seedDir, "expected-insight.json"), "utf-8")
) as Insight;
console.log(`Expected insight: "${expected.title}" (${expected.type})`);

// Acceptance gate
const graphOk = graph.entities.length === 17 && graph.relationships.length === 28;
const pass = allReady && allIdentified && graphOk;
console.log(`\nAcceptance: ${pass ? "PASS" : "FAIL"}`);
if (!pass) process.exit(1);
