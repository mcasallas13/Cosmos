# Atlas Project Insights — Build Spec for Claude Code
**Purpose:** A spec-driven design Claude Code can build against to produce the hackathon demo.
**Event:** Eurazeo AI Hackathon, Google Paris, July 9 to 10, 2026. Google Cloud and Gemini are mandated.
**One-line goal:** Ingest workflow data for K-12 individual recruiting, render a dependency map, and surface one validated operational insight (a hidden crossover or single point of failure) with a defensible dollar figure and a human-in-the-loop flag.

---

## 1. Goal and Non-Goals

**Goal:** A working web app that demonstrates, end to end, the path from conversational and document input to a management-ready operational insight, rendered visually, for the K-12 individual recruiting line of business.

**Non-goals (do not build):**
- Not the full Atlas voice-interview capture pipeline. That already exists. This app consumes data Atlas produces.
- Not a general RAG or document-search tool. The engine is Gemini reasoning over a structured dependency graph, not retrieval.
- Not real authentication, multi-tenant, or production infrastructure.
- Not the broader platform (heat maps at scale, automation discovery, etc.). One insight path only.

---

## 2. The Demo the App Must Support (anchor)

The app must drive a three-beat demo:

1. **Capture (short).** Show input arriving: pre-captured conversation transcripts plus supporting documents loading. Optional live sliver if time and approvals allow.
2. **Insight reveal (the wow).** The dependency map renders, then highlights a crossover: two initiatives that secretly depend on the same person or system. The app explains why it matters and recommends an action, with a dollar figure attached.
3. **Human-in-the-loop.** The app visibly flags an uncertain finding as "needs human review" with what a person should check, proving augmentation not automation.

Everything in this spec serves those three beats.

---

## 3. Architecture and Stack

| Layer | Choice | Notes |
|---|---|---|
| App framework | Next.js (React + API routes) | Single app, frontend and backend together, deploys to Cloud Run or Firebase |
| AI model | Gemini via `@google/generative-ai` SDK | Mandated. Vertex AI is the alternative if the team prefers |
| Graph visualization | React Flow (`@xyflow/react`) | Interactive node-and-edge dependency map, highlight on insight |
| Data source | Google Drive folder for the demo; local seed JSON for the build | Drive loader is optional, see Phase 3 |
| Storage | JSON files (graph and insights) | No database needed for the demo |
| Deploy target | Cloud Run or Firebase Hosting | Keep it in-ecosystem |
| API key handling | Server-side only, in an API route or Secret Manager | Never expose the Gemini key in the browser |

**Data flow:** input files (transcripts + docs) -> Gemini extraction -> dependency graph (JSON) -> Gemini insight analysis -> insight object (JSON) -> React Flow map + insight panel.

---

## 4. Data Model

Build these as TypeScript types and use them throughout.

```ts
// A node in the dependency graph
type Entity = {
  id: string;
  type: "person" | "process" | "system" | "initiative";
  name: string;
  attributes?: Record<string, string>; // e.g. { role: "Enrollment Coordinator", team: "K-12 Recruiting" }
};

// An edge in the dependency graph
type Relationship = {
  id: string;
  source: string;        // Entity.id
  target: string;        // Entity.id
  type: "depends_on" | "owns" | "hands_off_to" | "uses" | "part_of";
  label?: string;
};

type Graph = {
  entities: Entity[];
  relationships: Relationship[];
};

// The management insight the demo is built to surface
type Insight = {
  id: string;
  type: "crossover" | "single_point_of_failure" | "concentration";
  title: string;                  // plain-language finding
  entitiesInvolved: string[];     // Entity.id[]
  explanation: string;            // why it matters operationally
  recommendedAction: string;      // do X
  financialImpact: {
    headline: string;             // one defensible sentence with a number
    value: number;
    unit: string;                 // e.g. "USD/year"
    basis: string;                // the assumptions behind the number
  };
  confidence: "high" | "medium" | "low";
  needsHumanReview: boolean;
  whatToCheck?: string;           // shown when needsHumanReview is true
};
```

---

## 5. Seed Scenario (K-12 Individual Recruiting)

Build and validate against this concrete scenario. **Replace with real, team-validated K-12 data before the event, but keep the same shape.** The planted finding must be a true overlap, confirmed with someone who runs the process.

**Two initiatives that share a hidden dependency:**
- Initiative A: **Individual Recruiting Funnel** (lead, application, eligibility verification, enrollment, payment).
- Initiative B: **Scholarship / Financial Aid Program** (application, eligibility verification, award, enrollment).

**The planted crossover / single point of failure:**
Both initiatives route through one manual step, **Eligibility Verification**, owned by a single person, the **Enrollment Coordinator**, using one legacy **Eligibility Spreadsheet**. Neither initiative's leader sees that the other depends on the same person and system. If that coordinator is unavailable, both funnels stall.

This is a crossover (two initiatives connected) and a single point of failure (one person and system) at once. That is the reveal.

Provide this as `seed/graph.json` (entities and relationships) and a ground-truth `seed/expected-insight.json` so extraction and analysis can be validated against known truth (eval anchor).

---

## 6. The Two Gemini Calls

### 6a. Extraction: transcripts and docs -> Graph
System instruction (template):
> You extract operational structure from workplace conversation transcripts and documents. Identify entities of type person, process, system, and initiative, and the relationships among them (depends_on, owns, hands_off_to, uses, part_of). Return only valid JSON matching the provided Graph schema. Do not invent entities not supported by the input.

Validation: the returned graph must contain the known entities and the shared Eligibility Verification edge from both initiatives. Test against the seed transcripts.

