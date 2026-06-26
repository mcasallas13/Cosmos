import { readFileSync } from "fs";
import { join } from "path";
import type { Graph, Insight } from "@/lib/types";
import { computeFinancialImpact } from "@/lib/finance";
import { loadSeedSessions } from "@/lib/sessions";
import AtlasApp from "@/components/AtlasApp";

export default function Home() {
  const graph: Graph = JSON.parse(
    readFileSync(join(process.cwd(), "seed", "graph.json"), "utf-8")
  );

  const hero = JSON.parse(
    readFileSync(join(process.cwd(), "seed", "expected-insight.json"), "utf-8")
  ) as Insight;
  hero.financialImpact = computeFinancialImpact();

  const secondary = JSON.parse(
    readFileSync(join(process.cwd(), "seed", "secondary-insight-review.json"), "utf-8")
  ) as Insight;

  const preparedProcessSummary = readFileSync(
    join(process.cwd(), "seed", "expected-process-summary.md"),
    "utf-8"
  ).trim();

  const seedSessions = loadSeedSessions();

  return (
    <AtlasApp
      graph={graph}
      preparedInsights={[hero, secondary]}
      preparedProcessSummary={preparedProcessSummary}
      seedSessions={seedSessions}
    />
  );
}
