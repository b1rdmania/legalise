# Audit Grouping / Decision Timeline v1 — mini-plan

**Status:** v1 mini-plan for Reviewer redline. Do not build until ratified.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28
**Goal:** make the supervised-autonomy chain **readable**. Supervisor Review v1 just created the important decision rows (`review.*`); a flat chronological firehose buries them. This pass surfaces decision points, adds class filters, and groups invocation chains — so the proof surface actually shows the loop.

## Non-negotiables (from the brief)
- **Mostly frontend.** No backend work unless it hits a real filter/query gap.
- **Do not invent a new audit source.** Reuse the existing reconstruction entries + `review.*` rows.
- Reuse the existing reconstruction endpoint and its already-present filters.

## Grounding (what already exists — no new substrate needed)
- `GET /api/matters/{slug}/audit` reconstruction (and `/api/admin/audit`) unions three sources: `audit`, `state_machine.transition.*`, `advice_boundary.decision.*`.
- `TimelineEntry` already carries: `source`, `occurred_at`, `action`, `actor`, `matter_id`, `module_id`, `capability_id`, `payload`, `refs`, `source_row_id`.
- The endpoint **already supports** `include` (source filter), `action`, `invocation_id`, `since`/`until`, `cursor`/`limit`.
- `review.*` rows ride the `audit` source and carry `review_id`, `artifact_id`, `invocation_id`, `artifact_hash` in `payload` — everything needed to call them out and chain them.
- Frontend surfaces: `ReconstructionView` (matter, primary target) and `AdminAuditView` (workspace, secondary).

So this is a frontend read over data we already have. The action namespace is the grouping key.

## The work

### AT-1 — Row-class derivation (the lane taxonomy)
A pure frontend function `classifyEntry(entry): RowClass` from `action` prefix + `source` + `payload`:

| Class | Matches |
|---|---|
| `review` | `review.*` (the new decision rows — visually called out) |
| `module` | `module.*` (install/enable/ceremony), invocation start/end |
| `model` | `model.*` (model.invoked / model call) |
| `artifact` | artifact-write actions / `resource_type == "matter_artifact"` |
| `grant_role` | `grant.*`, `user.role.changed`, capability grant/revoke |
| `advice` | `advice_boundary.decision.*` |
| `blocked_denied` | action/payload status `blocked` / `denied` / `*.rejected` |
| `error` | `*.failed` / error-coded payloads |
| `system` | everything else (http.*, reads, routine `state_machine.transition.*`) |

"Decision points" = `review`, `advice`, `grant_role`, `blocked_denied` (+ `module` enable/deny). `system` is background. This is the single load-bearing mapping; keep it in one tested module.

### AT-2 — Decision lane + filters (frontend)
- A **decision-point lane**: decision-class rows shown prominently; `system` rows collapsed behind a "show background activity" toggle.
- **Class filter chips** (review / module / model / artifact / grant / blocked / error) — facet the loaded timeline client-side. Where the firehose spans pages, reuse the **existing server `action`/`include` filters** for a precise server-side narrow (no new params).
- `review.*` rows get a distinct visual treatment (the supervised-autonomy beat).

### AT-3 — Invocation-chain grouping (frontend)
Group rows by `invocation_id` (present on `audit` + advice rows; absent on `state_machine` — see limitation) into a readable chain:

> module invoked → model called → artifact created → review requested → approved/rejected/overridden

Rendered as a collapsible group with the decision outcome summarised at the head. Ungroupable rows (no `invocation_id`) stay in the chronological lane.

### AT-4 — Keep deep links working
`?invocation_id=` and `?action=` deep-links (from ArtifactDetail, ApprovalsTab, the ceremony banner) must still land correctly — pre-select the matching filter/chain on load. No URL contract changes.

## Reuse audit
- **Reuse:** the reconstruction endpoint + its `include`/`action`/`invocation_id` filters; `TimelineEntry` fields; `review.*` payloads; existing `ReconstructionView` / `AdminAuditView`; existing deep-link params.
- **Net-new:** one `classifyEntry` frontend module + the lane/filter/grouping UI. No new audit source, no new model.
- **Build-custom justification:** none required — this is presentation over existing data.

## Flagged limitation (not a blocker)
`state_machine.transition.*` rows carry **no `invocation_id`** (the endpoint doc notes this). They cannot join invocation chains and will render in the chronological lane, class `system`/`module` as appropriate. Acceptable for v1; a future backend pass could thread an invocation id onto transitions if it proves necessary. **Log as a known gap, do not build it now.**

## Open questions for Reviewer
1. **Filter scope:** client-side facet on the loaded page (proposed, simplest) vs always server-side via the existing `action`/`include` params? Recommendation: client-side facet + server-side narrow only when a single class/chain is selected.
2. **Scope of surfaces:** matter `ReconstructionView` only for v1 (proposed), or also `AdminAuditView`? Recommendation: matter first (that's where review lives); apply the same `classifyEntry` to admin in a fast follow if it reads well.
3. **Background rows:** collapsed-by-default behind a toggle (proposed) vs a dedicated "system" filter chip only?

## Build substeps (frontend-first; no backend unless Q1 forces it)
- **AT-1** — `classifyEntry` module + unit tests (pure function, the load-bearing mapping).
- **AT-2** — decision lane + class filter chips + `review.*` callout in `ReconstructionView`.
- **AT-3** — invocation-chain grouping.
- **AT-4** — deep-link pre-selection; focused test that `?invocation_id=`/`?action=` still resolve.

Verification per [[legalise-verification-cadence]]: focused tests + typecheck per substep; full frontend vitest + build at the gate; e2e at merge. No backend suite needed unless Q1 pulls a server-side filter param in (then add an API test).
