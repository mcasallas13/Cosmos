import { renameSync, writeFileSync } from "fs";

// Write a file atomically: write to a unique temp file in the same directory,
// then rename over the target. rename(2) is atomic on the same filesystem, so a
// reader never observes a half-written file and a crash mid-write leaves the
// previous version intact. Replaces bare writeFileSync for the local JSON
// "Firestore stand-in" stores, where concurrent requests could otherwise
// interleave and clobber a file.
export function writeFileAtomic(path: string, data: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, data, "utf-8");
  renameSync(tmp, path);
}
