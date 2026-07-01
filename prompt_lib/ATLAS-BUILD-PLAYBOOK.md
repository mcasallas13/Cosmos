# Atlas — Complete Build Playbook

**Purpose:** Recreate the entire Atlas application from scratch, using Claude Code, and then harden it with a closed-loop team of subagents.
**Repo location:** `C:\Projects\Cosmos`
**Context:** Eurazeo AI Hackathon, Google Paris, July 9 to 10, 2026. Google Cloud and Gemini are mandated.

This document is self-contained. It carries the data model, the seed data, the full prompt sequence, and the agent setup, so you can build without any other file except the prototype `atlas-app.html` (the visual and behavioral target), which should sit at the repo root.

---

## Table of contents

1. What Atlas is
2. Architecture and stack
3. Data model
4. Repo layout
5. Prerequisites
6. Seed data (inline)
7. Order of operations
8. Part A — core build prompts (0 to 9)
9. Multi-process prompts (create, switch)
10. Delete prompts (process, session)
11. Part B — enhancement prompts (M1 to M6)
12. Closed-loop subagent team (6 agents)
13. What only humans supply

---

## 1. What Atlas is

Atlas is a process-intelligence tool. Its main job:

1. Interview a subject-matter expert by voice. Atlas asks questions and uses speech-to-text (Gemini) to collect how a process actually works.
2. Capture identity first (name, role, team), because that identity is what lets Atlas attribute steps, ownership, and dependencies correctly.
3. Save the session and its transcript.
4. Generate a process map from the transcripts.
5. Identify crossover dependencies and single points of failure.
6. Run an analysis that explains the process in plain language and attaches financial insight.

Above the pipeline sits a Project layer: each Project is a named process-intelligence workspace with its own sessions, map, and analysis. This is what lets Atlas hold many processes and scale from one workflow to a portfolio instrument.

The hero demo: three interviews are already captured, the map is generated, the analysis surfaces a hidden crossover (two initiatives depending on one person and one spreadsheet), with a dollar figure and a human-in-the-loop flag. One conversation beats a hundred spreadsheets.

---

## 2. Architecture and stack

| Layer | Choice |
|---|---|
| App framework | Next.js (TypeScript, App Router) |
| AI model | Gemini via @google/generative-ai, server-side only |
| Speech to text | Gemini audio input (no ElevenLabs on the critical path) |
| Graph visualization | React Flow, or a hand-built SVG matching the prototype |
| Data source | Google Cloud Storage or Google Drive for transcripts in production; local seed for the build |
| Storage | Firestore, or a local store for the hackathon |
| Deploy | Cloud Run or Firebase Hosting |
| Key handling | GEMINI_API_KEY in .env, server-side routes only, never in the client |

Data flow: interview by voice, transcribe with Gemini, save session, extraction turns transcripts plus participant identity into a Graph, analysis turns the Graph into an Analysis (process summary plus insights with financial impact), rendered as the map and insight panel.

Design language: an ink-navy intelligence console, Space Grotesk for the interface and IBM Plex Mono for numbers and labels, one saturated color reserved for the risk. Match `atlas-app.html`.

---

## 3. Data model

Put this in `/lib/types.ts` and use it everywhere.

```ts
type Project = {
  id: string; name: string; lineOfBusiness: string; description?: string;
  createdAt: string; sessionIds: string[]; graph?: Graph; analysis?: Analysis;
  status: "empty" | "captured" | "mapped" | "analyzed"; protected?: boolean;
};

type ProcessParticipant = { name: string; role: string; team?: string };
type TranscriptTurn = { speaker: "atlas" | "participant"; text: string };
type Session = {
  id: string; participant: ProcessParticipant; date: string; durationSec: number;
  status: "draft" | "ready" | "processing"; turns: TranscriptTurn[];
  parentSessionId?: string; protected?: boolean;
};

type Entity = { id: string; type: "person" | "process" | "system" | "initiative"; name: string; attributes?: Record<string,string> };
type Relationship = { id: string; source: string; target: string; type: "depends_on" | "owns" | "hands_off_to" | "uses" | "part_of"; label?: string };
type Graph = { entities: Entity[]; relationships: Relationship[] };

type Insight = {
  id: string; type: "crossover" | "single_point_of_failure" | "concentration";
  title: string; entitiesInvolved: string[]; explanation: string; recommendedAction: string;
  financialImpact: { headline: string; value: number; unit: string; basis: string };
  confidence: "high" | "medium" | "low"; needsHumanReview: boolean; whatToCheck?: string;
  status?: "open" | "confirmed" | "dismissed" | "escalated"; escalationTarget?: string; escalationNote?: string;
};

type Analysis = { processSummary: string; insights: Insight[] };
```

