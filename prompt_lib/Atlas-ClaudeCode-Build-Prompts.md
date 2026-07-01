# Atlas Web App — Claude Code Build Prompts
**Paste these into Claude Code in order. One phase at a time.**

---

## Before you start

1. Create an empty repo and open it in Claude Code.
2. Put `Atlas-Project-Insights-Build-Spec.md` at the repo root.
3. Add the `seed/` folder with `graph.json`, `expected-insight.json`, `secondary-insight-review.json`, and `transcripts/` (the three transcript files).
4. Have a Gemini API key ready. You will put it in `.env` as `GEMINI_API_KEY`.

**How to use:** paste Prompt 0, let Claude Code finish and run its acceptance check, confirm it passed, then paste the next. Do not skip ahead. If an acceptance check fails, tell it to fix before moving on.

---

## Prompt 0 — Kickoff and scaffold

```
Read Atlas-Project-Insights-Build-Spec.md in full, and look at the seed/ folder: graph.json, expected-insight.json, secondary-insight-review.json, and transcripts/. This is the project you are building.

Before writing any code, give me a 5-line summary of what we are building and the build phases, so I can confirm you understood.

Then build Phase 0 only. Scaffold a Next.js app with TypeScript and the App Router. Add a server-side API route that calls Gemini via the @google/generative-ai SDK, reading the key from an env var GEMINI_API_KEY. The key must never reach the browser. Create a two-pane layout: a dependency map area on the left and an insight panel on the right, both empty placeholders for now. Add a .env.example.

Working agreement for the whole project: build one phase at a time, stop after each phase, and show me the acceptance check result before moving on. Keep diffs small. Do not build anything listed as out of scope in the spec. No auth, no database, no voice.

Phase 0 acceptance: the app runs locally, a test call through the Gemini API route returns text, and the key is not present in any client bundle. Show me how you verified this.
```

---

## Prompt 1 — Data model and seed

```
Phase 1. Implement the TypeScript types from Section 4 of the spec (Entity, Relationship, Graph, Insight) in /lib/types.ts. Add a loader that reads seed/graph.json and validates it against the schema: every relationship source and target must reference a real entity id.

Acceptance: seed/graph.json loads and passes validation, and a quick script or test prints the entity and relationship counts. Expect 17 entities and 28 relationships. Show me the output.
```

---

## Prompt 2 — Dependency map

```
Phase 2. Render the loaded graph as an interactive dependency map using React Flow (@xyflow/react) in /components/DependencyMap.tsx. Color nodes by type (person, process, system, initiative) and add a small legend. Use an auto-layout so it is readable, label edges by relationship type, and make sure the two initiatives and the shared Eligibility Verification node are clearly visible.

Acceptance: the map renders the full seed graph, both initiatives are visible, and the Eligibility Verification node visibly connects into both. Show me a screenshot or describe the resulting layout.
```

---

## Prompt 3 — Extraction (ingest)

```
Phase 3. Add the extraction step from Section 6a of the spec. Create /lib/prompts.ts with an extraction system instruction, and an API route that takes the transcripts in seed/transcripts/ plus any documents and returns a Graph as JSON matching the schema. The model must not invent entities that are not supported by the input.

Acceptance, this is the key test: run extraction on the three seed transcripts and confirm the resulting graph contains Maria Lopez, the Eligibility Verification process, and the Eligibility Spreadsheet, and that Eligibility Verification connects to BOTH initiatives. The crossover must emerge from combining the transcripts, since no single transcript contains it. Show me the extracted graph and confirm the shared step is present.
```

---

## Prompt 4 — Insight analysis and highlight (the wow)

```
Phase 4. This is the most important phase. Add the analysis step from Section 6b. Add an analysis system instruction to /lib/prompts.ts and an API route that takes a Graph and returns a single Insight as JSON, finding the highest-value finding. Then render the Insight in the right pane (title, explanation, recommended action) and highlight the involved nodes and edges on the map with an animation.

Critical acceptance: run the analysis on seed/graph.json five times. It must surface the Eligibility Verification crossover, matching seed/expected-insight.json, every single time. If it does not, constrain the prompt or pre-rank candidate findings until it does. The hero insight cannot be left to chance. Show me all five runs.
```

---

## Prompt 5 — Financial layer

```
Phase 5. Create /lib/finance.ts implementing the ROI calculation from Section 7 of the spec. Inputs: applications per week, minutes per application, hourly cost, weeks per year. Output: the headline string, value, unit, and basis. Make the inputs editable constants at the top of the file so we can swap in FP&A numbers later. Wire the computed financialImpact into the insight and display the dollar figure and its basis in the insight panel.

Acceptance: the insight panel shows the committed number, about 34K dollars per year, and the assumptions behind it. Show me the panel.
```

---

## Prompt 6 — Human-in-the-loop

```
Phase 6. Display the confidence level on every insight. When needsHumanReview is true, show a clear review flag and the whatToCheck text. Load seed/secondary-insight-review.json as a second finding and render it, so the flagged, low-confidence finance-approver insight appears alongside the hero insight.

Acceptance: the UI shows the high-confidence hero insight AND the low-confidence flagged finding with its needs-human-review prompt and what to check. Show me both rendered.
```

---

## Prompt 7 — Demo polish and safety net

```
Phase 7. Make the demo reliable. By default, load the prepared, validated data (seed/graph.json and the expected insights) so the hero moment does NOT depend on a live model call, a live mic, or the network. Add an optional Live Ingest toggle that runs the real extraction and analysis, clearly separated from the default path. Sequence the UI to support the three demo beats from Section 2 of the spec: first input arriving, then the map rendering and the crossover highlighting (the wow), then the human-in-the-loop flag. Tighten layout, timing, and the highlight animation.

Acceptance: the full three-beat flow runs start to finish from prepared data with zero live dependency, in under the demo time limit. Walk me through the run.
```

---

## Prompt 8 — Final hardening and run sheet

```
Final pass. Do a full dry run of the demo from a cold start using only prepared data. List anything that could break live: network calls on the hero path, timing risks, layout issues at presentation resolution. Fix or flag each one. Confirm the Gemini key is server-side only.

Then give me a 10-line demo run sheet: the exact click order to perform the three beats on stage.
```

---

## After the build

- Record a screen capture of a clean run from prepared data. This is your fallback if anything fails live. It lives outside the app.
- The Live Ingest toggle is for an optional short capture cameo only. The hero insight always runs from prepared data.
- When the team has real K-12 recruiting conversations and a verified real crossover, replace the seed files with the same shapes. The build keeps working.
