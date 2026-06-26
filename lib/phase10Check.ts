import { readFileSync } from "fs";
import { join } from "path";
import type { Graph } from "./types";
import { describeEntity, type EntityDetail } from "./entityDetail";

// Phase 10 acceptance — node detail cards derived from the prepared graph:
//  - Maria: owns the eligibility step, multiple handoffs, HIGH risk score
//  - Eligibility Verification: BOTH initiatives depend on it
// Runs offline against seed/graph.json (no dev server, no Gemini).

const graph: Graph = JSON.parse(
  readFileSync(join(process.cwd(), "seed", "graph.json"), "utf-8")
);

function show(id: string): EntityDetail {
  const d = describeEntity(graph, id);
  if (!d) throw new Error(`No entity "${id}" in graph`);
  console.log(`\n── ${d.kind.toUpperCase()} card · ${d.name} ───────────────`);
  console.log(JSON.stringify(d, null, 2));
  return d;
}

const maria = show("person-maria");
const elig = show("proc-eligibility");

const checks: Array<[string, boolean]> = [];
if (maria.kind === "person") {
  checks.push(["Maria owns the eligibility step", maria.processesOwned.includes("Eligibility Verification")]);
  checks.push(["Maria is part of multiple handoffs", maria.handoffCount >= 2]);
  checks.push(["Maria has a HIGH risk score", maria.riskLevel === "High"]);
  checks.push(["Maria has a recommended action", maria.recommendedAction.length > 0]);
}
if (elig.kind === "process") {
  checks.push(["Eligibility lists 2+ initiatives", elig.initiatives.length >= 2]);
  checks.push(["Eligibility is owned by Maria", elig.owners.includes("Maria Lopez")]);
  checks.push(["Eligibility carries hoursPerWeek", elig.hoursPerWeek !== null]);
  checks.push(["Eligibility flagged as single point of failure", elig.isSpof]);
}

console.log(`\n════════════════════════════════════════`);
let pass = true;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) pass = false;
}
console.log(`\nPhase 10 acceptance: ${pass ? "PASS" : "FAIL"}`);
if (!pass) process.exit(1);
