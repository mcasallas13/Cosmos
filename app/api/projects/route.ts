import { NextRequest, NextResponse } from "next/server";
import { deleteProject, listSavedProjects, saveProject } from "@/lib/projectStore";
import { deleteSessionsForProject } from "@/lib/sessionStore";
import { isProtectedProject, K12_PROJECT_ID } from "@/lib/projects";
import type { Project } from "@/lib/types";

const ID_RE = /^[a-z0-9-]+$/i;

// GET: list every user-created project, newest first. The default K-12
// workspace is rebuilt from seed on the page, so it is not listed here.
export async function GET() {
  return NextResponse.json(listSavedProjects());
}

// POST: upsert a project (create, or update its graph / analysis / status as the
// pipeline fills in). The prepared K-12 workspace is never persisted.
export async function POST(request: NextRequest) {
  let body: Partial<Project>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, name } = body;
  if (!id || !ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  if (id === K12_PROJECT_ID) {
    return NextResponse.json(
      { error: "The K-12 workspace is seeded and cannot be persisted" },
      { status: 400 }
    );
  }
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Missing project name" }, { status: 400 });
  }

  const project: Project = {
    id,
    name: name.trim(),
    lineOfBusiness: (body.lineOfBusiness ?? "").trim(),
    description: body.description?.trim() || undefined,
    createdAt: body.createdAt ?? new Date().toISOString(),
    sessionIds: body.sessionIds ?? [],
    graph: body.graph,
    analysis: body.analysis,
    status: body.status ?? "empty",
  };

  saveProject(project);
  return NextResponse.json({ ok: true, project });
}

// DELETE: remove a user project (?id=…) along with the saved sessions scoped to
// it. The project's graph/analysis live in its file, so they go with it. The
// seeded K-12 workspace is protected and can never be deleted.
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  if (isProtectedProject(id)) {
    return NextResponse.json(
      { error: "The K-12 workspace is seeded and cannot be deleted" },
      { status: 400 }
    );
  }

  const removedSessionIds = deleteSessionsForProject(id);
  deleteProject(id);
  return NextResponse.json({ ok: true, removedSessionIds });
}