---

## 4. Repo layout

Target structure under `C:\Projects\Cosmos`:

```
Cosmos/
  app/                     # Next.js App Router: pages and API routes
    api/gemini/            # server-side Gemini calls (transcribe, extract, analyze)
  components/              # DependencyMap, InsightPanel, SessionsView, InterviewView, etc.
  lib/
    types.ts               # the data model above
    prompts.ts             # extraction and analysis system instructions
    finance.ts             # ROI calculation
  seed/
    graph.json
    expected-insight.json
    secondary-insight-review.json
    transcripts/
      transcript-recruiting.md
      transcript-scholarship.md
      transcript-enrollment.md
  atlas-app.html           # the interactive prototype, visual and behavioral target
  .claude/agents/          # the subagent team (Section 12)
  .atlas-loop/             # the closed-loop workspace (Section 12)
  .env                     # GEMINI_API_KEY
  ATLAS-BUILD-PLAYBOOK.md  # this document
```

---

## 5. Prerequisites

- Node.js installed, and Claude Code opened in `C:\Projects\Cosmos`.
- A Gemini API key in `.env` as `GEMINI_API_KEY`.
- `atlas-app.html` placed at the repo root (the prototype).
- The `seed/` folder created from Section 6.

---

## 6. Seed data (inline)

Create these files exactly. They are the eval anchor: the three transcripts produce the graph, and the graph produces the expected insight.

### seed/graph.json

```json
{
  "entities": [
    { "id": "init-recruiting", "type": "initiative", "name": "Individual Recruiting Funnel" },
    { "id": "init-scholarship", "type": "initiative", "name": "Scholarship and Financial Aid Program" },
    { "id": "proc-lead-intake", "type": "process", "name": "Lead Intake" },
    { "id": "proc-app-review", "type": "process", "name": "Application Review" },
    { "id": "proc-eligibility", "type": "process", "name": "Eligibility Verification" },
    { "id": "proc-enrollment", "type": "process", "name": "Enrollment Processing" },
    { "id": "proc-payment", "type": "process", "name": "Payment Processing" },
    { "id": "proc-scholarship-review", "type": "process", "name": "Scholarship Application Review" },
    { "id": "proc-award", "type": "process", "name": "Award Determination" },
    { "id": "person-maria", "type": "person", "name": "Maria Lopez", "attributes": { "role": "Enrollment Coordinator", "team": "Enrollment" } },
    { "id": "person-james", "type": "person", "name": "James Carter", "attributes": { "role": "Recruiting Manager", "team": "K-12 Recruiting" } },
    { "id": "person-priya", "type": "person", "name": "Priya Nair", "attributes": { "role": "Scholarship Program Lead", "team": "Financial Aid" } },
    { "id": "person-tom", "type": "person", "name": "Tom Becker", "attributes": { "role": "Admissions Counselor", "team": "K-12 Recruiting" } },
    { "id": "sys-crm", "type": "system", "name": "Recruiting CRM" },
    { "id": "sys-eligibility-sheet", "type": "system", "name": "Eligibility Spreadsheet (legacy)" },
    { "id": "sys-enrollment", "type": "system", "name": "Enrollment System" },
    { "id": "sys-payment", "type": "system", "name": "Payment Portal" }
  ],
  "relationships": [
    { "id": "r1", "source": "proc-lead-intake", "target": "init-recruiting", "type": "part_of" },
    { "id": "r2", "source": "proc-app-review", "target": "init-recruiting", "type": "part_of" },
    { "id": "r3", "source": "proc-eligibility", "target": "init-recruiting", "type": "part_of", "label": "shared step" },
    { "id": "r4", "source": "proc-enrollment", "target": "init-recruiting", "type": "part_of" },
    { "id": "r5", "source": "proc-payment", "target": "init-recruiting", "type": "part_of" },
    { "id": "r6", "source": "proc-scholarship-review", "target": "init-scholarship", "type": "part_of" },
    { "id": "r7", "source": "proc-eligibility", "target": "init-scholarship", "type": "part_of", "label": "shared step" },
    { "id": "r8", "source": "proc-award", "target": "init-scholarship", "type": "part_of" },
    { "id": "r9", "source": "proc-enrollment", "target": "init-scholarship", "type": "part_of" },
    { "id": "r10", "source": "proc-lead-intake", "target": "proc-app-review", "type": "hands_off_to" },
    { "id": "r11", "source": "proc-app-review", "target": "proc-eligibility", "type": "hands_off_to" },
    { "id": "r12", "source": "proc-eligibility", "target": "proc-enrollment", "type": "hands_off_to" },
    { "id": "r13", "source": "proc-enrollment", "target": "proc-payment", "type": "hands_off_to" },
    { "id": "r14", "source": "proc-scholarship-review", "target": "proc-eligibility", "type": "hands_off_to" },
    { "id": "r15", "source": "proc-eligibility", "target": "proc-award", "type": "hands_off_to" },
    { "id": "r16", "source": "proc-award", "target": "proc-enrollment", "type": "hands_off_to" },
    { "id": "r17", "source": "person-james", "target": "init-recruiting", "type": "owns" },
    { "id": "r18", "source": "person-priya", "target": "init-scholarship", "type": "owns" },
    { "id": "r19", "source": "person-maria", "target": "proc-eligibility", "type": "owns", "label": "sole owner" },
    { "id": "r20", "source": "person-tom", "target": "proc-lead-intake", "type": "owns" },
    { "id": "r21", "source": "proc-lead-intake", "target": "sys-crm", "type": "uses" },
    { "id": "r22", "source": "proc-app-review", "target": "sys-crm", "type": "uses" },
    { "id": "r23", "source": "proc-scholarship-review", "target": "sys-crm", "type": "uses" },
    { "id": "r24", "source": "proc-eligibility", "target": "sys-eligibility-sheet", "type": "uses", "label": "single legacy system" },
    { "id": "r25", "source": "proc-enrollment", "target": "sys-enrollment", "type": "uses" },
    { "id": "r26", "source": "proc-payment", "target": "sys-payment", "type": "uses" },
    { "id": "r27", "source": "init-recruiting", "target": "proc-eligibility", "type": "depends_on" },
    { "id": "r28", "source": "init-scholarship", "target": "proc-eligibility", "type": "depends_on" }
  ]
}
```

