# Phase 14.5 — Backend Contract Closure Build Plan

**Phase entry conditions (all met):**
- Phase 14 ratified at `4fca435` — eight sub-steps shipped, 114 frontend tests passing.
- Three open findings in `BACKEND_GAP_AUDIT.md` named explicitly: `14-B-#1`, `14-B-#2`, `14-E-#1`.
- Andy's-four acceptance criteria reachable end-to-end through pixels; the open findings are about contract robustness, not feature completeness.

**Goal:** close the three known backend findings so Phase 15 Playwright tests run against the final intended contracts, not against frontend graceful-degradation fallbacks. **No new product surface.**

**Framing:** Phase 14.5, not 15. The work is contract closure created by the UI in Phase 14, not new product. KISS — additive endpoints / params only; zero behaviour change for existing callers.

## Architectural discipline (lifted from Phase 14 plan, still load-bearing)

- **No diverged vocabulary.** New action names, parameter names, error codes must compose with what's already in `AUDIT_EMISSION_MAP.md` and the existing endpoint shapes.
- **No claim-without-ship.** Every new endpoint that the frontend depends on lands in this phase or doesn't ship.
- **No bypassed audit.** New endpoints that surface or filter audit data must themselves audit (the "audit the auditor" property already enforced for `/api/matters/{slug}/audit/reconstruction`).
- **No hidden failures.** Error envelopes match the existing structured-body shape (`{detail: {error, message, …}}`).
- **No new substrate concepts.** No new tables, no new state machines, no new authority predicates beyond the matter-access predicate that Phase 5/7/10/13b A all share.

## Out of scope for 14.5

- Frontend product changes. Frontend updates are limited to: (a) API client functions for the new endpoints/params, (b) updates to existing tests that asserted client-side filtering as the fallback, (c) any test that pins the new server-side contract. Nothing else.
- New action strings for entirely new audit emissions. Where a new endpoint must audit, prefer an existing action vocabulary or a minor extension that fits the existing convention.
- Pagination of the new admin audit endpoint beyond what the matter endpoint already provides.
- Permissions modelling — superuser-only for the admin endpoint mirrors Phase 13b B's pattern verbatim.
- Substrate-side rate limiting / abuse controls. Existing middleware applies.

## Sub-phase ledger

Three sub-steps. The order matters: A first because it's the loudest UX hole; B second because the frontend has an existing heuristic that needs replacement; C last because it's the smallest and primarily an audit-discipline question.

### Phase 14.5 A — Server-side reconstruction filters (~0.5 day)

**Closes:** `14-E-#1`.
**File touch:** `backend/app/api/audit.py`, `backend/app/core/audit_reconstruction.py`, `backend/tests/test_phase5_reconstruction*.py`.

**Builds:**

Two new query params on `GET /api/matters/{slug}/audit/reconstruction`:

```
?invocation_id=<uuid>     # filter rows where payload.invocation_id OR refs.invocation_id == <uuid>
?action=<string>          # exact match on the action column
```

Both are optional. Compose with the existing `since` / `until` / `include` / `cursor` / `limit` params (AND semantics — all filters must match). Backwards-compatible by definition.

**Substrate behaviour:**

- `invocation_id` matches against both `payload.invocation_id` and `refs.invocation_id` because the substrate carries it in either depending on the action (Phase 14 D test pinned this). For state-machine + advice-boundary rows, the substrate's existing reconstruction synthesises both payload + refs from the row — the filter applies after that synthesis.
- `action` is a verbatim match on the `action` column of each source. No prefix matching, no wildcards — keeps the query SARGable + the contract narrow.
- Invalid UUID for `invocation_id` → 422 with the same `unknown_source`-style envelope shape the endpoint already uses for invalid `include` values.

**No new audit emission.** The endpoint already emits `audit.reconstruction.viewed` on every call (Phase 5). The viewed row's payload should carry the active filter shape so reconstruction-of-the-reconstruction surfaces what was looked at — Reviewer decision below.

**Tests (substrate-side):**

- Filter-by-invocation_id returns only rows matching either payload or refs.
- Filter-by-action returns only rows with the exact action string.
- Both filters together: AND semantics.
- Invalid UUID → 422.
- Existing tests against the endpoint without filters continue to pass (backwards compatibility).

**Reviewer decisions for A:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| A1 | Carry the filter shape in `audit.reconstruction.viewed.payload`? | Yes — record `{filters: {invocation_id, action, sources}}` | Audit-the-auditor: a row that hides what was being inspected weakens the property |
| A2 | `action` matches state_machine + advice_boundary synthesised actions too? | Yes — filter applies after the substrate's source union | Otherwise `?action=advice_boundary.decision.completed` (the synthesised name) wouldn't work |

### Phase 14.5 B — Installed-module listing (~0.5 day)

