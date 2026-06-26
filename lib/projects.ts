import type { Analysis, Graph, Project, ProjectStatus, Session } from "./types";

// The prepared K-12 workspace is the demo-safe default. It is never persisted
// to the project store — it is always reconstructed from the seed graph,
// prepared analysis, and seed sessions so the existing demo stays intact.
export const K12_PROJECT_ID = "proj-k12-recruiting";

// Protected projects cannot be deleted. The seeded K-12 workspace is the hero
// demo, so it is guarded everywhere a delete is offered (UI and API).
export function isProtectedProject(id: string): boolean {
  return id === K12_PROJECT_ID;
}

// Status follows how far the pipeline has filled in. analysis ⇒ analyzed,
// a generated graph ⇒ mapped, at least one captured session ⇒ captured.
export function deriveProjectStatus(opts: {
  sessionCount: number;
  graph?: Graph;
  analysis?: Analysis;
}): ProjectStatus {
  if (opts.analysis) return "analyzed";
  if (opts.graph) return "mapped";
  if (opts.sessionCount > 0) return "captured";
  return "empty";
}

// Sessions a project owns. Saved sessions carry an explicit projectId; legacy /
// seed sessions without one belong to the default K-12 workspace.
export function sessionsForProject(
  projectId: string,
  saved: Session[],
  seed: Session[]
): Session[] {
  const own = saved.filter((s) => (s.projectId ?? K12_PROJECT_ID) === projectId);
  return projectId === K12_PROJECT_ID ? [...own, ...seed] : own;
}