### seed/expected-insight.json

```json
{
  "id": "insight-eligibility-crossover",
  "type": "crossover",
  "title": "Two initiatives depend on one person and one spreadsheet for eligibility verification",
  "entitiesInvolved": ["init-recruiting", "init-scholarship", "proc-eligibility", "person-maria", "sys-eligibility-sheet"],
  "explanation": "The Individual Recruiting Funnel and the Scholarship and Financial Aid Program both route every applicant through the same manual Eligibility Verification step, owned solely by Maria Lopez and run on one legacy spreadsheet she maintains. Neither initiative's leader sees the other's dependency, because each only described their own funnel. If Maria is unavailable, both funnels stall at the same point, so a single absence creates concentration risk across two initiatives at once.",
  "recommendedAction": "Cross-train at least one backup on eligibility verification, and move the spreadsheet logic into a documented, templated process or the enrollment system, removing the single point of failure that spans both initiatives.",
  "financialImpact": {
    "headline": "Cross-training a backup and templating the eligibility step removes a single point of failure spanning two initiatives, returns about 16 hours per week (about $34K per year), and protects roughly 120 applications per week of enrollment throughput that today depends on one person.",
    "value": 34560,
    "unit": "USD/year",
    "basis": "120 applications/week x 8 minutes manual review = 16 hours/week; 16 hours x 48 weeks x $45/hour fully loaded is about $34,560/year. Inputs are placeholders pending FP&A confirmation."
  },
  "confidence": "high",
  "needsHumanReview": false
}
```

### seed/secondary-insight-review.json

