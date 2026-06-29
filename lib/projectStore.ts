import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import type { Project } from "./types";
import { writeFileAtomic } from "./atomicWrite";

// Parse one store file, returning null (instead of throwing) on corruption so a
// single bad file never breaks the whole project list.
function readJsonSafe<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    console.warn(`[projectStore] skipping unreadable file: ${path}`);
    return null;
  }
}

// User-created projects live as one JSON file per project — the same
// hackathon-local stand-in for Firestore used by the session store. The default
// K-12 workspace is NOT stored here; it is rebuilt from seed on every load.
const STORE_DIR = join(process.cwd(), "seed", "projects");

function ensureDir() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

export function saveProject(project: Project): void {
  ensureDir();
  writeFileAtomic(
    join(STORE_DIR, `${project.id}.json`),
    JSON.stringify(project, null, 2)
  );
}

export function listSavedProjects(): Project[] {
  if (!existsSync(STORE_DIR)) return [];
  return readdirSync(STORE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJsonSafe<Project>(join(STORE_DIR, f)))
    .filter((p): p is Project => p !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
}

// Remove a user project's file. No-op if it was never persisted (e.g. a project
// created and deleted in the same session). The project's graph and analysis
// live inside this file, so deleting it removes them too.
export function deleteProject(id: string): void {
  const file = join(STORE_DIR, `${id}.json`);
  if (existsSync(file)) unlinkSync(file);
}
