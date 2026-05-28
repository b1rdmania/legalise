# Audit Grouping / Decision Timeline v1 — mini-plan

**Status:** RATIFIED 2026-05-28 with redlines applied (below). Build AT-1 → AT-4.
**Branch:** `phase-17-crm-pass`
**Date:** 2026-05-28
**Goal:** make the supervised-autonomy chain **readable**. Supervisor Review v1 just created the important decision rows (`review.*`); a flat chronological firehose buries them. This pass surfaces decision points, adds class filters, and groups invocation chains — so the proof surface actually shows the loop.

## Ratification redlines (Reviewer, 2026-05-28) — applied, all verified against the code

- **P1 artifact classification was wrong** — fixed. Artifact writes emit **no audit row by design**; the *only* audit rows carrying `artifact_id` today are the `review.*` rows (`app/core/reviews.py`). So **`artifact` is not an audit class**. The artifact is the **output node of an invocation chain** (AT-3), resolved by joining `invocation_id` to the artifacts list / the artifact deep-link — not a timeline lane or filter chip. Removed from the precedence table and the filter set.
- **P1 class precedence** — pinned ordered table added (AT-1). `classifyEntry` returns the first matching class in order.
- **P2 grant/role real names** — `module.grant.created`, `module.grant.revoked`, `user.role.changed` (not `grant.*`).
- **P2 advice dual names** — both `advice_boundary.check.*` (audit rows) **and** `advice_boundary.decision.*` (reconstruction rows). Verified both exist.
- **P2 endpoint** — the real surface is `GET /api/matters/{slug}/audit/reconstruction` (not the `/audit` page route).

## Non-negotiables (from the brief)
- **Mostly frontend.** No backend work unless it hits a real filter/query gap.
- **Do not invent a new audit source.** Reuse the existing reconstruction entries + `review.*` rows.
- Reuse the existing reconstruction endpoint and its already-present filters.

## Grounding (what already exists — no new substrate needed)
- `GET /api/matters/{slug}/audit/reconstruction` (and the workspace `/api/admin/audit` reconstruction) unions three sources: `audit`, `state_machine.transition.*`, `advice_boundary.decision.*`.
- `TimelineEntry` already carries: `source`, `occurred_at`, `action`, `actor`, `matter_id`, `module_id`, `capability_id`, `payload`, `refs`, `source_row_id`.
- The endpoint **already supports** `include` (source filter), `action`, `invocation_id`, `since`/`until`, `cursor`/`limit`.
- `review.*` rows ride the `audit` source and carry `review_id`, `artifact_id`, `invocation_id`, `artifact_hash` in `payload` — everything needed to call them out and chain them.
- Frontend surfaces: `ReconstructionView` (matter, primary target) and `AdminAuditView` (workspace, secondary).

So this is a frontend read over data we already have. The action namespace is the grouping key.

## The work

### AT-1 — Row-class derivation (the lane taxonomy + pinned precedence)
A pure frontend function `classifyEntry(entry): RowClass` from `action` + `source` + `payload`. Several actions match more than one class (`review.rejected` is both `review` and a denial; `module.ceremony.rejected` is both `module` and a denial; `module.grant.revoked` is both `module` and `grant_role`; `advice_boundary.*.blocked` is both `advice` and a denial). **`classifyEntry` returns the FIRST match in this pinned order** (drift-proof — change only here, with a test):

| # | Class | Matches (real action strings, verified) |
|---|---|---|
| 1 | `error` | action ends `.failed`; payload carries an `error`/`error_code` |
| 2 | `review` | `review.requested` / `review.approved` / `review.rejected` / `review.changes_requested` / `review.overridden` (the supervised-autonomy beat — visually called out) |
| 3 | `blocked_denied` | action ends `.blocked` / `.denied` / `.rejected` (e.g. `module.ceremony.rejected`, `module.denied`, `advice_boundary.check.blocked`/`.denied`, `advice_boundary.decision.blocked`/`.denied`); or payload status blocked/denied |
| 4 | `grant_role` | `module.grant.created`, `module.grant.revoked`, `user.role.changed` |
| 5 | `advice` | `advice_boundary.check.*` (audit) **and** `advice_boundary.decision.*` (reconstruction) |
| 6 | `model` | `model.*` (e.g. `model.invoked`) |
| 7 | `module` | `module.*` (install / `module.enabled` / ceremony steps) not already caught above |
| 8 | `system` | everything else: `http.*`, reads, routine `state_machine.transition.*`, `audit.reconstruction.viewed` |