```json
{
  "id": "insight-finance-approver-suspected",
  "type": "crossover",
  "title": "Possible shared finance approver between Award Determination and Payment Processing",
  "entitiesInvolved": ["proc-award", "proc-payment"],
  "explanation": "Award Determination in the scholarship program and Payment Processing in the recruiting funnel may both require sign-off from the same finance approver, which would be a second crossover. The conversations reference a finance approval step in both flows, but Maria explicitly said she was not sure it is the same person, so the evidence is incomplete.",
  "recommendedAction": "Confirm whether the two approval steps share one approver before treating this as a real dependency.",
  "financialImpact": { "headline": "Impact not yet quantified, pending confirmation of the shared approver.", "value": 0, "unit": "USD/year", "basis": "Evidence is incomplete." },
  "confidence": "low",
  "needsHumanReview": true,
  "whatToCheck": "Ask Finance whether Award Determination and Payment Processing route to the same approver. If yes, model it as a second crossover and quantify the delay risk. If no, dismiss it."
}
```

### seed/transcripts/transcript-recruiting.md

```
# Atlas Conversation — Individual Recruiting
Participant: James Carter, Recruiting Manager

Atlas: Walk me through what happens when a new student lead comes in.
James: Leads land in our Recruiting CRM, usually from web inquiries or school events. Tom Becker and the counseling team pick them up and do the first application review right there in the CRM.
Atlas: And after the application is reviewed?
James: Then it has to go through eligibility verification before we can enroll anyone. That part is manual. We hand it off to Maria in enrollment, and she checks each applicant against the requirements.
Atlas: How does that step feel in terms of speed?
James: Honestly, it is our bottleneck. Everything piles up at Maria's verification step. Once she clears someone, enrollment processing and then payment are quick.
Atlas: Is anyone besides Maria able to do the verification?
James: Not really. It is her process. If she is out, recruiting basically waits.
```

### seed/transcripts/transcript-scholarship.md

```
# Atlas Conversation — Scholarship and Financial Aid
Participant: Priya Nair, Scholarship Program Lead

Atlas: How does a scholarship application move through your program?
Priya: Applicants apply through the same CRM, and my team does the scholarship application review. After that, we have to verify eligibility before any award goes out.
Atlas: Who handles the eligibility verification?
Priya: We send it over to the enrollment side. They run it manually against a spreadsheet. Once eligibility is confirmed, we do award determination.
Atlas: Is there any finance approval involved?
Priya: Yes. Award determination needs a finance sign-off before it is final.
Atlas: Do you know if the recruiting team uses the same verification step?
Priya: I am not sure how their side works. That is separate from us.
```

### seed/transcripts/transcript-enrollment.md

```
# Atlas Conversation — Enrollment Operations
Participant: Maria Lopez, Enrollment Coordinator

Atlas: Describe what you handle day to day.
Maria: I run eligibility verification. Every applicant has to pass through me before they can be enrolled.
Atlas: Is that for one program or several?
Maria: Both. I verify the individual recruiting applicants and the scholarship and financial aid applicants. Same check, same spreadsheet. I maintain one master eligibility spreadsheet for everything.
Atlas: Does anyone else know how that spreadsheet works?
Maria: Not really. When I took vacation last spring, both the recruiting enrollments and the scholarship awards backed up until I got back.
Atlas: Is the scholarship finance sign-off the same approver as recruiting payments?
Maria: I think finance approves both, but I am honestly not sure it is the same person.
```

---

## 7. Order of operations

1. Create the repo at `C:\Projects\Cosmos`, open it in Claude Code.
2. Place `atlas-app.html` at the root and create the `seed/` files from Section 6.
3. Add `.env` with `GEMINI_API_KEY`.
4. Run the Part A prompts (Section 8) in order, 0 to 9, letting each acceptance check pass.
5. Run the multi-process prompts (Section 9), then the delete prompts (Section 10).
6. Run the Part B enhancement prompts (Section 11) as desired.
7. Set up the closed-loop agent team (Section 12) and run the improvement loop to harden everything, especially the generate-process-map flow.

Working agreement for every prompt: build one phase, stop, run the acceptance check, and confirm before continuing. Keep diffs small. Never break the build. Never alter the demo-safe seed data.

---

## 8. Part A — core build prompts (0 to 9)

High-priority UX is built in: H1 (explain the process before the number) is in Prompt 6, H2 (session status badges) is in Prompts 1 and 2.