**Closes:** `14-B-#1`.
**File touch:** `backend/app/api/modules.py`, `backend/tests/test_phase4_modules*.py`, frontend API client.

**Builds:**

Andy's preference: enrich `/api/modules/v2` with installed state if it avoids a second fetch; separate endpoint if the v2 endpoint is deliberately discovery-only.

**Substrate truth:** `/api/modules/v2` lives in `app.api.modules.list_v2_modules` and calls `discover_modules()` — a filesystem scan of the plugins root. It's a pure discovery surface; layering installed state on top means joining against `InstalledModule` rows, which couples the discovery scan to the workspace's install state. That coupling makes the endpoint less testable + adds DB load to the most-cached frontend call.

**Recommendation:** **separate endpoint.** `GET /api/modules/installed`.

**Endpoint shape:**

```
GET /api/modules/installed
  Auth: any authenticated user (read; same as /api/modules/v2)
  Response: 200
    [
      {
        module_id: str,
        version: str,
        publisher: str,
        visibility: str,
        signature_status: str,
        enabled: bool,
        installed_at: str (ISO),
        installed_by_user_id: str | None,
      }
    ]
  No pagination — same assumption as Phase 13b B admin user list:
  <100 installed modules per workspace; revisit if that changes.
```

Returns one row per `InstalledModule` row. If a module has multiple versions installed (which substrate allows), returns the most recent — `ORDER BY installed_at DESC` + DISTINCT on `module_id`. That mirrors `revoke_module_endpoint`'s "most recent installed version" lookup at `modules.py:1002-1007`.

**No new audit emission.** This is a read endpoint by design; per Phase 13b Decision #1 (artifact reads do not audit), follow precedent. The endpoint surfaces what's already discoverable via `revoke` / `update` 404 probing.

**Tests (substrate-side):**

- Returns rows for all currently-installed modules; one row per module_id.
- Disabled modules surface with `enabled: false` (revoke sets the soft flag).
- Empty workspace returns `[]`.
- Auth-gated — 401 anon, 200 any authenticated user.

**Frontend update:** `ModulesCatalog` adds an "Installed v0.2.1" badge per card by intersecting catalog + installed-modules list. The runnable-pairs derivation in `GrantsPanel` retires its heuristic and uses installed state directly (still requires grant existence per the Phase 14 D P1 contract).

**Reviewer decisions for B:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| B1 | Enrich `/api/modules/v2` or separate endpoint? | Separate — keeps discovery pure | Avoids coupling fs scan to InstalledModule joins |
| B2 | Return one row per installed_module row OR one per module_id? | Per module_id (most recent installed_at) | Frontend cares about "is X installed?" not version history |
| B3 | Include `manifest_snapshot` in the response? | No — too large; manifest is on `/api/modules/v2/{id}` | Catalog only needs version + enabled flag |

### Phase 14.5 C — Workspace/global audit reconstruction (~1 day)

**Closes:** `14-B-#2`.
**File touch:** `backend/app/api/audit.py` (or new `backend/app/api/admin_audit.py`), `backend/tests/test_phase14_5_admin_audit*.py`, frontend `InstallCeremony` banner.

**Builds:**

Andy's preference: separate admin endpoint to keep the matter endpoint conceptually pure.

**Endpoint shape:**

```
GET /api/admin/audit/reconstruction
  Auth: superuser only (same predicate as Phase 13b B + Phase 11)
        → 403 admin_required envelope on non-superuser
  Query: same shape as the matter endpoint, EXCEPT:
    - no `{slug}` path segment
    - returns workspace-scoped rows: `matter_id IS NULL`
    - retains `since` / `until` / `include` / `cursor` / `limit`
    - retains the new `invocation_id` / `action` filters from sub-step A
  Response: ReconstructionResponse (same shape as matter endpoint)
```

**Substrate behaviour:**

