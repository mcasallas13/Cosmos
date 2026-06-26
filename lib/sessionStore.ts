import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { Session } from "./types";

// Saved interview sessions live as one JSON file per session. This is the
// hackathon-local stand-in for Firestore: durable across restarts, no schema.
const STORE_DIR = join(process.cwd(), "seed", "saved-sessions");

function ensureDir() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

export function saveSession(session: Session): void {
  ensureDir();
  writeFileSync(
    join(STORE_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    "utf-8"
  );
}

export function listSavedSessions(): Session[] {
  if (!existsSync(STORE_DIR)) return [];
  return readdirSync(STORE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(STORE_DIR, f), "utf-8")) as Session)
    .sort((a, b) => (a.id < b.id ? 1 : -1)); // newest first (ids embed a timestamp)
}

// Delete a single saved session by id. Returns true if a file was removed.
// Seed sessions live in transcript files, not here, so they are never matched.
export function deleteSession(id: string): boolean {
  const file = join(STORE_DIR, `${id}.json`);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}

// Delete every saved session belonging to a project (used when a project
// workspace is deleted). Returns the ids removed. Sessions without a projectId
// belong to the default K-12 workspace and are never matched here.
export function deleteSessionsForProject(projectId: string): string[] {
  if (!existsSync(STORE_DIR)) return [];
  const removed: string[] = [];
  for (const f of readdirSync(STORE_DIR)) {
    if (!f.endsWith(".json")) continue;
    const path = join(STORE_DIR, f);
    const session = JSON.parse(readFileSync(path, "utf-8")) as Session;
    if (session.projectId === projectId) {
      unlinkSync(path);
      removed.push(session.id);
    }
  }
  return removed;
}
