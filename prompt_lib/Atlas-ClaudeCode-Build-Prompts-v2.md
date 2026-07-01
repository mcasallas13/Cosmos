# Atlas Web App — Claude Code Build Prompts (v2, full pipeline)
**Paste in order. One phase at a time. Let each acceptance check pass before the next.**

This build covers the whole pipeline: capture an interview by voice, save the session and transcript, generate a process map from transcripts, then run the analysis.

---

## Before you start

1. New repo, open in Claude Code.
2. Add to the repo root: `Atlas-Project-Insights-Build-Spec.md`, the `seed/` folder (graph.json, expected-insight.json, secondary-insight-review.json, transcripts/), and `atlas-app.html` (the visual and behavioral prototype).
3. Have a Gemini API key ready for `.env` as `GEMINI_API_KEY`.

The prototype `atlas-app.html` is the source of truth for layout, the three views, and the interaction flow. Match it.

---

## Prompt 0 — Kickoff and multi-view shell

```
Read Atlas-Project-Insights-Build-Spec.md, the seed/ folder, and atlas-app.html in full. atlas-app.html is the visual and behavioral target for this build. Give me a 6-line summary of the pipeline and the views before writing code.

Then build Phase 0. Scaffold a Next.js app (TypeScript, App Router). Add a server-side API route that calls Gemini via the @google/generative-ai SDK using GEMINI_API_KEY, never exposed to the browser. Build the app shell from the prototype: a left sidebar with three nav items, Sessions, Live interview, and Map and analysis, that switch the main view. Empty placeholders for each view for now. Add .env.example.

Working agreement: one phase at a time, stop and show me the acceptance check after each, keep diffs small, build nothing marked out of scope.

Acceptance: the app runs, the three views switch from the sidebar, and a test Gemini call through the API route returns text with the key server-side only.
```

---

## Prompt 1 — Data model and seed

```
Phase 1. In /lib/types.ts implement: Entity, Relationship, Graph, Insight (from spec Section 4) plus Session and TranscriptTurn.

Session = { id, name, role, date, durationSec, status, turns: TranscriptTurn[] }
TranscriptTurn = { speaker: "atlas" | "participant", text: string }

Load the three seed sessions (use the transcripts in seed/transcripts/ for James Carter, Priya Nair, and Maria Lopez), plus seed/graph.json and seed/expected-insight.json. Validate the graph against the schema.

Acceptance: three seed sessions load with their turns, and seed/graph.json validates (17 entities, 28 relationships). Print the counts.
```

---

## Prompt 2 — Sessions view

```
Phase 2. Build the Sessions view to match atlas-app.html: a list of session cards on the left (name, role, turn count, date, duration) and a transcript detail panel on the right that shows the selected session's turns as Atlas and participant bubbles. Include a "New interview" button (routes to the interview view) and a "Generate process map" action in the detail panel.

Acceptance: all three seed sessions render, selecting one shows its full transcript, and the layout matches the prototype.
```

---

## Prompt 3 — Interview view (UI and question flow)

```
Phase 3. Build the Live interview view to match atlas-app.html. Left: the participant header, the current Atlas question, a question counter, and a large mic button. Right: the transcript building live, and an "End and save session" button. Drive a fixed Atlas question set (6 questions) that advances as answers are captured. For now, stub the answer capture with a manual "next" so the flow is testable without audio.

Acceptance: the question flow advances through all six, the transcript builds turn by turn, and "End and save" becomes enabled at the end.
```

---

## Prompt 4 — Gemini Speech-to-Text and save

```
Phase 4. Wire real voice capture into the interview. On mic press, record audio in the browser with MediaRecorder. Send the audio to a server-side API route that transcribes it with Gemini (audio input: send the recorded clip to the current Gemini model with a transcription instruction). Return the text and append it as a participant TranscriptTurn, then advance to the next question. Show a "Listening, Gemini Speech-to-Text" status while recording.

On "End and save session", persist the session and its transcript (use Firestore, or a local store for the hackathon) and show it in the Sessions list.

Acceptance: speak an answer, see it transcribed by Gemini into the transcript, complete a short interview, save it, and see the new session appear in Sessions with its transcript. The Gemini key stays server-side.
```

---

## Prompt 5 — Generate process map from transcripts

```
Phase 5. Wire "Generate process map". Take the selected sessions' transcripts and run the extraction step (spec Section 6a, system instruction in /lib/prompts.ts): produce a Graph as JSON, entities and relationships, inventing nothing not supported by the transcripts. Render the result as the dependency map in the Map and analysis view, matching the prototype's node styling and the highlighted shared step.

Acceptance, key test: generating from the three seed transcripts produces a graph where Eligibility Verification connects to BOTH initiatives, owned by Maria, using one spreadsheet. The crossover must emerge from combining the transcripts. Show the generated graph.
```

---

## Prompt 6 — Run analysis and financial layer

```
Phase 6. Add the analysis step (spec Section 6b). On "Run analysis", send the Graph to Gemini and return one Insight, the highest-value finding, rendered in the insight panel with the crossover highlight animating on the map (match the prototype). Add /lib/finance.ts (spec Section 7) and show the dollar figure and basis, with the inputs as editable constants.

Critical acceptance: run analysis on the generated graph five times. It must surface the Eligibility Verification crossover, matching seed/expected-insight.json, every time. Show all five runs and the populated insight panel with the about 34K dollar figure.
```

---

## Prompt 7 — Human-in-the-loop

```
Phase 7. Show the confidence level on every insight. When needsHumanReview is true, render the review flag, the what-to-check text, and Confirm and Dismiss controls (match the prototype's second card). Use seed/secondary-insight-review.json as the flagged finance-approver finding shown alongside the hero insight.

Acceptance: both the high-confidence hero insight and the low-confidence flagged finding render, and Confirm or Dismiss resolves the flagged one on screen.
```

---

## Prompt 8 — Pipeline flow, demo polish, and safety net

```
Phase 8. Make the full pipeline flow and make it demo-safe. By default, load the three prepared sessions and allow the prepared graph and insights so the hero path does NOT depend on a live Gemini call, a live mic, or the network. Keep the live paths (real interview, real extraction, real analysis) available but clearly separate. Sequence the experience to match the prototype: capture or open a session, generate the map, run the analysis, surface the human-in-the-loop flag. Tighten layout and timing.

Acceptance: the full flow runs end to end from prepared data with zero live dependency, in under the demo time limit. Walk me through it.
```

---

## Prompt 9 — Hardening and run sheet

```
Final pass. Cold-start dry run using only prepared data. List anything that could break live: live audio, network calls on the hero path, timing, layout at presentation resolution. Fix or flag each. Confirm the Gemini key is server-side only.

Then give me a 12-line demo run sheet: the exact click order to walk the panel from interview to insight.
```

---

## After the build

- Record a clean screen capture of the prepared-data run as your fallback.
- The live interview and live extraction are the "show it is real" moments. The hero insight always runs from prepared data.
- When you have real K-12 recruiting interviews and a verified real crossover, replace the seed sessions and graph with the same shapes. The build keeps working.
- Confirm ElevenLabs is not on the critical path. Voice here is Gemini Speech-to-Text, which needs no extra approval.
```
