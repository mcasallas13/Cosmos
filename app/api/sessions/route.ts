import { NextRequest, NextResponse } from "next/server";
import { isValidSessionId } from "@/lib/gemini";
import { computeSessionStatus } from "@/lib/sessions";
import { deleteSession, listSavedSessions, saveSession } from "@/lib/sessionStore";
import type { Session } from "@/lib/types";

// GET: list saved interview sessions, newest first. Pass ?projectId=… to scope
// to one workspace; otherwise every saved session is returned (the client
// buckets them by projectId).
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const sessions = listSavedSessions();
  return NextResponse.json(
    projectId ? sessions.filter((s) => s.projectId === projectId) : sessions
  );
}

// POST: persist a session captured in the Live interview view. Identity and
// transcript come from the client; the status is (re)computed server-side.
export async function POST(request: NextRequest) {
  let body: Partial<Session>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, participant, turns } = body;
  if (!id || !isValidSessionId(id)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }
  if (!participant || !Array.isArray(turns)) {
    return NextResponse.json(
      { error: "Missing participant or turns" },
      { status: 400 }
    );
  }

  const session: Session = {
    id,
    participant,
    date: body.date ?? new Date().toISOString().slice(0, 10),
    durationSec: body.durationSec ?? 0,
    status: computeSessionStatus(participant, turns),
    turns,
    parentSessionId: body.parentSessionId,
    projectId: body.projectId,
  };

  saveSession(session);
  return NextResponse.json({ ok: true, session });
}

// DELETE: remove a live-captured session by ?id=…. Seeded demo sessions live in
// transcript files (id prefix "seed-"), not the saved store, so they are
// rejected here and can never be deleted.
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !isValidSessionId(id)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }
  if (id.startsWith("seed-")) {
    return NextResponse.json(
      { error: "Seeded sessions cannot be deleted" },
      { status: 400 }
    );
  }
  const deleted = deleteSession(id);
  return NextResponse.json({ ok: true, deleted });
}
