"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { Analysis, Graph, Insight, Project, Session } from "@/lib/types";
import { K12_PROJECT_ID, deriveProjectStatus, isProtectedProject, sessionsForProject } from "@/lib/projects";
import InterviewCapture from "@/components/InterviewCapture";
import {
  NavRail, SessionsView, FlowStepper, NewProcessModal,
  ConfirmDeleteModal, ProcessesView, TopBar, MapView,
  sessionToTranscript, lastUpdatedLabel,
  FLOW_STEP_DEFS, INGEST_DURATION,
} from "@/components/atlas/parts";
import type { View, Theme, FlowStep, ProjectOverview } from "@/components/atlas/parts";

// ── Main app ─────────────────────────────────────────────────────────────────
export default function AtlasApp({
  graph,
  preparedInsights,
  preparedProcessSummary,
  seedSessions,
}: {
  graph: Graph;
  preparedInsights: Insight[];
  preparedProcessSummary: string;
  seedSessions: Session[];
}) {
  // Default landing is the Processes overview.
  const [view, setView] = useState<View>("processes");
  const [savedSessions, setSavedSessions] = useState<Session[]>([]);

  // Projects: the prepared K-12 workspace (rebuilt from seed, never persisted)
  // plus any user-created workspaces (persisted under seed/projects/).
  const preparedAnalysis = useMemo<Analysis>(
    () => ({ processSummary: preparedProcessSummary, insights: preparedInsights }),
    [preparedProcessSummary, preparedInsights]
  );
  const k12Project = useMemo<Project>(() => ({
    id: K12_PROJECT_ID,
    name: "K-12 Individual Recruiting",
    lineOfBusiness: "K-12 individual recruiting",
    description: "Three SME interviews across two recruiting initiatives. Generate the process map to surface where they secretly overlap.",
    createdAt: "2026-06-20T09:00:00.000Z",
    sessionIds: seedSessions.map((s) => s.id),
    graph,                    // canonical prepared graph  → overview: Map ✓
    analysis: preparedAnalysis, // canonical prepared analysis → overview: Analysis ✓
    status: "analyzed",
  }), [graph, preparedAnalysis, seedSessions]);

  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>(K12_PROJECT_ID);
  const [showNewProcess, setShowNewProcess] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [sessionDeleteTarget, setSessionDeleteTarget] = useState<Session | null>(null);
  // True once a session feeding the current map is deleted: the shown map is now
  // out of date until the presenter regenerates it (we never silently rebuild).
  const [mapStale, setMapStale] = useState(false);

  // Per-project display ("reveal") state for the Map / Insight panel. Kept apart
  // from each project's canonical data so the presenter-paced beats (Generate →
  // Run analysis) still hold.
  const [shownGraph, setShownGraph] = useState<Graph | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [processSummary, setProcessSummary] = useState<string | null>(null);
  const [entityAttributes, setEntityAttributes] = useState<Record<string, Record<string, string>> | null>(null);
  // SINGLE reveal structure: which projects have had their map / analysis
  // *revealed* this session, keyed by project id. Drives (a) the Processes
  // overview — so the prepared K-12 workspace presents as a launch pad and never
  // pre-spoils the $34K reveal — and (b) restoring a project's shown map on
  // switch-back (hydrateDisplay). Replaces the former revealedRef/revealedMap/
  // revealedAnalysis trio so map + analysis reveal state can never drift apart.
  const [revealed, setRevealed] = useState<Map<string, { map: boolean; analysis: boolean }>>(new Map());
  const markMapRevealed = useCallback((id: string) => {
    setRevealed((prev) => {
      const cur = prev.get(id);
      if (cur?.map) return prev;
      return new Map(prev).set(id, { map: true, analysis: cur?.analysis ?? false });
    });
  }, []);
  const markAnalysisRevealed = useCallback((id: string) => {
    setRevealed((prev) => {
      const cur = prev.get(id);
      if (cur?.analysis) return prev;
      return new Map(prev).set(id, { map: cur?.map ?? false, analysis: true });
    });
  }, []);
  const clearRevealed = useCallback((id: string) => {
    setRevealed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Map-generation failure (live extract). Kept separate from the analysis
  // `error` so a failed map build surfaces on the map pane with its own retry —
  // never a blank dead-end. lastChosenRef remembers the sessions used so the
  // presenter can retry the exact same generation.
  const [mapError, setMapError] = useState<string | null>(null);
  const lastChosenRef = useRef<Session[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [generatingMap, setGeneratingMap] = useState(false);
  const [theme, setTheme] = useState<Theme>("cosmos");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Latest active project id, readable from async/deferred callbacks (the
  // prepared reveal timer and the live extract await) so a completion that
  // lands after the user switched projects can drop its stale reveal instead of
  // clobbering the now-active project's view. Updated every render below.
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Deliberate GLOBAL session fetch (no ?projectId=). The Processes overview and
  // the ProjectSwitcher render a session count for EVERY project at once, so the
  // shell needs the full saved set in one array and buckets it per-workspace via
  // sessionsForProject(). Scoping this to the active project would zero out the
  // other projects' overview counts until each is opened — a visible regression.
  // The route DOES support ?projectId= for callers that want one workspace; the
  // shell intentionally does not use it. (ARCH-6 tradeoff, accepted.)
  const refreshSaved = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      setSavedSessions((await res.json()) as Session[]);
    } catch {
      /* leave the seed library in place if the fetch fails */
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      setUserProjects((await res.json()) as Project[]);
    } catch {
      /* no persisted projects yet — only the prepared K-12 workspace shows */
    }
  }, []);

  useEffect(() => { void refreshSaved(); void refreshProjects(); }, [refreshSaved, refreshProjects]);

  const projects = useMemo<Project[]>(() => [k12Project, ...userProjects], [k12Project, userProjects]);
  const activeProject = useMemo<Project>(
    () => projects.find((p) => p.id === activeProjectId) ?? k12Project,
    [projects, activeProjectId, k12Project]
  );

  const activeSessions = useMemo<Session[]>(
    () => sessionsForProject(activeProjectId, savedSessions, seedSessions),
    [activeProjectId, savedSessions, seedSessions]
  );

  const overviews = useMemo<ProjectOverview[]>(() => projects.map((p) => {
    const sessions = sessionsForProject(p.id, savedSessions, seedSessions);
    // The prepared K-12 workspace always carries a baked graph + analysis, but
    // we gate them behind the live reveal so the overview never spoils the demo;
    // user projects show their real persisted pipeline state.
    const isK12 = p.id === K12_PROJECT_ID;
    const rev = revealed.get(p.id);
    const mapDone = isK12 ? !!rev?.map : !!p.graph;
    const analysisDone = isK12 ? !!rev?.analysis : !!p.analysis;
    return {
      project: p,
      sessionCount: sessions.length,
      mapDone,
      analysisDone,
      status: deriveProjectStatus({
        sessionCount: sessions.length,
        graph: mapDone ? p.graph : undefined,
        analysis: analysisDone ? p.analysis : undefined,
      }),
      lastUpdated: lastUpdatedLabel(p.createdAt, sessions),
    };
  }), [projects, savedSessions, seedSessions, revealed]);

  // Merge analysis-time attributes (e.g. hoursPerWeek) into the displayed graph
  // so node detail cards show them. Prepared data already carries them in seed.
  const mapGraph = useMemo<Graph | null>(() => {
    if (!shownGraph) return null;
    if (!entityAttributes) return shownGraph;
    return {
      ...shownGraph,
      entities: shownGraph.entities.map((e) =>
        entityAttributes[e.id]
          ? { ...e, attributes: { ...(e.attributes ?? {}), ...entityAttributes[e.id] } }
          : e
      ),
    };
  }, [shownGraph, entityAttributes]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  const blankDisplay = useCallback(() => {
    setShownGraph(null);
    setInsights(null);
    setProcessSummary(null);
    setEntityAttributes(null);
  }, []);

  const updateUserProject = useCallback((id: string, patch: Partial<Project>) => {
    setUserProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // Persist a user project (never the seeded K-12 workspace).
  const persistProject = useCallback((p: Project) => {
    if (p.id === K12_PROJECT_ID) return;
    void fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    }).catch(() => { /* best-effort; in-session state already updated */ });
  }, []);

  // Restore a project's revealed map/analysis when switching back to it.
  const hydrateDisplay = useCallback((id: string) => {
    const p = projects.find((x) => x.id === id);
    if (revealed.get(id)?.map && p?.graph) {
      setShownGraph(p.graph);
      if (p.analysis) {
        setProcessSummary(p.analysis.processSummary);
        setInsights(p.analysis.insights);
        setEntityAttributes(p.analysis.entityAttributes ?? null);
      } else {
        setProcessSummary(null);
        setInsights(null);
        setEntityAttributes(null);
      }
    } else {
      blankDisplay();
    }
    setLoading(false);
    setError(null);
    setMapError(null);
  }, [projects, blankDisplay, revealed]);

  const selectProject = useCallback((id: string) => {
    if (id === activeProjectId) return;
    clearTimers();
    setIngesting(false);
    setActiveProjectId(id);
    hydrateDisplay(id);
  }, [activeProjectId, clearTimers, hydrateDisplay]);

  const navigate = useCallback((target: View) => {
    if (target === "interview") { setError(null); }
    setView(target);
  }, []);

  const openProject = useCallback((id: string) => {
    selectProject(id);
    setView("sessions");
  }, [selectProject]);

  const createProject = useCallback((fields: { name: string; lineOfBusiness: string; description: string }) => {
    const id = `proj-${Date.now()}`;
    const project: Project = {
      id,
      name: fields.name.trim(),
      lineOfBusiness: fields.lineOfBusiness.trim(),
      description: fields.description.trim() || undefined,
      createdAt: new Date().toISOString(),
      sessionIds: [],
      status: "empty",
    };
    setUserProjects((prev) => [project, ...prev]);
    setActiveProjectId(id);
    clearRevealed(id);
    clearTimers();
    setIngesting(false);
    blankDisplay();
    setShowNewProcess(false);
    setView("sessions");
    persistProject(project);
  }, [clearTimers, blankDisplay, persistProject, clearRevealed]);

  // Delete a user project plus its scoped sessions, map, and analysis. Protected
  // (seeded K-12) workspaces are never deletable. If the deleted project was
  // active, switch to another remaining project, else land on the Processes
  // overview. The server removes the project file and its saved sessions.
  const deleteProject = useCallback((id: string) => {
    if (isProtectedProject(id)) return;

    const wasActive = id === activeProjectId;
    const nextActiveId = userProjects.find((p) => p.id !== id)?.id ?? K12_PROJECT_ID;

    setUserProjects((prev) => prev.filter((p) => p.id !== id));
    setSavedSessions((prev) => prev.filter((s) => (s.projectId ?? K12_PROJECT_ID) !== id));
    clearRevealed(id);
    void fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      .catch(() => { /* best-effort; in-session state already updated */ });
    setDeleteTarget(null);

    if (wasActive) {
      clearTimers();
      setIngesting(false);
      setActiveProjectId(nextActiveId);
      blankDisplay();
      setLoading(false);
      setError(null);
      setView("processes");
    }
  }, [activeProjectId, userProjects, clearTimers, blankDisplay, clearRevealed]);

  // Delete a single live-captured session. Seeded demo sessions (id prefix
  // "seed-") are never deletable. We do NOT regenerate any existing map — if one
  // is shown, flag it stale so the presenter can choose to rebuild.
  const deleteSession = useCallback((id: string) => {
    if (id.startsWith("seed-")) return;
    setSavedSessions((prev) => prev.filter((s) => s.id !== id));
    if (shownGraph) setMapStale(true);
    void fetch(`/api/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      .catch(() => { /* best-effort; in-session state already updated */ });
    setSessionDeleteTarget(null);
  }, [shownGraph]);

  // Step 2: build the active project's map from the chosen sessions and land on
  // it. Analysis is the next, separate beat (Run analysis).
  const onGenerateMap = useCallback(async (chosen: Session[]) => {
    clearTimers();
    setView("map");
    setError(null);
    setMapError(null);
    setMapStale(false);
    lastChosenRef.current = chosen;

    const project = activeProject;
    const isPrepared = project.id === K12_PROJECT_ID;

    // Prepared K-12 (demo-safe) path: reveal the canonical graph with zero
    // network, zero Gemini, zero mic dependency.
    if (isPrepared && !liveMode) {
      blankDisplay();
      setIngesting(true);
      const t = setTimeout(() => {
        // User switched away during the ingest beat — drop this stale reveal so
        // it never clobbers the now-active project's view (overlay was already
        // cleared by selectProject/createProject/deleteProject).
        if (activeProjectIdRef.current !== project.id) return;
        setIngesting(false);
        setShownGraph(graph);
        markMapRevealed(project.id);
      }, INGEST_DURATION);
      timers.current = [t];
      return;
    }

    // Live path: extract a graph from the chosen sessions' transcripts. Keep any
    // previously shown map visible under the overlay — only the insights are
    // cleared — so a failed regeneration never wipes the screen.
    setInsights(null);
    setProcessSummary(null);
    setEntityAttributes(null);
    setIngesting(true);
    setGeneratingMap(true);
    try {
      const transcripts = chosen.map(sessionToTranscript);
      const res = await fetch("/api/gemini/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcripts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      const g = data as Graph;
      // User switched away while the extract was in flight — drop this stale
      // reveal so it never clobbers the now-active project's view. The graph is
      // not persisted for the inactive project here (acceptable for minimality);
      // `finally { setGeneratingMap(false) }` still runs.
      if (activeProjectIdRef.current !== project.id) return;
      setIngesting(false);
      setShownGraph(g);
      markMapRevealed(project.id);
      if (!isPrepared) {
        const sessionIds = chosen.map((s) => s.id);
        const status = deriveProjectStatus({ sessionCount: chosen.length, graph: g });
        updateUserProject(project.id, { graph: g, sessionIds, status });
        persistProject({ ...project, graph: g, sessionIds, status });
      }
    } catch (e) {
      setIngesting(false);
      if (isPrepared) {
        // The hero demo must never dead-end: fall back to the canonical graph.
        setShownGraph(graph);
        markMapRevealed(project.id);
      }
      // Surface on the map pane (with retry / prepared fallback), keeping any
      // prior map in place rather than blanking it.
      setMapError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingMap(false);
    }
  }, [clearTimers, blankDisplay, activeProject, liveMode, graph, updateUserProject, persistProject, markMapRevealed]);

  // Retry the last map generation with the same chosen sessions.
  const retryGenerateMap = useCallback(() => {
    void onGenerateMap(lastChosenRef.current);
  }, [onGenerateMap]);

  // Demo fallback: reveal the canonical prepared graph for the active project
  // (only meaningful for K-12, which has one) when live generation failed.
  const usePreparedMapFallback = useCallback(() => {
    clearTimers();
    setMapError(null);
    setIngesting(false);
    setShownGraph(graph);
    markMapRevealed(activeProject.id);
  }, [clearTimers, graph, activeProject.id, markMapRevealed]);

  // Live analysis beat for a real graph (live K-12 or any user project).
  const analyzeGraph = useCallback(async (g: Graph, project: Project) => {
    clearTimers();
    setIngesting(false);
    setInsights(null);
    setProcessSummary(null);
    setEntityAttributes(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: g, projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      const analysis = data as Analysis;
      setProcessSummary(analysis.processSummary);
      setInsights(analysis.insights);
      setEntityAttributes(analysis.entityAttributes ?? null);
      markAnalysisRevealed(project.id);
      if (project.id !== K12_PROJECT_ID) {
        updateUserProject(project.id, { analysis, status: "analyzed" });
        persistProject({ ...project, graph: g, analysis, status: "analyzed" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [clearTimers, updateUserProject, persistProject, markAnalysisRevealed]);

  // Prepared (offline) analysis beat — trust → insight → HITL flag reveal.
  const runPrepared = useCallback(() => {
    clearTimers();
    setIngesting(false);
    setInsights(null);
    setProcessSummary(null);
    setEntityAttributes(null);
    setError(null);
    setLoading(true);

    const t1 = setTimeout(() => {
      setLoading(false);
      setProcessSummary(preparedProcessSummary);
      setInsights([preparedInsights[0]]);
      markAnalysisRevealed(activeProjectId);
    }, 850);
    const t2 = setTimeout(() => {
      setInsights(preparedInsights);
    }, 2050);
    timers.current = [t1, t2];
  }, [preparedInsights, preparedProcessSummary, clearTimers, markAnalysisRevealed, activeProjectId]);

  const runAnalysis = useCallback(() => {
    if (!shownGraph) return; // a map must be generated first
    const project = activeProject;
    if (project.id === K12_PROJECT_ID && !liveMode) runPrepared();
    else analyzeGraph(shownGraph, project);
  }, [shownGraph, activeProject, liveMode, runPrepared, analyzeGraph]);

  const highlightedIds = insights?.flatMap((i) => i.entitiesInvolved) ?? [];

  // Discovery flow state → drives the persistent stepper. Each beat is "done"
  // once its artifact exists for the active project's current reveal.
  const hasSessions = activeSessions.length > 0;
  const hasMap = !!shownGraph;
  const hasInsight = !!insights && insights.length > 0;
  const hasReview = !!insights && insights.length > 1; // the HITL flag is appended
  const stepDone = [hasSessions, hasMap, hasInsight, hasReview];
  const flowSteps: FlowStep[] = FLOW_STEP_DEFS.map((s, i) => ({ ...s, done: stepDone[i] }));
  const currentStep = flowSteps.findIndex((s) => !s.done);
  const showStepper = view !== "processes";

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <TopBar
        overviews={overviews}
        activeProjectId={activeProjectId}
        liveMode={liveMode}
        theme={theme}
        onSelectProject={selectProject}
        onNewProcess={() => setShowNewProcess(true)}
        onRequestDeleteProject={setDeleteTarget}
        onThemeChange={setTheme}
        onLiveChange={setLiveMode}
      />

      {/* ── Nav rail + main view ─────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        <NavRail view={view} onNavigate={navigate} sessionCount={activeSessions.length} activeProject={activeProject} />

        {/* Content column: persistent flow stepper + active view */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>
        {showStepper && <FlowStepper steps={flowSteps} current={currentStep} onGo={navigate} />}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {view === "processes" && (
          <ProcessesView
            overviews={overviews}
            activeId={activeProjectId}
            onOpen={openProject}
            onNew={() => setShowNewProcess(true)}
            onRequestDelete={setDeleteTarget}
          />
        )}

        {view === "sessions" && (
          <SessionsView
            sessions={activeSessions}
            onNewInterview={() => navigate("interview")}
            onGenerateMap={onGenerateMap}
            onRequestDeleteSession={setSessionDeleteTarget}
            generating={generatingMap}
          />
        )}

        {view === "interview" && (
          <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <InterviewCapture
              projectId={activeProjectId}
              onExit={() => { void refreshSaved(); navigate("sessions"); }}
            />
          </section>
        )}

        {view === "map" && (
          <MapView
            shownGraph={shownGraph}
            mapGraph={mapGraph}
            activeProject={activeProject}
            mapStale={mapStale}
            hasInsight={hasInsight}
            loading={loading}
            ingesting={ingesting}
            mapError={mapError}
            highlightedIds={highlightedIds}
            processSummary={processSummary}
            insights={insights}
            error={error}
            onRunAnalysis={runAnalysis}
            onRetry={retryGenerateMap}
            onUsePrepared={activeProject.id === K12_PROJECT_ID ? usePreparedMapFallback : undefined}
            onDismissMapError={() => setMapError(null)}
            onGoToSessions={() => navigate("sessions")}
          />
        )}

        </div>
        </div>

      </div>

      {showNewProcess && (
        <NewProcessModal onClose={() => setShowNewProcess(false)} onCreate={createProject} />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          title={`Delete ${deleteTarget.name}?`}
          body="This removes its sessions, map, and analysis. This cannot be undone."
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteProject(deleteTarget.id)}
        />
      )}

      {sessionDeleteTarget && (
        <ConfirmDeleteModal
          title={`Delete the session with ${sessionDeleteTarget.participant.name}?`}
          body="Its transcript will be removed. This cannot be undone."
          onCancel={() => setSessionDeleteTarget(null)}
          onConfirm={() => deleteSession(sessionDeleteTarget.id)}
        />
      )}
    </main>
  );
}
