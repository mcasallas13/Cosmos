# Atlas — Complete Claude Code Build Prompts (definitive)
**Paste in order. One phase at a time. Let each acceptance check pass before the next.**

This is the authoritative build definition. It supersedes earlier prompt files and carries the full data model inline, so it does not depend on the older spec.

## What Atlas is

Atlas is a process-intelligence tool. Its main job:

1. **Interview a subject-matter expert by voice.** Atlas asks questions and uses speech-to-text (Gemini) to collect how a process actually works.
2. **Capture identity.** It records the SME's name, role, and team first, because that identity is what lets Atlas attribute steps, ownership, and dependencies correctly.
3. **Save** the session and its transcript.
4. **Generate a process map** from the transcripts.
5. **Identify crossover dependencies** and single points of failure.
6. **Run an analysis** that explains the process in plain language and attaches financial insight.

## Constraints

Google Cloud and Gemini are mandated (Eurazeo / Google Paris hackathon, July 9 to 10, 2026). The prototype `atlas-app.html` is the visual and behavioral target. The seed files are the eval anchor.

---

## Before you start

1. New repo, open in Claude Code.
2. Add to the repo root: `atlas-app.html` (the prototype), and the `seed/` folder (`graph.json`, `expected-insight.json`, `secondary-insight-review.json`, `transcripts/`).
3. Gemini API key ready for `.env` as `GEMINI_API_KEY`.

Working agreement for every phase: build one phase, stop, run the acceptance check, and show me the result before continuing. Keep diffs small. Build nothing outside the current phase.

---

## Prompt 0 — Kickoff and multi-view shell

```
Read atlas-app.html and the seed/ folder in full. atlas-app.html is the visual and behavioral target. Give me a 6-line summary of the app's job and its three views before writing code.

Build Phase 0. Scaffold a Next.js app (TypeScript, App Router). Add a server-side API route that calls Gemini via the @google/generative-ai SDK using GEMINI_API_KEY, never exposed to the browser. Build the app shell from the prototype: a left sidebar with three nav items, Sessions, Live interview, and Map and analysis, that switch the main view. Empty placeholders for now. Add .env.example.

Acceptance: the app runs, the three views switch from the sidebar, and a test Gemini call through the API route returns text with the key server-side only. Show me how you verified.
```

---

## Prompt 1 — Data model and seed

```
Phase 1. In /lib/types.ts implement these types and use them everywhere.

ProcessParticipant = { name: string; role: string; team?: string }
TranscriptTurn = { speaker: "atlas" | "participant"; text: string }
Session = { id: string; participant: ProcessParticipant; date: string; durationSec: number; status: "draft" | "ready"; turns: TranscriptTurn[] }

Entity = { id: string; type: "person" | "process" | "system" | "initiative"; name: string; attributes?: Record<string,string> }
Relationship = { id: string; source: string; target: string; type: "depends_on" | "owns" | "hands_off_to" | "uses" | "part_of"; label?: string }
Graph = { entities: Entity[]; relationships: Relationship[] }

Insight = { id: string; type: "crossover" | "single_point_of_failure" | "concentration"; title: string; entitiesInvolved: string[]; explanation: string; recommendedAction: string; financialImpact: { headline: string; value: number; unit: string; basis: string }; confidence: "high" | "medium" | "low"; needsHumanReview: boolean; whatToCheck?: string }

Analysis = { processSummary: string; insights: Insight[] }
// processSummary is a plain-language explanation of how the process works.
// Financial insight lives in each insight's financialImpact.

Load the three seed sessions (participants James Carter / Recruiting Manager, Priya Nair / Scholarship Lead, Maria Lopez / Enrollment Coordinator; use the seed/transcripts/ content for their turns), plus seed/graph.json and seed/expected-insight.json. Validate the graph against the schema.

Acceptance: three seed sessions load with participant identity and turns, and seed/graph.json validates (17 entities, 28 relationships). Print the counts.
```

---

## Prompt 2 — Sessions view

```
Phase 2. Build the Sessions view to match atlas-app.html: a list of session cards (participant name, role, turn count, date, duration) and a transcript detail panel showing the selected session's turns as Atlas and participant bubbles. Include a "New interview" button (routes to the interview view) and a "Generate process map" action in the detail panel that can use the selected sessions.

Acceptance: all three seed sessions render with name and role, selecting one shows its full transcript, and the layout matches the prototype.
```

---

## Prompt 3 — Interview view, identity first, then the process