### 6b. Analysis: Graph -> Insight
System instruction (template):
> You are an operations analyst. Given a dependency graph, find the single highest-value management insight: a crossover where two initiatives depend on the same entity, a single point of failure, or a concentration of activity. Return one Insight as JSON. Explain why it matters operationally, recommend a concrete action, and set a confidence level. If evidence is thin, set needsHumanReview to true and state what to check.

Validation: against the seed graph, the analysis must surface the Eligibility Verification crossover every run. If it does not, constrain the prompt or pre-rank candidate findings. **The hero finding cannot be left to chance.**

---

## 7. Financial Model (the committed number)

Attach a defensible dollar figure to the finding. Inputs are placeholders; **confirm with FP&A before the event.**

| Input | Placeholder | Confirm with |
|---|---|---|
| Applications through manual verification per week | 120 | Recruiting ops |
| Minutes of manual review per application | 8 | Coordinator |
| Coordinator fully loaded cost per hour | $45 | Finance |
| Weeks per year active | 48 | Standard |

**Worked example (replace with real inputs):**
- 120 apps × 8 min = 16 hours per week of one person on a manual gate.
- 16 hrs × 48 weeks × $45 = about **$34,500 per year** of coordinator time on one manual step.
- That step gates two initiatives, so the risk is not just cost, it is throughput: about 120 applications per week across both funnels depend on one person.

**Headline for the app and the stage (one line, committed):**
> Cross-training a backup and templating the eligibility step removes a single point of failure spanning two initiatives, returns about 16 hours per week (about $34K per year), and protects roughly 120 applications per week of enrollment throughput that today depends on one person.

Store this in the Insight's `financialImpact`. One number, assumptions stated, no hedging.

---

## 8. Human-in-the-Loop Spec

- Every Insight carries a `confidence` level, shown on screen.
- When `needsHumanReview` is true, the insight panel shows a clear flag and `whatToCheck` text, for example: "Confirm with the Enrollment Coordinator whether the scholarship path uses the same spreadsheet, or a separate copy."
- Include at least one finding in the demo that triggers this flag, so criterion 4 is visible, not just claimed.
- Framing in all UI copy: a tool that helps leaders support their teams, never surveillance or replacement.

---

## 9. Build Phases (sequenced for Claude Code)

Build in order. Each phase has acceptance criteria. Do not advance until they pass.

**Phase 0 — Scaffold.** Next.js app, server-side Gemini call wired through an API route, env var for the key, basic two-pane layout (map left, insight panel right).
- Accept: app runs locally, a test Gemini call returns text through the API route, key is not in client code.

**Phase 1 — Data model and seed.** Implement the types. Add `seed/graph.json` and `seed/expected-insight.json` for the K-12 scenario.
- Accept: seed graph loads and validates against the schema.

**Phase 2 — Dependency map.** Render the seed graph with React Flow. Color nodes by type. Make it readable and presentable.
- Accept: the map shows both initiatives and the shared Eligibility Verification node and edges, laid out clearly.

**Phase 3 — Extraction (ingest).** Add the extraction Gemini call. Input: sample transcripts plus docs in `seed/transcripts/`. Output: a Graph. Optional: load source files from a Google Drive folder.
- Accept: extraction on the seed transcripts produces a graph containing the known entities and the shared verification dependency.

**Phase 4 — Insight analysis (the wow).** Add the analysis Gemini call. Output an Insight. Render it in the panel, and highlight the involved nodes and edges on the map (animate the crossover).
- Accept: analysis on the seed graph surfaces the Eligibility Verification crossover every run, with explanation and recommended action, and the map highlights it.

**Phase 5 — Financial layer.** Compute and display the `financialImpact` headline and number with the assumptions from Section 7.
- Accept: the insight panel shows the committed dollar figure and its basis.

**Phase 6 — Human-in-the-loop.** Show confidence on every insight and the review flag plus `whatToCheck` when set. Ensure one demo finding triggers it.
- Accept: a flagged finding renders the review prompt visibly on screen.

**Phase 7 — Demo polish and safety net.** Default to loading the prepared, validated dataset (reliable path). Add an optional "live ingest" toggle. Sequence the UI to support the three beats. Tighten layout, timing, and the highlight animation.
- Accept: the full three-beat flow runs start to finish from prepared data without any live dependency, in under the demo time limit.

---

## 10. Suggested File Structure

```
/app
  /api/gemini        # server-side Gemini calls (extraction, analysis)
  page.tsx           # two-pane layout
/components
  DependencyMap.tsx  # React Flow map
  InsightPanel.tsx   # finding, action, $, confidence, human flag
/lib
  types.ts           # Entity, Relationship, Graph, Insight
  prompts.ts         # extraction and analysis system instructions
  finance.ts         # ROI calculation from Section 7
/seed
  graph.json
  expected-insight.json
  /transcripts       # sample conversation input
```

---

## 11. Out of Scope (do not build)

Voice capture, real auth, databases, multi-company support, heat maps at scale, automation discovery, redundancy analysis, and any insight path beyond the single hero finding. Demonstrate the engine, not the platform.

---

## 12. Demo-Day Reliability

- The app's default state loads prepared, ground-truth-validated data. The hero insight must not depend on a live model call, a live mic, or the network.
- Record a screen capture of a perfect run as a fallback, identical to the live flow. This lives outside the app.
- Live ingestion, if shown at all, is a short opening sliver, not the moment the win depends on.

---

## 13. Open Inputs to Confirm Before Building Final

- Real K-12 individual recruiting process data, and a verified real crossover or single point of failure to replace the seed scenario.
- FP&A sign-off on the financial inputs in Section 7.
- ElevenLabs approval status. If denied, the capture beat uses Google Speech-to-Text or pre-captured transcripts. The hero path is unaffected either way.