### Prompt 0 — Kickoff and multi-view shell
```
Read atlas-app.html and the seed/ folder in full. atlas-app.html is the visual and behavioral target. Give me a 6-line summary of the app's job and its three views before writing code.
Build Phase 0. Scaffold a Next.js app (TypeScript, App Router). Add a server-side API route that calls Gemini via the @google/generative-ai SDK using GEMINI_API_KEY, never exposed to the browser. Build the app shell from the prototype: a left sidebar with three nav items, Sessions, Live interview, and Map and analysis, that switch the main view. Empty placeholders for now. Add .env.example.
Acceptance: the app runs, the three views switch, and a test Gemini call through the API route returns text with the key server-side only.
```

### Prompt 1 — Data model and seed
```
Phase 1. Implement the data model from the playbook Section 3 in /lib/types.ts. Add a session status helper: "ready" when identity is complete and the transcript has at least 5 turns, otherwise "draft". Load the three seed sessions (James Carter / Recruiting Manager, Priya Nair / Scholarship Lead, Maria Lopez / Enrollment Coordinator, using seed/transcripts/ for turns), plus seed/graph.json and seed/expected-insight.json. Validate the graph.
Acceptance: three seed sessions load with identity and status "ready", and seed/graph.json validates (17 entities, 28 relationships). Print the counts and each session's status.
```

### Prompt 2 — Sessions view (status badges)
```
Phase 2. Build the Sessions view to match atlas-app.html: session cards (name, role, turn count, date, duration) and a transcript detail panel. Include "New interview" and "Generate process map". Render a status badge on each card, Ready green, Draft gray, Processing blue. Allow multi-select so the user can pick sessions and generate one combined map.
Acceptance: all three seed sessions render with a Ready badge, multi-select works, selecting a session shows its transcript.
```

### Prompt 3 — Interview view, identity first
```
Phase 3. Build the Live interview view to match atlas-app.html. Capture identity before process detail. Question flow: 1 name and role, 2 team, 3 what happens when work first comes to you, 4 who or what you hand off to, 5 which systems, 6 where it slows down, 7 what stalls if you are out for a week. Store answers 1 and 2 as the participant and show them in the header. Left: current question, counter, mic button. Right: transcript building, "End and save session". Stub answer capture with manual advance for now.
Acceptance: identity captured into the header, flow advances through all questions, transcript builds, "End and save" enables at the end.
```

### Prompt 4 — Gemini Speech-to-Text and save
```
Phase 4. Wire real voice capture. On mic press, record audio with MediaRecorder, send it to a server-side route that transcribes with Gemini (send the clip to the current Gemini model with a transcription instruction), return text, append as a participant turn, advance. Show a "Listening, Gemini Speech-to-Text" status. Use transcribed identity answers to fill name, role, team. On "End and save session", persist the session to Firestore or a local store and show it in Sessions.
Acceptance: speak an answer, see Gemini transcribe it, give your name and role by voice and see them populate, complete a short interview, save it, see it in the library. Key stays server-side.
```

### Prompt 5 — Generate the process map, with attribution
```
Phase 5. Wire "Generate process map". Take the selected sessions' transcripts and participant identities and run extraction (system instruction in /lib/prompts.ts) to produce a Graph. Rules: create a person entity for each participant, set role and team attributes, attribute ownership and handoff from what they describe, identify processes, systems, initiatives and relationships, invent nothing unsupported. Render as the dependency map, matching the prototype and the highlighted shared step.
Acceptance, key test: generating from the three seed transcripts produces a graph where each SME appears as a person with their role, and Eligibility Verification connects to BOTH initiatives, owned by Maria, using one spreadsheet. The crossover must emerge from combining the transcripts. Show the graph.
```

### Prompt 6 — Run analysis: explain, then find, then quantify (H1)
```
Phase 6. Add the analysis step. On "Run analysis", send the Graph to Gemini and return an Analysis with processSummary (plain-language explanation of how the process works) and insights (highest-value findings, primarily the crossover, each with explanation, recommended action, confidence, financialImpact). Render order in the panel: 1 "How this process works", 2 the crossover insight with the highlight animating on the map, 3 the dollar figure. Add /lib/finance.ts: applications/week x minutes/application gives hours; hours x weeks x hourly cost gives the annual figure. Use 120, 8, 48, $45 as editable constants, yielding about $34,560/year. Attach to the relevant insight.
Critical acceptance: run analysis five times. processSummary must describe both flows, and the crossover insight must surface the Eligibility Verification dependency matching seed/expected-insight.json every time. Show all five runs and the panel in this order.
```