```
Phase 3. Build the Live interview view to match atlas-app.html. The interview MUST capture identity before process detail.

Question flow:
1. Name: "Before we start, what is your name?"
2. Role and team: "What is your role, and which team are you on?"
3. "Walk me through what happens when work first comes to you."
4. "Who or what do you hand off to next?"
5. "Which systems or tools are part of that?"
6. "Where does the process slow down or get stuck?"
7. "If you were out for a week, what would stall?"

Store the answers to 1 and 2 as the session's ProcessParticipant (name, role, team) and show them in the interview header as they are captured. Left pane: current question, question counter, large mic button. Right pane: the transcript building live, and an "End and save session" button. For now, stub answer capture with a manual advance so the flow is testable without audio.

Acceptance: the flow captures name, role, and team into the participant header, advances through all questions, the transcript builds, and "End and save" enables at the end.
```

---

## Prompt 4 — Gemini Speech-to-Text and save

```
Phase 4. Wire real voice capture into the interview. On mic press, record audio in the browser with MediaRecorder, send it to a server-side API route that transcribes it with Gemini (send the recorded clip to the current Gemini model with a transcription instruction), return the text, and append it as a participant TranscriptTurn, then advance. Show a "Listening, Gemini Speech-to-Text" status while recording. Use the transcribed answers to the identity questions to fill the participant name, role, and team.

On "End and save session", persist the session (participant identity plus transcript) to Firestore, or a local store for the hackathon, and show it in the Sessions list.

Acceptance: speak an answer, see Gemini transcribe it into the transcript, give your name and role by voice and see them populate the participant header, complete a short interview, save it, and see the new session in the library. The Gemini key stays server-side.
```

---

## Prompt 5 — Generate the process map, with attribution

```
Phase 5. Wire "Generate process map". Take the selected sessions' transcripts AND their participant identities and run extraction (system instruction in /lib/prompts.ts): produce a Graph as JSON.

Extraction rules: each transcript comes from a named participant with a role and team. Create a person entity for that participant, set role and team as attributes, and attribute ownership (owns) and handoff (hands_off_to) relationships based on what they describe. Identify processes, systems, and initiatives and the relationships among them. Invent nothing not supported by the transcripts.

Render the result as the dependency map in the Map and analysis view, matching the prototype's node styling and the highlighted shared step.

Acceptance, key test: generating from the three seed transcripts produces a graph where each SME appears as a person entity with their role, and Eligibility Verification connects to BOTH initiatives, owned by Maria, using one spreadsheet. The crossover must emerge from combining the transcripts, since no single one contains it. Show the generated graph.
```

---

## Prompt 6 — Run analysis: explain the process, find crossovers, quantify

```
Phase 6. Add the analysis step. On "Run analysis", send the Graph to Gemini and return an Analysis object with two parts:

1. processSummary: a plain-language explanation of how this process works, the main flow, the actors, and the systems, grounded in the graph.
2. insights: the highest-value findings, primarily the crossover or single point of failure, each with explanation, recommended action, confidence, and a financialImpact.

Render in the insight panel: a "How this process works" summary at the top, then the operational insight(s) with the crossover highlight animating on the map (match the prototype), and the dollar figure. Add /lib/finance.ts: applications/week x minutes/application gives hours; hours x weeks x hourly cost gives the annual figure. Use 120, 8, 48, and $45 as editable constants, which yields about $34,560/year. Attach the headline and number to the relevant insight.

Critical acceptance: run analysis on the generated graph five times. The processSummary must correctly describe the recruiting and scholarship flows, and the crossover insight must surface the Eligibility Verification dependency, matching seed/expected-insight.json, every time. Show all five runs and the populated panel with the about 34K dollar figure.
```

---

## Prompt 7 — Human-in-the-loop

```
Phase 7. Show the confidence level on every insight. When needsHumanReview is true, render the review flag, the what-to-check text, and Confirm and Dismiss controls (match the prototype's second card). Use seed/secondary-insight-review.json as the flagged, low-confidence finance-approver finding shown alongside the hero insight.

Acceptance: both the high-confidence hero insight and the low-confidence flagged finding render, and Confirm or Dismiss resolves the flagged one on screen.
```

---

## Prompt 8 — Pipeline flow and demo safety net

```
Phase 8. Make the full pipeline flow and make it demo-safe. By default, load the three prepared sessions and allow the prepared graph and analysis so the hero path does NOT depend on a live Gemini call, a live mic, or the network. Keep the live paths, real interview, real extraction, real analysis, available but clearly separate. Sequence the experience to match the prototype: capture or open a session, generate the map, run the analysis, surface the human-in-the-loop flag. Tighten layout and timing.

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
- The live voice interview and live extraction are the "this is real" moments. The hero insight always runs from prepared data.
- When you have real K-12 recruiting interviews and a verified real crossover, replace the seed sessions and graph with the same shapes. The build keeps working.
- Voice is Gemini Speech-to-Text, which needs no extra approval. Keep ElevenLabs off the critical path.
- The two human inputs that are not code: a verified real crossover from someone who runs the process, and FP&A sign-off on the financial inputs in Prompt 6.
```
