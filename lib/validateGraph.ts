import { readFileSync } from "fs";
import { join } from "path";
import type { Graph } from "./types";

export type ValidationResult =
  | { ok: true; graph: Graph }
  | { ok: false; errors: string[] };

export function loadAndValidateGraph(filePath: string): ValidationResult {
  const raw = readFileSync(filePath, "utf-8");
  const graph: Graph = JSON.parse(raw);
  const errors: string[] = [];

  const entityIds = new Set(graph.entities.map((e) => e.id));

  const validEntityTypes = new Set(["person", "process", "system", "initiative"]);
  for (const entity of graph.entities) {
    if (!validEntityTypes.has(entity.type)) {
      errors.push(`Entity "${entity.id}" has unknown type "${entity.type}"`);
    }
  }

  const validRelTypes = new Set(["depends_on", "owns", "hands_off_to", "uses", "part_of"]);
  for (const rel of graph.relationships) {
    if (!entityIds.has(rel.source)) {
      errors.push(`Relationship "${rel.id}" source "${rel.source}" is not a known entity id`);
    }
    if (!entityIds.has(rel.target)) {
      errors.push(`Relationship "${rel.id}" target "${rel.target}" is not a known entity id`);
    }
    if (!validRelTypes.has(rel.type)) {
      errors.push(`Relationship "${rel.id}" has unknown type "${rel.type}"`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, graph };
}

// Run directly: npx tsx lib/validateGraph.ts
if (process.argv[1]?.endsWith("validateGraph.ts") || process.argv[1]?.endsWith("validateGraph.js")) {
  const seedPath = join(process.cwd(), "seed", "graph.json");
  const result = loadAndValidateGraph(seedPath);

  if (!result.ok) {
    console.error("Validation FAILED:");
    result.errors.forEach((e) => console.error(" ", e));
    process.exit(1);
  }

  const { graph } = result;
  console.log("Validation PASSED");
  console.log(`  Entities:      ${graph.entities.length}`);
  console.log(`  Relationships: ${graph.relationships.length}`);

  const byType = graph.entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log("  By type:", byType);
}