### Prompt 7 — Human-in-the-loop
```
Phase 7. Show confidence on every insight. When needsHumanReview is true, render the flag, the what-to-check text, and Confirm and Dismiss (match the prototype's second card). Use seed/secondary-insight-review.json as the flagged finding shown alongside the hero. Confirm or Dismiss sets status and resolves on screen.
Acceptance: both insights render, and Confirm or Dismiss resolves the flagged one.
```

### Prompt 8 — Pipeline flow and demo safety net
```
Phase 8. Make the full pipeline flow and demo-safe. Default to the three prepared sessions and allow the prepared graph and analysis, so the hero path does NOT depend on a live Gemini call, a live mic, or the network. Keep the live paths available but separate. Sequence: open or capture a session, generate the map, run the analysis, surface the flag. Tighten layout and timing.
Acceptance: the full flow runs end to end from prepared data with zero live dependency, under the demo time limit.
```

### Prompt 9 — Hardening and run sheet
```
Final core pass. Cold-start dry run using only prepared data. List anything that could break live and fix or flag it. Confirm the Gemini key is server-side only. Then give me a 12-line demo run sheet, the exact click order from interview to insight.
```

---

## 9. Multi-process prompts

### Create and switch processes
```
Extend the app. Do not rebuild existing features. Add a layer to create and manage multiple process maps, each with its own sessions, map, and analysis. Match the visual language.
1. Use the Project type from the playbook. Scope sessions, graph, and analysis to a project. Keep an activeProjectId in state.
2. Wrap the existing K-12 data as the default seeded project, "K-12 Individual Recruiting", line of business "K-12 individual recruiting", protected true, containing the three seed sessions, the prepared graph, and the prepared analysis. It stays the demo-safe default.
3. Replace the static context label in the top bar with a project switcher dropdown listing all projects, the active one marked, with a "New process" item at the bottom.
4. "New process" opens a modal in the app's style with Process name, Line of business, and optional description. On create, add an empty Project, set it active, and go to its empty Sessions view.
5. Add a "Processes" item at the top of the nav, an overview listing all projects as cards (name, line of business, session count, map generated yes or no, analysis run yes or no, last updated, status badge) with a "New process" button. Clicking a card opens that project at Sessions. Make this the default landing view.
6. Scope everything to the active project: new interviews, generate map, run analysis. Each project remembers its own map and analysis.
Acceptance: create "Group Travel Operations", land on its empty Sessions view, add a session to it, confirm it does not appear under K-12, switch back to K-12 and confirm its data is intact, and confirm the Processes overview lists both with correct status.
```

---

## 10. Delete prompts

### Delete a process
```
Extend the app. Do not rebuild existing features. Add the ability to delete a Project. Match the visual language.
1. Add a delete control on each Processes overview card (kebab or trash on hover) and in the header project menu ("Delete this process", danger color, separated).
2. Require a confirm modal: "Delete [name]? This removes its sessions, map, and analysis. This cannot be undone." Cancel and Delete (danger).
3. On delete, remove the project and its scoped sessions, graph, and analysis. If it was active, switch to another project or the Processes overview if none remain.
4. Protect the seeded "K-12 Individual Recruiting" project: hide or disable its delete control with a tooltip "Demo project cannot be deleted."
Acceptance: create a throwaway process, delete it from the overview, confirm the modal and that its data is gone, confirm K-12 cannot be deleted, and confirm deleting the active project switches context cleanly.
```

### Delete a captured session
```
Extend the app. Do not rebuild existing features. Add the ability to delete a captured session within a project. Match the visual language.
1. Add a trash icon on each session card (on hover) and a "Delete session" option in the transcript detail panel.
2. Require a confirm modal: "Delete the session with [name]? Its transcript will be removed. This cannot be undone." Cancel and Delete (danger).
3. On delete, remove the session from the active project, update the captured count and the "from N sessions" label. If it was selected for map generation, deselect it. Do not silently regenerate the map; if one exists, leave it and show a subtle note that it may be out of date.
4. Protect the three seeded sessions: hide or disable their delete control with a tooltip "Demo session cannot be deleted."
Acceptance: add a new session, delete it, confirm the modal and that the count and label update, confirm the three seeded sessions cannot be deleted, and confirm deleting a selected session removes it from the map-generation selection.
```

