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

**Filters must apply BEFORE page slicing / cursor emission** (Reviewer P1 redline). The frontend's Phase 14 E client-side filtering had a UX hole where dense non-matching prefix rows could push the target row past the first page; a deep-linked user saw "no rows match yet — load more" repeatedly. Phase 14.5 A MUST NOT recreate that hole in backend form. Two acceptable implementations:

1. **Filter inside `reconstruct()` before slicing.** The union of three sources is filtered first; page slicing happens against the filtered set. Cursor encoding is against the post-filter row.
2. **Over-fetch + filter until the page is full.** If pushdown into per-source queries isn't trivial for state_machine + advice_boundary synthesised rows, fetch in larger chunks, filter, repeat until `limit` matching rows are accumulated OR all sources exhausted.

Either is fine; the contract is: **a request with `?invocation_id=<id>` returns the matching row(s) within the first page response, NOT after the caller pages through non-matching rows.** Implementation chooses based on substrate complexity; the test pins the behaviour.

**Load-bearing test (Reviewer P1):**

```
- Insert N dense non-matching audit/state_machine/advice_boundary rows
  (N > DEFAULT_LIMIT, e.g. 250 rows) all with payload.invocation_id != <target>.
- Insert ONE row with payload.invocation_id = <target>, ordered LAST by occurred_at
  (worst case — the target is at the tail of the window).
- GET .../reconstruction?invocation_id=<target>&limit=200
  → MUST return entries: [<the one target row>], next_cursor: null
  → MUST NOT require the caller to follow next_cursor through the non-matching prefix
```

This is the regression that proves Phase 14.5 A actually closes 14-E-#1 rather than relocating it.

**No new audit emission, but payload shape changes** (Reviewer P2 redline — unified scope payload). The endpoint already emits `audit.reconstruction.viewed` on every call (Phase 5). Phase 14.5 A extends that payload to carry:

```
payload: {
  scope: "matter",                # set explicitly so the admin endpoint variant in C parses identically
  matter_id: <id>,
  filters: {
    invocation_id: <id> | null,
    action: <str> | null,
    sources: ["audit", "state_machine", "advice_boundary"] | subset,
    since: <iso> | null,
    until: <iso> | null,
  }
}
```

The `scope` key is the load-bearing addition. Phase 14.5 C's admin endpoint emits the same action with `scope: "workspace"` + `matter_id: null`. Same `audit_entries.action` value, **identical payload schema across both surfaces** — one shape for the UI to consume, no implicit variants.

Backwards-compatible: existing payload was empty / sparse; consumers tolerating "extra keys" continue to work. Update `AUDIT_EMISSION_MAP.md` to name the new payload contract explicitly.

**Tests (substrate-side):**

- Filter-by-invocation_id returns only rows matching either payload or refs.
- Filter-by-action returns only rows with the exact action string.
- Both filters together: AND semantics.
- Invalid UUID → 422.
- Existing tests against the endpoint without filters continue to pass (backwards compatibility).

**Reviewer decisions for A:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| A1 | `action` matches state_machine + advice_boundary synthesised actions too? | Yes — filter applies after the substrate's source union | Otherwise `?action=advice_boundary.decision.completed` (the synthesised name) wouldn't work |

(The prior A-decision on the viewed-payload filter shape is superseded by the P2-redline unified payload block above — `scope` + `matter_id` + `filters` is the documented shape for both A and C now.)

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

**Frontend update (Reviewer P2 redline — installed-modules supplements, does NOT replace, runnable-pair logic):**

- `ModulesCatalog` gains an "Installed v0.2.1" badge per card by intersecting catalog + installed-modules. Disabled-but-installed cards render with a muted badge so the operator can tell the difference between "available" and "installed-but-revoked."
- `GrantsPanel.runnablePairs` keeps the Phase 14 D strict derivation:
  - capability is `scope === "matter"` from the manifest,
  - every string in `reads ∪ writes` has a matching grant row with strict `plugin = module_id, skill = capability_id, capability = required_string, scope_type = "matter"` tuples.
- Phase 14.5 B adds **one extra AND clause** to that derivation:
  - the module's installed-modules row exists AND `enabled === true`.
- The catalog manifest remains the source of capability shape (reads / writes). Installed-modules is the source of truth for "is this module enabled in the workspace right now?" — an additional gate, not a replacement.
- The heuristic that retires is the **outer "plugin appears in some grant"** loop from Phase 14 D — that was the only piece sidestepping 14-B-#1. Inner strict per-string AND-of-grants logic stays verbatim. A revoke that disables one capability still hides only that capability's Run; the rest of the module stays runnable.

This preserves the Phase 14 D P1 invariant: partial revocation cannot silently re-enable a capability via the new endpoint.

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

**Substrate behaviour (Reviewer P2 redline — workspace source semantics locked):**

- **Only `source="audit"` rows are eligible for workspace scope.** Substrate-side, `state_machine_transitions` and `advice_boundary_decisions` are matter-bound by design — both tables have non-nullable matter_id columns (state-machine = ceremony-per-matter; advice-boundary = decision-per-matter-invocation). Rows where `matter_id IS NULL` cannot exist in those tables; querying them with that predicate would always return empty. The admin endpoint MUST surface this honestly:
  - If `include` includes `state_machine` or `advice_boundary`, the substrate accepts the param (no 422) but returns empty for those source values.
  - The endpoint's response is documented as "audit-source only for workspace scope; state_machine + advice_boundary are matter-bound and return empty here."
  - The frontend chip UX for the admin reconstruction page mirrors this: the two non-audit chips render as disabled with a tooltip naming the substrate constraint.
