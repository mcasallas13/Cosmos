# Research Brief: The Generate-Process-Map Flow Is Quirky, Unintuitive, and Buggy

## 1. Problem

The "Generate process map" beat — the second of the four presenter-paced beats — is the most fragile interaction in the app. Grounded in the actual code:

**A. The map is not interactive in the way it advertises.** `components/DependencyMap.tsx` renders `<ReactFlow nodes={nodes} edges={edges} nodesDraggable ... />` where `nodes`/`edges` are derived **purely** from props via `useMemo(() => buildLayout(graph), [graph])`. There is **no `useNodesState`/`useEdgesState` and no `onNodesChange` handler**. React Flow is in "controlled" mode with no change pipe-back, so `nodesDraggable` is effectively a lie: a user can grab a node but the position change is dropped on the next render.

**B. Re-layout is destructive / position-resetting.** Because the only `useMemo` dependency is `graph`, every time `mapGraph` is recomputed in `AtlasApp.tsx` (which spreads `shownGraph` into a **new object** whenever `entityAttributes` changes after Run analysis), `DependencyMap` receives a new `graph` reference, `buildLayout` re-runs, dagre re-lays-out from scratch, and `fitView` re-frames. Running analysis after generating the map can visibly jump/re-fit the map.

**C. The generate flow is a hand-rolled, timer-driven async state machine spread across ~9 pieces of state.** `onGenerateMap` coordinates `clearTimers`, `setView`, `setError`, `setMapError`, `setMapStale`, `lastChosenRef`, `blankDisplay`, `setIngesting`, `setGeneratingMap`, `setShownGraph`, plus a bare `setTimeout` for the prepared path. Reveal beats live in `runPrepared` with two more bare `setTimeout`s (850ms, 2050ms). Raw setTimeout → stale closures, forgotten cleanup, race conditions.

**D. Two overlapping "ingest" animations of different lengths.** Prepared path uses `setTimeout(..., INGEST_DURATION=1650)` while `IngestOverlay` runs its **own** internal timers (~1160ms). The two clocks are independent and can desync — overlay finishes and sits blank, or graph pops before the last line renders.

**E. Selection semantics are surprising.** `SessionsView.targetsForMap = selected.length > 0 ? selected : open ? [open] : sessions`. With nothing checked and a transcript open, Generate silently uses just the open one; with nothing checked and nothing open it uses **all** sessions. The "no selection means all" rule is not obvious.

**F. LLM extraction reliability depends on prompt-only JSON discipline.** `runExtraction` does `JSON.parse(stripFences(raw))` with **no schema enforcement** — `generateWithFallback` never sets `responseMimeType`/`responseSchema`. The model is merely asked to "Return ONLY a valid JSON object." Non-deterministic extraction failures on the live path.

## 2. Root-Cause Hypothesis

Two distinct root causes, fixed independently:

1. **UI/UX state-machine fragility (causes A–E)** — the generate flow is an implicit state machine encoded as ~9 booleans/refs plus bare timers, with no single source of truth for "what phase are we in." `DependencyMap` recomputes its entire layout from a prop object whose identity changes on unrelated state updates, and never adopts React Flow's controlled-state hooks.

2. **Live extraction non-determinism (cause F)** — the extraction route trusts prompt instructions for JSON shape instead of Gemini's native structured-output mode (`responseMimeType: "application/json"` + `responseSchema`).

The **prepared (liveMode-off) hero path is demo-critical** and mostly insulated — zero network, reveals the canonical `graph` prop. Fixes must be surgical to avoid regressing it.

## 3. Options Compared

**Option 1 — Minimal hardening (stabilize layout + fix drag + tighten timers).** `useNodesState`/`useEdgesState`, re-seed only on structural id change, `fitView` after commit, single ingest clock. Smallest diff, lowest demo risk; kills A/B/D. Doesn't touch F or E.

**Option 2 — Explicit flow state machine (`useReducer` / discriminated-union phase).** Correct long-term architecture, textbook fix for the stale-closure/race class. But a large rewrite of the most demo-sensitive component days before a hackathon. High risk-to-reward now.