---

## 11. Part B — enhancement prompts (M1 to M6)

Each is independent. Build after the core is solid.

### M1 — Interactive map nodes
```
Make map nodes clickable. On click, open a small detail card. Person: name, role, team, processes owned, handoffs, a risk score (single-point-of-failure count), recommended action. Process: initiatives that depend on it, owners, systems used, estimated hours per week if available. System: processes that use it, maintainers, whether it is a single point of failure. Initiative: processes it includes, dependencies. During analysis, have Gemini populate attributes such as hoursPerWeek where supported.
Acceptance: clicking Maria shows she owns the eligibility step and has a high risk score; clicking the eligibility step shows both initiatives depend on it.
```

### M2 — Escalate option
```
Add a third human-in-the-loop button, Escalate, alongside Confirm and Dismiss. On Escalate, show a form: who should we ask (Finance, Process owner, Leadership, Other) and an optional note. On submit, set the insight status to escalated, store escalationTarget and escalationNote, show the assignment, and add an "Escalated findings" list in the Sessions view.
Acceptance: escalate the finance-approver finding to Finance with a note, see it marked escalated and listed.
```

### M3 — Export the map
```
Add an "Export map" button with PNG, SVG, and PDF. Use html2canvas for PNG and an SVG serializer for SVG and PDF. Include the title, the legend, the risk highlighting, and for PDF a caption with the process summary and key finding.
Acceptance: export as PNG and PDF, confirm the PDF includes title, legend, highlighted crossover, and caption.
```

### M4 — Follow-up interviews
```
Add a "Record follow-up" button when viewing a session. On click, ask who you are interviewing, show AI-suggested follow-up questions derived from the previous transcript, and start with the parent session's key points as context. On save, link with parentSessionId. In extraction, when two linked sessions describe the same step differently, surface a cross-reference on the map.
Acceptance: record a follow-up to James, see suggested questions referencing his answers, save it linked, and see the link reflected when generating the map.
```

### M5 — Compare transcripts
```
Add a "Compare transcripts" button when two or more sessions are selected. Show a side-by-side of how each participant described the same step, with a center column noting alignment, difference, and what it reveals. Run a second Gemini call comparing descriptions of the same entity across participants.
Acceptance: compare James, Priya, and Maria on the eligibility step and show that all three describe the same step but neither James nor Priya knows it is shared.
```

### M6 — Process timeline
```
After generating the map, add a "Process timeline" view showing the main sequence, parallel tracks, estimated duration per step if mentioned, and bottlenecks in red. Have Gemini infer sequence and duration from the transcripts.
Acceptance: the timeline shows Lead, Application, Eligibility, Enrollment, Payment in sequence with the scholarship track in parallel, and marks eligibility as the bottleneck.
```

---

## 12. Closed-loop subagent team (6 agents)

Sets up six agents under `Cosmos/.claude/agents/` plus a shared loop workspace, driven by an orchestrator until your done-criteria are met.

