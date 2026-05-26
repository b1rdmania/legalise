# HANDOVER — Phase 14 E Reconstruction DONE

**Date:** 2026-05-26
**Branch:** `runtime-rewrite`
**Plan ratified at:** `7258cf7` (v2). **A0:** `d98a6a2`. **A:** `fb80cb9`. **B:** `d534d59`. **C:** `6b7d23c`. **D:** `9406ef0`.
**Reviewer brief:** "implement `/matters/{slug}/audit` against `GET /api/matters/{slug}/audit/reconstruction`, honour `?invocation_id=...`, render the canonical timeline, and wire existing audit links into it. No admin, settings, async, or new backend unless the reconstruction endpoint proves a real gap."

## What landed

A real `/matters/{slug}/audit` page. Every deep-link Phase 14 B/C/D pinned now resolves to meaningful content.

### `ReconstructionView` (`src/matter/ReconstructionView.tsx`)

Page surface against the Phase 5 reconstruction endpoint:

- Header + matter slug + a one-paragraph explainer naming the three substrate sources (audit / state_machine / advice_boundary).
- Active-filter chips rendered when the URL carries `?invocation_id=…` or `?action=…`. Each chip has a `×` that links back to the page minus that param. The chip names the filter literally (`invocation_id=`, `action=`) so the user always knows what's being narrowed.
- Source-filter chips (one per source) — clicking toggles the `include` param sent to the substrate. The page refetches when the source set changes. At least one source is always selected (the last chip is uncloseable).
- Timeline rows render: source pill (substrate vocabulary verbatim), action (monospace), `module_id`, `capability_id`, occurred_at, and actor role + truncated user_id. Click to expand → payload + refs blocks as pretty-printed JSON.
- Cursor pagination via `next_cursor` → "Load more" appends rows; the cursor from page N is passed into the page N+1 fetch.
- Empty / loading / error states all surface inline with the substrate message.

### Router (`src/router/index.tsx`)

`matterAuditRoute` swapped from `PlaceholderPage` to the real component. The route now has a `validateSearch` schema accepting `{ invocation_id?: string, action?: string }` — that's the query-param contract Phase 14 B (banner reference), C (posture banner future link), and D (invocation result panel + artifact detail) all pinned.

The route is also re-exported so `ReconstructionView` can use the typed `useSearch` hook (`matterAuditRoute.useSearch()`).

### API client (`src/lib/api.ts`)

Added:
- `ReconstructionSource` type and `ALL_RECONSTRUCTION_SOURCES` constant — substrate-verbatim values (`audit`, `state_machine`, `advice_boundary`).
- `TimelineActor`, `TimelineEntry`, `ReconstructionResponse` interfaces matching the Phase 5 `TimelineEntryOut` + `ReconstructionResponse` shapes.
- `getReconstruction(slug, { since?, until?, include?, cursor?, limit? })` — encodes the include list as `audit,state_machine,advice_boundary` per substrate.

## Substrate finding filed

**14-E-#1 — no server-side filter for `invocation_id` / `action` on reconstruction.** The Phase 5 endpoint honours `since`, `until`, `include`, `cursor`, `limit` only. The frontend filters by `invocation_id` and `action` client-side as the documented fallback (POSTURE_GATE_UX.md flagged this scenario in advance). Real UX hole: a deep-link to a single `invocation_id` on a dense matter timeline may need several "Load more" clicks before the row appears — client-side filtering is correct *within the loaded window*, not across pages.

Proposed substrate-side shape in `BACKEND_GAP_AUDIT.md`:

```
GET /api/matters/{slug}/audit/reconstruction
  ?invocation_id=<uuid>           # match payload.invocation_id OR refs.invocation_id
  &action=<string>                # exact match on action column
  &since=…&until=…&include=…&cursor=…&limit=…
```

Implementation lives in `app.core.audit_reconstruction.reconstruct`. Backwards-compatible (both params optional).

**Status:** filed. Frontend filtering swaps to server-side without churn when the substrate adds the params — the chip + clear UX is identical regardless.

## Audit-the-auditor

Per `AUDIT_EMISSION_MAP.md` v3, visiting `/api/matters/{slug}/audit/reconstruction` makes the substrate emit `audit.reconstruction.viewed`. Phase 14 E **does not invent this row** — calling `getReconstruction` is sufficient. The row appears in subsequent loads of the same page (the "audit the auditor" property).

## Test coverage

6 new tests in `ReconstructionView.test.tsx`. Total frontend test count: **95 passing** (up from 89).

- Renders timeline rows with source pill, action verbatim, and actor info
- `?invocation_id=…` filters by `payload.invocation_id`
- `?invocation_id=…` also matches `refs.invocation_id` (substrate carries it in either depending on the action)
- `?action=…` filters by exact action match
- Source-chip toggle refetches with the correct `include` list
- Cursor pagination: page 1 → "Load more" → page 2; the cursor is passed through

The test mount uses the **production router definition** (re-exported `routeTree` from `src/router/index.tsx`), so `validateSearch` + `useSearch` + `useParams` are exactly what ships. Memory history isolates the test from `window.location`.

## Verification

- `npm run typecheck` — clean.
- `npm test` — **95/95**.
- `npm run build` — clean.
- Backend untouched (finding 14-E-#1 documented, no substrate changes).

## Reviewer-narrow discipline — what this DOES NOT do

- **No admin / global audit view.** `/admin/audit` from Phase 14 B's redline is still NOT shipped; finding 14-B-#2 remains open. The reconstruction view is matter-scoped only.
- **No settings export.** No CSV/JSON download of the timeline. Phase 14 G or beyond.
- **No async polling.** Page does a single fetch + pagination on demand. Live tail / websocket is out of scope.
- **No new audit emissions.** Substrate emits `audit.reconstruction.viewed`; UI never invents.
- **No backend changes.** Finding 14-E-#1 filed; client-side filter is the fallback.
- **No reconstruction deep-links from this page to elsewhere.** The Timeline rows expand payload/refs JSON — no buttons that re-navigate. Phase 14 B/C/D deep-link INTO this view; this view doesn't deep-link OUT.

## Acceptance vs ACCEPTANCE.md

- **§1 (registered → run module → reconstruction).** Complete end-to-end. The four-criteria evaluator path now resolves: A (home) → B (install) → C (grant) → D (run + artifacts) → E (reconstruction).
- **§5 (every journey achievable through UI).** Journey 11 reachable.
- **§8 (reconstruction deep-linkable from every relevant page).** Pinned by tests in earlier sub-steps; verified here that those deep-links resolve to filtered timeline rows.
- **§11 (no hidden failures).** Loading / error / empty states are all explicit.
- **§14 (no diverged vocabulary).** Source values, action strings, payload keys all rendered verbatim from the substrate.

## Next sub-step

**Phase 14 F — admin lifecycle.** `/admin/users` + `/admin/users/{id}`. Smaller surface than E, but worth running through Reviewer to lock the `{role}` body shape per the Phase 14 v2 plan decision table. Phase 14 G then closes out (settings polish + cross-cutting).