- Cross-source union + ordering identical to the matter version.
- Cursor encoding shared with the matter endpoint (the cursor doesn't carry matter scope; the endpoint does).
- The matter endpoint stays unchanged. A row exposed by the admin endpoint is one that wasn't surfaced by any matter endpoint by design (matter_id IS NULL).

**Substrate-side test (P2 lock):**

- Caller GETs `/api/admin/audit/reconstruction?include=audit,state_machine,advice_boundary` — request accepted; response carries only `source="audit"` rows.
- Caller GETs same endpoint with `include=state_machine` only — request accepted (no 422); response is `{entries: [], next_cursor: null, total_in_window_estimate: 0}`.
- This is contract documentation, not a future enrichment promise. If workspace-scoped state_machine / advice_boundary ever becomes a thing, that's a new table or column; not an extension of this endpoint.

**New audit emission:** the endpoint MUST audit itself, mirroring the matter endpoint's `audit.reconstruction.viewed`. Same action name, identical payload schema as in sub-step A (Reviewer P2 redline — unified scope payload):

```
action: audit.reconstruction.viewed
module: core.audit
payload: {
  scope: "workspace",
  matter_id: null,
  filters: { invocation_id, action, sources, since, until }
}
actor_id: <caller superuser>
matter_id: NULL
```

Same `audit_entries.action` value as the matter endpoint emits in A. **One row shape, two `scope` values.** Same row is visible from the admin endpoint itself on a subsequent call (audit-the-auditor preserved). The matter endpoint never surfaces this row in its timeline (matter_id IS NULL excludes it from `_load_matter_or_403` joins).

**Tests (substrate-side):**

- Superuser caller: returns rows where `matter_id IS NULL`.
- Non-superuser caller: 403 with the `admin_required` envelope.
- Filters compose with the new A-step `invocation_id` / `action` params + existing `since` / `until` / `include` / `cursor` / `limit`.
- A `module.ceremony.rejected` row (the original UX motivation) surfaces on the admin endpoint AND is filterable by `?action=module.ceremony.rejected`.
- The endpoint itself emits an `audit.reconstruction.viewed` row with `payload.scope = "workspace"` + `matter_id = NULL`.
- The matter endpoint is unchanged: doesn't return workspace-scoped rows, doesn't surface admin-viewed rows in matter timelines.

**Frontend update:** `InstallCeremony` invalid-transition banner gains the "View in audit trail" link the original Phase 14 B redline removed. Link target:

```
/admin/audit?action=module.ceremony.rejected
```

**Action-only deep-link** (Reviewer P1 redline). The earlier draft proposed `?ceremony=<id>` but the backend in 14.5 A only plans `invocation_id` + `action` filters. Adding a `ceremony_id` filter here would be a third query param shipped for one banner's deep-link — false-contract territory. The action filter is sufficient to surface every ceremony-rejection row across the workspace, which is what an admin investigating a rejected ceremony wants to see. If per-ceremony filtering proves load-bearing later (e.g. on workspaces with hundreds of ceremonies per day), file it as a follow-up finding with a real backend addition.

The frontend route + page lands as the smallest possible follow-up — see the deferred frontend touch below.

**Reviewer decisions for C:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| C1 | Separate `/api/admin/audit/reconstruction` or `scope=workspace` on existing? | Separate (Andy's preference) | Keeps matter endpoint conceptually pure |
| C2 | Does the admin endpoint surface MATTER rows too (with admin elevation), or strictly workspace-only? | Workspace-only (`matter_id IS NULL`) | Matter rows are reachable via the per-matter endpoint with superuser fallback (Phase 5's existing _load_matter_or_403). Two endpoints, two scopes; no overlap. |

(Prior C-decisions on payload shape + action-vocabulary churn are superseded by the P2 unified-payload block above. Prior C-decision on the audit-emission-map entry is superseded by the P2 redline: single action with `scope: "matter"|"workspace"` payload variants, documented as one row in the map.)

## Deferred (very small) frontend touches per sub-step

- **A:** Frontend's client-side filter in `ReconstructionView` becomes the OR fallback (still useful if the server returns more than fits the loaded window). The empty-state copy from the Phase 14 E P1 redline ("filter applies to loaded rows only") stays — it remains accurate for paginated client-side narrowing of server-filtered results.
- **B:** `ModulesCatalog` adds an "Installed" badge. `GrantsPanel` keeps the catalog manifest × strict grant derivation from Phase 14 D — manifest is the source of capability shape (reads / writes); strict per-string AND-of-grants stays verbatim. Installed-modules adds one extra AND gate: installed row exists AND `enabled === true`. The outer "plugin appears in some grant" heuristic that sidestepped 14-B-#1 is what retires; the inner P1 invariant from Phase 14 D is preserved.
- **C:** New `/admin/audit` route + page mirroring `/matters/{slug}/audit` without the slug-scope plumbing. `InstallCeremony` banner gets its deep-link back, **action-filter only** per the P1 redline (`?action=module.ceremony.rejected`, no `?ceremony=`). Source chips for `state_machine` + `advice_boundary` render disabled per the source-semantics lock above. Same vocabulary, same chip UX otherwise.

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
