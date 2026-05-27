# HANDOVER — Phase 14.5 A Reconstruction Filters DONE

**Branch:** `runtime-rewrite`
**Plan ratified at:** `b98f0ab` (PHASE_14_5_BACKEND_CONTRACT_CLOSURE_BUILD_PLAN.md).
**Closes:** BACKEND_GAP_AUDIT finding **14-E-#1**.
**Reviewer brief:** "Start Phase 14.5 A first. Do not move to B until A is built, swept, handed over, and reviewed."

## What landed

Two new query params on `GET /api/matters/{slug}/audit/reconstruction`. Filters apply BEFORE pagination per the plan's load-bearing contract.

### Substrate

**`backend/app/core/audit_reconstruction.py`:**
- `reconstruct(...)` accepts `invocation_id` + `action` kwargs (both optional, both `None`-default → backwards compatible).
- Each `_query_*_rows` function pushes the filters into its SQL `WHERE`:
  - `_query_audit_rows`: `AuditEntry.payload["invocation_id"].astext == :invocation_id` (JSONB path) + `AuditEntry.action == :action`.
  - `_query_state_machine_rows`: `invocation_id` → returns empty (no deterministic carrier); `action` → only matches the `state_machine.transition.<status>` prefix and pushes `status` into SQL.
  - `_query_advice_boundary_rows`: `invocation_id` → matches `output_id` (Phase 9 convention); `action` → only matches the `advice_boundary.decision.<status>` prefix.
- `matter_id` type widened to `uuid.UUID | None` to support Phase 14.5 C's workspace scope. When `matter_id is None`, state_machine + advice_boundary sources return empty (substrate-truthful per the plan's source-semantics lock).
- New module-level constants `_STATE_MACHINE_ACTION_PREFIX` + `_ADVICE_BOUNDARY_ACTION_PREFIX` so the prefix strings live in one place.

**`backend/app/api/audit.py`:**
- Endpoint accepts `invocation_id` + `action` query params with structured descriptions matching the plan.
- `invocation_id` is validated as a UUID before passing through; invalid → structured 422 `{detail: {error: "invalid_invocation_id", supplied, message}}`. Avoids opaque DB-side cast errors.
- The endpoint's `audit.reconstruction.viewed` row carries the **Phase 14.5 A locked payload shape**:
  ```
  payload: {
    scope: "matter",
    matter_id: <id>,
    filters: { invocation_id, action, sources, since, until },
    limit, cursor_supplied, returned
  }
  ```
  Phase 14.5 C will emit the same action with `scope: "workspace"` + `matter_id: null` — one row schema across both surfaces.

### Frontend

**`frontend/src/lib/api.ts`:**
- `ReconstructionOptions` gains `invocation_id?` + `action?`; `getReconstruction` forwards them to the substrate.

**`frontend/src/matter/ReconstructionView.tsx`:**
- `loadPage` passes `invocation_id` + `action` from URL search params into the API call.
- Client-side filter retained as defence-in-depth (cheap; fails closed on shape mismatches) — but the substrate is the source of truth.
- **Partial-page advisory removed.** The Phase 14 E P1 redline added "Filter applies to loaded rows only — more matches may appear after loading more." Post-14.5 A that copy is no longer true; substrate filters before paginating. The "No loaded rows match yet" branch of `EmptyState` also retires. `EmptyState` is now two branches: filtered-no-match (substrate-truthful) and unfiltered-empty.

## Load-bearing regression test

`backend/tests/test_phase14_5_a_reconstruction_filters.py::test_invocation_id_filter_returns_target_on_page_one_through_dense_noise`:

- Inserts 250 non-matching audit rows (each with a different `payload.invocation_id`) ordered first by `occurred_at`.
- Inserts ONE matching row at the tail of the window.
- Calls `reconstruct(matter_id, invocation_id=target, limit=200)`.
- Asserts `len(page.entries) == 1` and the entry's `payload.invocation_id == target` and `next_cursor is None`.
- Fails with a clear message ("filter-before-pagination contract broken") if a future refactor regresses.

This is the regression that proves Phase 14.5 A actually closes 14-E-#1 rather than relocating it.

## Test coverage

12 new substrate tests in `test_phase14_5_a_reconstruction_filters.py`:

1. **Filter-before-pagination** (the regression above).
2. No filter → all rows.
3. `invocation_id` match-only behaviour.
4. `invocation_id` against state_machine → empty (substrate has no carrier).
5. `invocation_id` against advice_boundary → matches `output_id`.
6. `action` exact match on audit.
7. `action` state_machine prefix pushdown to `status`.
8. `action` with non-prefix string → empty for state_machine + advice_boundary.
9. Filters AND together with each other.
10. Endpoint invalid invocation_id → 422 with structured envelope.
11. Endpoint emits the unified `payload.scope = "matter"` shape with `filters` block.
12. Backwards compat — calls without filters behave exactly as before.

## Verification

- `docker compose exec backend pytest tests/test_phase14_5_a_reconstruction_filters.py` — **12/12 passing**.
- `docker compose exec backend pytest` — full sweep **717 passed, 8 skipped** (was 705; +12 new).
- Frontend `npm test` — **113/113 passing** (was 114; -1 net because one test on the Phase 14 E partial-page advisory retired with the advisory).
- Frontend `npm run typecheck` — clean. `npm run build` — clean.

## Spec updates

- **`AUDIT_EMISSION_MAP.md`** — the `audit.reconstruction.viewed` row entry rewritten to name the locked payload shape and reference Phase 14.5 A.
- **`BACKEND_GAP_AUDIT.md`** — finding **14-E-#1** marked CLOSED with the closure description; the original problem statement preserved below for reference.

## What this DOES NOT do (per plan + brief)

- **No workspace endpoint yet.** That's Phase 14.5 C. `matter_id: uuid.UUID | None` is widened on `reconstruct` so C can reuse the same function, but no admin route is wired.
- **No installed-modules endpoint.** Phase 14.5 B.
- **No frontend `/admin/audit` route.** Phase 14.5 C deferred-frontend.
- **No removal of the client-side filter.** Retained as cheap defence-in-depth that fails closed against future shape drift. The Phase 14 E P1 partial-page advisory + "no loaded rows match yet" branch did retire — those were the substrate-truthful disclaimers for the pre-14.5 fallback world; they no longer match behaviour.
- **No new audit action.** Same `audit.reconstruction.viewed` action, extended payload only.
- **No migration.** Two query params + a payload extension — backwards compatible across the wire.

## Phase 14.5 status after A

- **A:** ratified at this commit (pending Reviewer).
- **B:** pending (do not start until A ratifies).
- **C:** pending.

Hand to Reviewer.
