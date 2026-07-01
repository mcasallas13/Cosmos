import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import type { Graph } from "@/lib/types";

// Validate that every relationship source/target resolves to a real entity id.
// Returns a list of human-readable errors (empty when the graph is sound).
export function validateRefs(graph: Graph): string[] {
  const ids = new Set(graph.entities.map((e) => e.id));
  const errors: string[] = [];
  for (const r of graph.relationships) {
    if (!ids.has(r.source)) errors.push(`Rel ${r.id}: unknown source "${r.source}"`);
    if (!ids.has(r.target)) errors.push(`Rel ${r.id}: unknown target "${r.target}"`);
  }
  return errors;
}

// Gemini structured-output schema mirroring the `Graph` type (lib/types.ts).
// Passed as `responseSchema` on the extraction call so the model returns a
// well-formed graph deterministically instead of prose/fenced JSON. `attributes`
// is an open string map in the type; here it is modelled as an object with the
// keys the UI actually reads (role/title/team/hoursPerWeek) — structured output
// only emits declared keys, and these are the ones metaFor/describeEntity use.
export const GRAPH_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    entities: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["person", "process", "system", "initiative"],
          },
          name: { type: SchemaType.STRING },
          attributes: {
            type: SchemaType.OBJECT,
            nullable: true,
            properties: {
              role: { type: SchemaType.STRING, nullable: true },
              title: { type: SchemaType.STRING, nullable: true },
              team: { type: SchemaType.STRING, nullable: true },
              hoursPerWeek: { type: SchemaType.STRING, nullable: true },
            },
          },
        },
        required: ["id", "type", "name"],
      },
    },
    relationships: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          source: { type: SchemaType.STRING },
          target: { type: SchemaType.STRING },
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["depends_on", "owns", "hands_off_to", "uses", "part_of"],
          },
          label: { type: SchemaType.STRING, nullable: true },
        },
        required: ["id", "source", "target", "type"],
      },
    },
  },
  required: ["entities", "relationships"],
};
