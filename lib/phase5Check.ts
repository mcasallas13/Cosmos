import { loadSeedSessions } from "./sessions";
import type { Graph, Session } from "./types";

// Mirror components/AtlasApp.tsx sessionToTranscript so this test exercises the
// exact payload the "Generate process map" button sends.
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

async function main() {
  const sessions = loadSeedSessions();
  const transcripts = sessions.map(sessionToTranscript);

  const res = await fetch("http://localhost:3000/api/gemini/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcripts }),
  });
  const graph = (await res.json()) as Graph;
  if (!res.ok) {
    console.error("Extraction failed:", graph);
    process.exit(1);
  }

  const persons = graph.entities.filter((e) => e.type === "person");
  console.log(`Entities: ${graph.entities.length}, Relationships: ${graph.relationships.length}`);
  console.log("\nPersons:");
  for (const p of persons) {
    console.log(`  ${p.name}  role="${p.attributes?.role ?? "—"}" team="${p.attributes?.team ?? "—"}"`);
  }

  // Find the eligibility-verification process and its initiative links.
  const proc = graph.entities.find(
    (e) => e.type === "process" && /eligib/i.test(e.name)
  );
  const initiatives = graph.entities.filter((e) => e.type === "initiative");
  console.log(`\nInitiatives: ${initiatives.map((i) => i.name).join(", ")}`);

  let linkedInits = new Set<string>();
  let owner: string | null = null;
  let system: string | null = null;
  if (proc) {
    for (const r of graph.relationships) {
      const touches = r.source === proc.id || r.target === proc.id;
      if (!touches) continue;
      const other = r.source === proc.id ? r.target : r.source;
      const otherEnt = graph.entities.find((e) => e.id === other);
      if (!otherEnt) continue;
      if (otherEnt.type === "initiative") linkedInits.add(otherEnt.name);
      if (otherEnt.type === "person" && r.type === "owns") owner = otherEnt.name;
      if (otherEnt.type === "system" && r.type === "uses") system = otherEnt.name;
    }
  }

  console.log(`\nEligibility process: ${proc ? proc.name : "NOT FOUND"}`);
  console.log(`  linked initiatives: ${[...linkedInits].join(", ") || "none"}`);
  console.log(`  owner: ${owner ?? "—"}`);
  console.log(`  system: ${system ?? "—"}`);

  const everyoneIsPerson = sessions.every((s) =>
    persons.some((p) => p.name.toLowerCase().includes(s.participant.name.split(" ")[0].toLowerCase()))
  );
  const crossover = linkedInits.size >= 2;
  const pass = everyoneIsPerson && crossover;
  console.log(`\nAcceptance: ${pass ? "PASS" : "FAIL"}  (SMEs as persons: ${everyoneIsPerson}, crossover: ${crossover})`);
  if (!pass) process.exit(1);
}

main();