**Option 3 — Harden live extraction with Gemini structured output + schema (server-only).** `responseMimeType: "application/json"` + `responseSchema` mirroring `Graph`, keep `stripFences` as fallback. Removes live-path failures (F); invisible to the prepared path. Server-only, zero client/demo risk.

## 4. Recommended Approach

**Do Option 1 + Option 3 together; explicitly defer Option 2.** The two changes are orthogonal and additive — Option 1 fixes the *quirky/unintuitive* UI, Option 3 fixes the *reportedly buggy* live extraction — while neither touches the prepared hero path's data or timing. Option 1 is confined to `DependencyMap.tsx` plus a one-line memo split in `AtlasApp.tsx`; Option 3 is confined to `lib/gemini.ts` + the extract route. Option 2's blast radius over the demo-critical timer beats is unjustified now.

## 5. Implementation Steps (ordered, minimal, demo-safe)

**Phase A — Stabilize the map render (`components/DependencyMap.tsx`):**
1. Switch to controlled state: `useNodesState([])` / `useEdgesState([])`; wire `onNodesChange`/`onEdgesChange` so `nodesDraggable` persists.
2. Re-seed layout only on **structural** change: stable structural key from entity/relationship ids, run `buildLayout` in a `useEffect([layoutKey])`. Prevents the attribute-merge re-layout jump (B).
3. Apply highlight/dim and attribute `data` updates as a **separate** effect that maps over existing nodes by id (preserving positions), not a rebuild.
4. `fitView` via `useReactFlow()` in `setTimeout(..., 0)` inside the layout effect after `setNodes`. Wrap in `<ReactFlowProvider>` if needed.

**Phase B — Stop the merge from churning identity (`components/AtlasApp.tsx`):**
5. Keep the `mapGraph` `useMemo` as the attribute overlay; step A‑2 keys re-layout off ids only, so the merge no longer resets positions.

**Phase C — Single ingest clock (`AtlasApp.tsx` + `IngestOverlay`):**
6. Make `INGEST_DURATION` the single source, or have `IngestOverlay` fire `onDone` after its last line and drive the prepared graph reveal off that. Keep ≤ ~1.7s. Don't change `runPrepared`'s 850/2050 beats.

**Phase D — Harden timer callbacks (`AtlasApp.tsx`):**
7. Functional/ref-stable reads in `onGenerateMap`'s prepared branch and `runPrepared`. Keep `clearTimers` on every entry. **Guard the reveal against project switch: verify the active project still matches before `setShownGraph`, and reset `ingesting` on `selectProject`/unmount.**

**Phase E — Clarify selection (`SessionsView`):**
8. Make "no selection ⇒ all sessions" explicit in the action-bar copy ("from all N sessions" vs "from N selected"). Disable Generate only when `targetsForMap.length === 0`.

**Phase F — Deterministic live extraction (`lib/gemini.ts`, `extract/route.ts`):**
9. Add a structured-output path: `generationConfig: { responseMimeType: "application/json", responseSchema: GRAPH_SCHEMA }`. Keep `stripFences` + `JSON.parse` as fallback; keep `validateRefs` (422). Server-only.
10. Verify `npm run build`, `lib/phase5Check.ts` / `phase6Check.ts` (need dev server), `lib/phase10Check.ts` (offline) green.

**Guardrails:** do not modify any file under `seed/`; do not change `runPrepared` reveal-timing semantics; no `NEXT_PUBLIC_` secrets; verify liveMode-off Generate still does zero network.

## 6. References
- React Flow — Dagre layout example: https://reactflow.dev/examples/layout/dagre
- React Flow — Layouting: https://reactflow.dev/learn/layouting/layouting
- React Flow — `useNodesState()`: https://reactflow.dev/api-reference/hooks/use-nodes-state
- xyflow — dagre layout / fitView timing: https://github.com/xyflow/xyflow/discussions/4167
- Gemini API — Structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Google — Improving Structured Outputs in the Gemini API: https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-structured-outputs/
- Dmitri Pavlutin — Stale Closures with React Hooks: https://dmitripavlutin.com/react-hooks-stale-closures/