- Returns rows from the same three sources (`audit`, `state_machine`, `advice_boundary`) where `matter_id IS NULL`. Cross-source union + ordering identical to the matter version.
- Cursor encoding shared with the matter endpoint (the cursor doesn't carry matter scope; the endpoint does).
- The matter endpoint stays unchanged. A row exposed by the admin endpoint is one that wasn't surfaced by any matter endpoint by design (matter_id IS NULL).

**New audit emission:** the endpoint MUST audit itself, mirroring the matter endpoint's `audit.reconstruction.viewed`. Recommendation: same action name with an admin marker in payload:

```
action: audit.reconstruction.viewed
module: core.audit
payload: { scope: "workspace", filters: {…} }
actor_id: <caller superuser>
matter_id: NULL
```

— rather than minting a new `admin.audit.reconstruction.viewed` action. Same row in `audit_entries`; the scope is in payload. This means the admin endpoint's audit row IS visible from the admin endpoint itself on a subsequent call (audit-the-auditor property preserved across surfaces).

**Tests (substrate-side):**

- Superuser caller: returns rows where `matter_id IS NULL`.
- Non-superuser caller: 403 with the `admin_required` envelope.
- Filters compose with the new A-step `invocation_id` / `action` params + existing `since` / `until` / `include` / `cursor` / `limit`.
- A `module.ceremony.rejected` row (the original UX motivation) surfaces on the admin endpoint AND is filterable by `?action=module.ceremony.rejected`.
- The endpoint itself emits an `audit.reconstruction.viewed` row with `payload.scope = "workspace"` + `matter_id = NULL`.
- The matter endpoint is unchanged: doesn't return workspace-scoped rows, doesn't surface admin-viewed rows in matter timelines.

**Frontend update:** `InstallCeremony` invalid-transition banner gains the "View in audit trail" link the original Phase 14 B redline removed. Link target:

```
/admin/audit?action=module.ceremony.rejected&ceremony=<id>
```

The frontend route + page lands as the smallest possible follow-up — see the deferred frontend touch below.

**Reviewer decisions for C:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| C1 | Separate `/api/admin/audit/reconstruction` or `scope=workspace` on existing? | Separate (Andy's preference) | Keeps matter endpoint conceptually pure |
| C2 | Reuse `audit.reconstruction.viewed` action with `payload.scope`, or mint a new action? | Reuse + scope in payload | Avoids audit-vocabulary churn; audit-the-auditor still works |
| C3 | Does the admin endpoint surface MATTER rows too (with admin elevation), or strictly workspace-only? | Workspace-only (`matter_id IS NULL`) | Matter rows are reachable via the per-matter endpoint with superuser fallback (Phase 5's existing _load_matter_or_403). Two endpoints, two scopes; no overlap. |
| C4 | Does the admin endpoint need a separate audit emission distinguishing it from the matter one in `AUDIT_EMISSION_MAP.md`? | Document as a single action with payload.scope variants | One row per call, two payload variants; map reflects that |

## Deferred (very small) frontend touches per sub-step

- **A:** Frontend's client-side filter in `ReconstructionView` becomes the OR fallback (still useful if the server returns more than fits the loaded window). The empty-state copy from the Phase 14 E P1 redline ("filter applies to loaded rows only") stays — it remains accurate for paginated client-side narrowing of server-filtered results.
- **B:** `ModulesCatalog` adds an "Installed" badge; `GrantsPanel`'s `runnablePairs` no longer needs the catalog × grant heuristic — it can use installed-modules directly (still ANDed with grant existence per the Phase 14 D contract).
- **C:** New `/admin/audit` route + page (mirrors `/matters/{slug}/audit` but without the slug-scope plumbing). `InstallCeremony` banner gets its deep-link back. Same vocabulary, same chip UX.

Each frontend touch is a same-shape extension of an existing page. Estimated ~0.5 day total frontend across all three sub-steps. Tests follow the established per-component pattern.

## Total estimate

~2 days substrate + ~0.5 day frontend across the three sub-steps. Each sub-step lands its own Reviewer ratification cycle per the Phase 13b / Phase 14 cadence.

Phase 14.5 closes when:

- All three sub-steps have ratified handovers.
- `BACKEND_GAP_AUDIT.md` updated: 14-B-#1, 14-B-#2, 14-E-#1 all marked CLOSED with the commit hashes.
- `AUDIT_EMISSION_MAP.md` updated to reflect the workspace-scope variant of `audit.reconstruction.viewed`.
- Full backend test sweep green (current baseline ~705 tests; expect +15-25 new).
- Frontend remains green (114 → ~125 with the small wiring updates).

## What this is NOT

- **Not Phase 15.** Playwright comes next, but only after the contracts these sub-steps close are in substrate. Phase 15 tests then exercise the final shape rather than the fallback.
- **Not Phase 14b.** Phase 14 is closed; this is a focused mini-phase against the carried-forward findings. The Phase 14 v2 plan didn't anticipate these — they emerged from sub-step build experience.
- **Not a refactor.** No restructuring of `audit_reconstruction.py` or `modules.py` beyond the additions. If a refactor is tempting mid-implementation, file it as a separate finding for a future phase.

## Handover convention

Each sub-step lands:
- `docs/handovers/HANDOVER_PHASE_14_5_<letter>_<name>_DONE.md`
- Updated `BACKEND_GAP_AUDIT.md` marking the finding CLOSED
- Updated `AUDIT_EMISSION_MAP.md` for any audit shape change
- Reviewer ratification commit hash recorded

Phase 14.5 closes with `docs/handovers/HANDOVER_PHASE_14_5_CONTRACT_CLOSURE_DONE.md` summarising all three.

## Hand to Reviewer

This plan is the input to the Reviewer. **No substrate code lands before Reviewer ratifies.** Same cadence as Phase 13b's plan → redline → ratify → build → ratify per sub-step.
