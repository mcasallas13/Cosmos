# Atlas Project Insights

Atlas turns messy, human process knowledge into a map of how work actually flows — and surfaces the hidden risk buried inside it.

You interview the people who run a process. Atlas transcribes those conversations, uses Gemini to extract the **people, systems, processes, and initiatives** involved, draws the dependency graph between them, and then analyzes that graph to find the one finding that matters: a **single point of failure** that no individual interviewee could see on their own.

> Built for the Eurazeo AI Hackathon (Google, Paris — July 9–10 2026).

## The hero insight

The seed demo models a K-12 recruiting org with two separate initiatives — **teacher recruiting** and **scholarship awards**. On the surface they're unrelated. But when you combine all three interview transcripts, Atlas reveals that **both initiatives secretly depend on the same person (Maria Lopez) running the same legacy spreadsheet** for eligibility verification.

That shared step is a **$34,560/year single point of failure** — invisible to each team individually, obvious once the graph is drawn. That's the whole point of the product: the insight only emerges from the *combination* of perspectives.

## How it works

```
interview transcripts
        │
        ▼
  Gemini extraction  ──►  dependency graph  ──►  React Flow map
        │                       │
        │                       ▼
        │               Gemini analysis  ──►  insight panel
        │                       │              (trust → insight → action)
        ▼                       ▼
   people / systems        the crossover finding
   processes / initiatives  + financial impact
```

1. **Capture** — read seed transcripts, or record a live voice interview (browser mic → Gemini speech-to-text).
2. **Generate map** — Gemini extracts entities and relationships into a graph; React Flow + dagre lay it out.
3. **Run analysis** — Gemini explains how the process works and the crossover risk is detected deterministically over the graph, so the hero finding surfaces every run.
4. **Human-in-the-loop** — a secondary, lower-confidence finding is flagged for a human to confirm or dismiss.

## Tech stack

- **[Next.js 16](https://nextjs.org/)** (App Router, Turbopack) + **React 19** + **TypeScript**
- **[@xyflow/react](https://reactflow.dev/)** (React Flow) with **[dagre](https://github.com/dagrejs/dagre)** auto-layout for the dependency map
- **[Google Generative AI](https://ai.google.dev/)** (`@google/generative-ai`) — Gemini for extraction, analysis, and transcription
- Local JSON files under `seed/` stand in for a database (a Firestore stand-in for the hackathon)

## Getting started

### Prerequisites

- Node.js 20+
- A Google Gemini API key ([get one here](https://aistudio.google.com/apikey))

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure your API key
cp .env.example .env.local
# then edit .env.local and set GEMINI_API_KEY=...

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note on models:** the free tier of `gemini-2.0-flash` is easily exhausted; the app defaults to `gemini-2.5-flash` and falls back through a list of models automatically on rate-limit (429) or overload (503) errors. Set `GEMINI_MODEL` in `.env.local` to override the default without touching code.

The **default view is fully offline and demo-safe** — it reveals prepared data with no Gemini call, no microphone, and no blocking network. Live extraction/analysis and voice capture are opt-in.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server at `localhost:3000` |
| `npm run build` | Production build + TypeScript check |
| `npm run start` | Serve the production build |

Acceptance checks (run with `npx tsx`):

| Command | Verifies |
|---|---|
| `npx tsx lib/validateGraph.ts` | Seed graph is valid (17 entities, 28 relationships) |
| `npx tsx lib/phase1Check.ts` | Seed sessions load "ready" + graph validates |
| `npx tsx lib/phase10Check.ts` | Node detail cards derive correctly (offline) |
| `npx tsx lib/phase5Check.ts` | Identity-aware extraction (needs dev server) |
| `npx tsx lib/phase6Check.ts` | Analysis surfaces the crossover 5× (needs dev server) |

## Project structure

```
app/
  page.tsx              Server component — loads prepared seed data
  api/gemini/           Extraction, analysis, transcription routes (key stays server-side)
  api/projects/         Multi-workspace project store API
  api/sessions/         Captured-session store API
components/
  AtlasApp.tsx          Client shell — views, projects, delete flows
  DependencyMap.tsx     React Flow map + clickable node detail cards
  InsightPanel.tsx      Trust → insight → action panel
  InterviewCapture.tsx  Live voice interview stage
lib/
  gemini.ts             Shared Gemini client + model fallback
  prompts.ts            System prompts (the main lever for output quality)
  finance.ts            Financial-impact computation ($34,560/yr)
  entityDetail.ts       Pure graph derivations for node detail cards
  types.ts              Canonical Entity / Graph / Insight / Project types
seed/                   Transcripts, ground-truth graph, and JSON data stores
```

## Security

- The Gemini API key **never reaches the browser** — every Gemini call runs in a Next.js API route, and browser audio is sent to the server as raw bytes for transcription.
- `.env*.local` and the real key file are gitignored; only `.env.example` (a template) is committed.

## Features

- **Dependency map** — interactive React Flow graph, color-coded by type (initiative / process / person / system), with auto-layout and clickable node detail cards (roles, ownership, single-point-of-failure risk scores).
- **Insight panel** — renders in trust → insight → action order: how the process works, the crossover finding with a confidence meter, and the animated financial impact.
- **Human-in-the-loop** — confirm/dismiss low-confidence findings on screen.
- **Multi-workspace projects** — each process is its own workspace with scoped sessions, map, and analysis. The seeded K-12 demo workspace is protected and can never be deleted.
- **Live voice capture** — record interviews in the browser and build a map from them.

## Scope

This is a focused hackathon demo. **Out of scope:** authentication, real databases, multi-company/tenant support, heat maps, automation discovery, and any insight path beyond the single hero finding. Multiple *workspaces* within the one demo company are supported (workspace separation, not multi-tenancy).
