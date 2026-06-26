import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { Project } from "./types";

// User-created projects live as one JSON file per project — the same
// hackathon-local stand-in for Firestore used by the session store. The default
// K-12 workspace is NOT stored here; it is rebuilt from seed on every load.
const STORE_DIR = join(process.cwd(), "seed", "projects");

function ensureDir() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

export function saveProject(project: Project): void {
  ensureDir();
  writeFileSync(
    join(STORE_DIR, `${project.id}.json`),
    JSON.stringify(project, null, 2),
    "utf-8"
  );
}

export function listSavedProjects(): Project[] {
  if (!existsSync(STORE_DIR)) return [];
  return readdirSync(STORE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(STORE_DIR, f), "utf-8")) as Project)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
}

// Remove a user project's file. No-op if it was never persisted (e.g. a project
// created and deleted in the same session). The project's graph and analysis
// live inside this file, so deleting it removes them too.
export function deleteProject(id: string): void {
  const file = join(STORE_DIR, `${id}.json`);
  if (existsSync(file)) unlinkSync(file);
}
