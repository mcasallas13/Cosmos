# Done criteria

The loop stops only when **every** criterion below is met and its check passes. Each is concrete and testable against the current codebase.

## 1. Clean build, no new console errors
- `npm run build` completes with exit code 0 — production build **and** the TypeScript check pass with no errors.
- Loading the app (`npm run dev`, `GET /` → 200) and running the core flow (open Processes → Sessions → Generate process map → Run analysis) produces **no new** browser console errors or unhandled-promise warnings versus the current baseline.
- Existing acceptance scripts still pass where offline-runnable: `npx tsx lib/validateGraph.ts` (17 entities, 28 relationships) and `npx tsx lib/phase10Check.ts` (node detail cards).

## 2. Generate-process-map is reliable and intuitive — TOP PRIORITY
- From a multi-select of sessions in the Sessions view, **Generate process map** produces the correct `Graph` **every run** (no flaky/empty/partial graphs).
  - Prepared/demo-safe path (`liveMode` off): reveals the canonical seed graph deterministically with **zero network calls** — repeatable across many runs.
  - Live path (`liveMode` on): `/api/gemini/extract` returns a graph whose every relationship source/target references a real entity id (422 on violation), with model fallback on 503/429; Eligibility Verification links **both** initiatives, owned by Maria, on one spreadsheet (`npx tsx lib/phase5Check.ts` PASS with dev server running).
- The flow is **clear and intuitive**: the user can tell what is selected, what "Generate" will do, and what beat they are on (capture → map → analysis). The quirky/unintuitive UX flagged by ux-reviewer is resolved and its acceptance test passes.
- **Loading state**: a visible, non-blocking indicator while the map builds. **Error state**: a user-facing, recoverable error message on extract failure (no silent failure, no stuck spinner).
- The map's **MAY BE OUT OF DATE** staleness badge behaves correctly after a session is deleted (set on delete when a map is shown, cleared on the next Generate).

## 3. All P0/P1 review findings closed
- Every recommendation with severity **P0 or P1** from `architect-reviewer` (ARCH-n) and `ux-reviewer` (UX-n) in `.atlas-loop/recommendations.md` is implemented, its backlog item status is **done**, and its stated acceptance test passes.
- No P0 or P1 item remains in status `todo`, `in progress`, or `blocked`.

## 4. Project & session management with confirmation + seed protection
- **Create** a project (name / lineOfBusiness / description) via the modal → it appears in the switcher and Processes overview and lands per the existing flow.
- **Switch** projects via `ProjectSwitcher` → the active workspace, sessions, and any revealed map/analysis hydrate correctly without re-running beats.
- **Delete** a user project → `ConfirmDeleteModal` confirms; on confirm the project + its scoped sessions are removed, `DELETE /api/projects?id=…` unlinks the file and scoped saved sessions, and the active view falls back to another project (else K-12) on the Processes overview.
- **Delete** a captured session → `ConfirmDeleteModal` confirms; on confirm the session drops from `savedSessions` (count, Generate-map label, and selection all update), `DELETE /api/sessions?id=…` removes the file, and the map is not silently rebuilt (staleness badge instead).
- **Seed protection holds**: the K-12 workspace (`isProtectedProject`) and the three seed sessions (id prefix `seed-`) show disabled controls with the correct tooltips, and both APIs reject deletion with **400**.

## 5. Demo-safe path runs end-to-end with zero live dependency
- With `liveMode` **off** (default), the full hero flow — Processes → open/select sessions → Generate process map → Run analysis → human-in-the-loop flag — runs to completion using only prepared data.
- No Gemini call, no microphone, and no blocking network request is required on this path; the only same-origin call (`GET /api/sessions` on mount) is try/caught and falls back to the seed library.
- The hero finding still surfaces from prepared data: processSummary names both initiative flows and the crossover surfaces Eligibility Verification (both initiatives, Maria, the shared spreadsheet, $34,560/yr).
