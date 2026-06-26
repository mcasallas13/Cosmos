import { readFileSync } from "fs";
import { join } from "path";
import type { ProcessParticipant, Session, SessionStatus, TranscriptTurn } from "./types";

// "ready" when identity is complete and the transcript has at least 5 turns,
// otherwise "draft". (Spec H2)
export function computeSessionStatus(
  participant: ProcessParticipant,
  turns: TranscriptTurn[]
): SessionStatus {
  const identityComplete =
    participant.name.trim().length > 0 && participant.role.trim().length > 0;
  return identityComplete && turns.length >= 5 ? "ready" : "draft";
}

// Parse a transcript markdown file in the seed format:
//   **Participant:** <Name>, <Role>
//   **Atlas:** ...        -> speaker "atlas"
//   **<Name>:** ...       -> speaker "participant"
function parseTranscript(raw: string): {
  participant: ProcessParticipant;
  turns: TranscriptTurn[];
} {
  const lines = raw.split(/\r?\n/);

  const participantLine = lines.find((l) => l.startsWith("**Participant:**")) ?? "";
  const identity = participantLine.replace("**Participant:**", "").trim();
  const [name, ...roleParts] = identity.split(",");
  const participant: ProcessParticipant = {
    name: (name ?? "").trim(),
    role: roleParts.join(",").trim(),
  };

  const turns: TranscriptTurn[] = [];
  const turnRe = /^\*\*([^:*]+):\*\*\s*(.*)$/;
  for (const line of lines) {
    const m = line.match(turnRe);
    if (!m) continue;
    const speakerLabel = m[1].trim();
    const text = m[2].trim();
    if (speakerLabel === "Participant" || speakerLabel === "Initiative") continue;
    if (!text) continue;
    const speaker: TranscriptTurn["speaker"] =
      speakerLabel === "Atlas" ? "atlas" : "participant";
    turns.push({ speaker, text });
  }

  return { participant, turns };
}

type SeedSessionSpec = {
  id: string;
  file: string;
  date: string;
  durationSec: number;
};

const SEED_SESSIONS: SeedSessionSpec[] = [
  { id: "seed-recruiting", file: "transcript-recruiting.md", date: "2026-06-22", durationSec: 540 },
  { id: "seed-scholarship", file: "transcript-scholarship.md", date: "2026-06-23", durationSec: 600 },
  { id: "seed-enrollment", file: "transcript-enrollment.md", date: "2026-06-24", durationSec: 480 },
];

export function loadSeedSessions(seedDir = join(process.cwd(), "seed")): Session[] {
  return SEED_SESSIONS.map((spec) => {
    const raw = readFileSync(join(seedDir, spec.file), "utf-8");
    const { participant, turns } = parseTranscript(raw);
    return {
      id: spec.id,
      participant,
      date: spec.date,
      durationSec: spec.durationSec,
      status: computeSessionStatus(participant, turns),
      turns,
    };
  });
}

// Run directly: npx tsx lib/sessions.ts
if (process.argv[1]?.replace(/\\/g, "/").endsWith("lib/sessions.ts")) {
  const sessions = loadSeedSessions();
  console.log("Seed sessions:");
  for (const s of sessions) {
    console.log(
      `  ${s.id}: ${s.participant.name} / ${s.participant.role} — ` +
        `${s.turns.length} turns -> status "${s.status}"`
    );
  }
}