"Decision points" = `error`, `review`, `blocked_denied`, `grant_role`, `advice` (+ `module.enabled`/`module.denied`). `system` is background. **No `artifact` class** — artifacts emit no audit row; they surface as the chain output node (AT-3), not a lane. This table is the single load-bearing mapping; keep it in one unit-tested module.

### AT-2 — Decision lane + filters (frontend)
- A **decision-point lane**: decision-class rows shown prominently; `system` rows collapsed behind a "show background activity" toggle.
- **Class filter chips** (review / blocked / grant / advice / model / module / error) — note **no "artifact" chip** (artifacts aren't an audit class; see AT-3). Chips facet the loaded timeline client-side. **They are not globally exhaustive across unloaded pages** — the timeline is paginated, so a chip filters what's loaded; for a precise narrow, reuse the **existing server `action`/`include` filters** (no new params). The UI must not imply a chip shows every matching row in the matter when only one page is loaded.
- `review.*` rows get a distinct visual treatment (the supervised-autonomy beat).

### AT-3 — Invocation-chain grouping (frontend)
Group rows by `invocation_id` (present on `audit` + advice rows; absent on `state_machine` — see limitation) into a readable chain:

> module invoked → model called → **artifact (output node)** → review requested → approved/rejected/overridden

The **artifact node is not an audit row** (confirmed-locked 2026-05-28). It's resolved, in priority order, from: (1) a `review.*` row's `payload.artifact_id`, (2) existing artifact deep-link context, (3) an optional `listArtifacts` join by `invocation_id`. **If no artifact resolves, the chain still renders without an output node** — never invent one. Rendered as a collapsible group with the decision outcome summarised at the head. Ungroupable rows (no `invocation_id`) stay in the chronological lane.

**Deferred backend gap (do not build now):** if we later decide every produced output must be chainable, thread `artifact_ids` onto a `module.capability.completed` audit row. Only file/build this if the output-node-from-carriers proves insufficient in use.

### AT-4 — Keep deep links working
`?invocation_id=` and `?action=` deep-links (from ArtifactDetail, ApprovalsTab, the ceremony banner) must still land correctly — pre-select the matching filter/chain on load. No URL contract changes.

## Reuse audit
- **Reuse:** the reconstruction endpoint + its `include`/`action`/`invocation_id` filters; `TimelineEntry` fields; `review.*` payloads; existing `ReconstructionView` / `AdminAuditView`; existing deep-link params.
- **Net-new:** one `classifyEntry` frontend module + the lane/filter/grouping UI. No new audit source, no new model.
- **Build-custom justification:** none required — this is presentation over existing data.

## Flagged limitation (not a blocker)
`state_machine.transition.*` rows carry **no `invocation_id`** (the endpoint doc notes this). They cannot join invocation chains and will render in the chronological lane, class `system`/`module` as appropriate. Acceptable for v1; a future backend pass could thread an invocation id onto transitions if it proves necessary. **Log as a known gap, do not build it now.**

## Reviewer answers (ratified 2026-05-28)
1. **Filter scope:** client-side facet first — **but only after the server filters have loaded the correct deep-linked chain**. Do not pretend class chips are globally exhaustive across unloaded pages (AT-2 enforces this).
2. **Surface:** matter `ReconstructionView` first. Admin later (same `classifyEntry`).
3. **Background rows:** collapsed by default, with a clear "show background activity" toggle.

## Build substeps (frontend-first; no backend unless Q1 forces it)
- **AT-1** — `classifyEntry` module + unit tests (pure function, the load-bearing mapping).
- **AT-2** — decision lane + class filter chips + `review.*` callout in `ReconstructionView`.
- **AT-3** — invocation-chain grouping.
- **AT-4** — deep-link pre-selection; focused test that `?invocation_id=`/`?action=` still resolve.

Verification per [[legalise-verification-cadence]]: focused tests + typecheck per substep; full frontend vitest + build at the gate; e2e at merge. No backend suite needed unless Q1 pulls a server-side filter param in (then add an API test).