### Prompt A — Scaffold the team
```
Work inside Cosmos. Create the subagent team and the loop workspace. Do not change app code in this step.
Create Cosmos/.atlas-loop/ with: done-criteria.md (empty), recommendations.md (header: id | source | area | severity | problem | recommendation | acceptance | status), backlog.md (header: id | source | priority | status | acceptance), loop-log.md (empty), and a research/ folder.
Create these files under Cosmos/.claude/agents/, each with YAML frontmatter (name, description, tools) then the system prompt.

orchestrator.md
  tools: Task, Read, Write, Bash, Glob, Grep
  prompt: You drive a closed loop that improves Atlas until every criterion in .atlas-loop/done-criteria.md is met. Each iteration: read done-criteria, recommendations, backlog, research, loop-log; if recommendations are empty or stale dispatch architect-reviewer and ux-reviewer; for any functionality bug or unknown, especially generate-process-map, dispatch researcher; triage findings into backlog with id, priority P0 to P2, acceptance, status todo; dispatch implementer for one P0 or P1 item at a time and wait for done or blocked; after each, dispatch verifier to confirm the acceptance and update backlog; check done-criteria. Stop when all met, or after 6 iterations, or when blocked needing a human, and write what is left to loop-log. Log every iteration. Never break the build. Flag destructive or large changes for approval in loop-log. Never alter the demo-safe seed data (K-12 project, three seed sessions, prepared graph and analysis). If you cannot dispatch subagents, write the next agent and prompt to loop-log and stop.

architect-reviewer.md
  tools: Read, Glob, Grep
  prompt: Review the Atlas architecture and recommend improvements. Do not write app code. Read the source, this playbook, and atlas-app.html. Assess coupling, scalability to multiple projects, state management, the Gemini route design, error and loading handling, and the generate-process-map data flow. Append to .atlas-loop/recommendations.md with id ARCH-n, area, severity, problem, recommendation, and an acceptance test. Stop when no new significant findings.

ux-reviewer.md
  tools: Read, Glob, Grep
  prompt: Review the Atlas UX. Do not write app code. Read the app, atlas-app.html, and the UX recommendations if present. Focus on pipeline clarity, how intuitive generate-process-map is (prioritize this), the insight panel order, status and empty states, loading and error feedback, and multi-project navigation. Append UX-n recommendations with problem, recommendation, and an acceptance test. Stop when no new significant findings.

researcher.md
  tools: Read, Glob, Grep, WebSearch, WebFetch
  prompt: Research the best approach for an assigned Atlas functionality problem, starting with generate-process-map being quirky and buggy. Read the code for a root-cause hypothesis, then research current best practices. Write .atlas-loop/research/<topic>.md with the problem, root-cause hypothesis, two or three options compared, a recommended approach and why, implementation steps, and references. One brief per topic.

implementer.md
  tools: Read, Write, Edit, Bash, Glob, Grep
  prompt: Implement one backlog item using its acceptance test and any matching research brief. Smallest correct change, match existing patterns. After changing code, run the build and tests and confirm the acceptance passes. Update the item to done or blocked with a reason, and note new issues in recommendations.md. Keep the build green, small diffs, never alter the demo-safe seed data, and get orchestrator approval in loop-log before any destructive or large refactor.

verifier.md
  tools: Read, Bash, Glob, Grep
  prompt: Independently verify completed items. Do not edit app code. For each item the implementer marked done, verify: 1 the build and tests pass with no new errors; 2 the ground-truth eval, generate the map from the three seed sessions and confirm the Eligibility Verification crossover surfaces matching seed/expected-insight.json five times in a row; 3 the demo-safe smoke test, the prepared path runs end to end with zero live dependency; 4 the demo-safe seed data is untouched. Report pass or fail per item in loop-log.md with evidence. On fail, set the item back to todo with a specific reason. An item is done only when you pass it.

Acceptance: all six agent files exist with valid frontmatter, the .atlas-loop workspace exists, and no app code was changed. List the files created.
```

### Prompt B — Set the goals
```
Fill Cosmos/.atlas-loop/done-criteria.md with these, adjusted to the codebase but concrete and testable:
1. The build passes with no errors and no new console errors.
2. Generate-process-map works reliably and intuitively: from the selected sessions it produces the correct graph every run, with clear loading and error states and no flaky behavior. Top priority.
3. Every P0 and P1 recommendation from architect-reviewer and ux-reviewer is implemented and its acceptance test passes.
4. Creating, switching, and deleting a process works, and deleting a captured session works, with confirmation and protection of the demo-safe seed data.
5. The demo-safe path runs end to end from prepared data with zero live dependency.
6. Every done item passed independent verification, including the five-run crossover eval and the demo-safe smoke test.
Show me the file.
```

### Prompt C — Run the loop
```
Run the orchestrator agent against Cosmos/.atlas-loop/done-criteria.md. Start by dispatching architect-reviewer and ux-reviewer to populate recommendations, and researcher on generate-process-map. Triage into the backlog, dispatch implementer item by item, verify each with verifier, and iterate until done-criteria are met or you hit a stop condition. Log every iteration. When you stop, summarize what was fixed, what passed, what is open, and what you need a decision on.
```

---

## 13. What only humans supply

Two inputs are not code and cannot be generated:

1. A verified real crossover or single point of failure from someone who runs K-12 individual recruiting, to replace the seed scenario with truth.
2. FP&A sign-off on the financial inputs (120 applications per week, 8 minutes each, $45 per hour, 48 weeks), so the dollar figure is defensible on stage.

Everything else in this playbook can be built by Claude Code and hardened by the agent loop.
```
