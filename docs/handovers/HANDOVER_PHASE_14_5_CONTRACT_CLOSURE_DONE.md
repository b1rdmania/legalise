# HANDOVER — Phase 14.5 Contract Closure DONE

**Branch:** `runtime-rewrite`
**Plan ratified at:** `b98f0ab` (`PHASE_14_5_BACKEND_CONTRACT_CLOSURE_BUILD_PLAN.md`).
**Phase scope:** close the three open Phase 14 findings before Phase 15 Playwright runs, so end-to-end tests exercise the final intended contracts rather than frontend graceful-degradation fallbacks.

## Sub-step ledger

| Sub-step | Closes | Ratified at | Per-step handover |
| --- | --- | --- | --- |
| A — server-side reconstruction filters | 14-E-#1 | `26cdd05` | `HANDOVER_PHASE_14_5_A_RECONSTRUCTION_FILTERS_DONE.md` |
| B — installed-modules listing | 14-B-#1 | `24ebe2c` | `HANDOVER_PHASE_14_5_B_INSTALLED_MODULES_DONE.md` |
| C — workspace audit reconstruction | 14-B-#2 | `ccf7ec4` | `HANDOVER_PHASE_14_5_C_ADMIN_AUDIT_DONE.md` |

Reviewer-redline patches landed inline on the same hashes per the plan's per-sub-step cadence. The plan + redline trail lives on `runtime-rewrite` between `b98f0ab` and `ccf7ec4`.

## Findings closed (all three)

### 14-E-#1 — server-side `invocation_id` / `action` filters (Phase 14.5 A)

`GET /api/matters/{slug}/audit/reconstruction` now accepts `invocation_id=<uuid>` + `action=<string>` query params. Filters apply **before pagination** via per-source SQL pushdown (regressed by `test_invocation_id_filter_returns_target_on_page_one_through_dense_noise` — 250 non-matching prefix rows + one target at the tail → returned on page 1). Frontend client-side filter dropped (Reviewer P1: an incomplete client filter was dropping valid advice_boundary rows whose carrier is `output_id`). Substrate is now the source of truth.

### 14-B-#1 — installed-modules listing (Phase 14.5 B)

`GET /api/modules/installed` returns one row per `module_id` (most recent `installed_at` wins via `row_number()` window with `(installed_at DESC, id DESC)` deterministic tie-breaker). Frontend renders an "Installed vX.Y" badge per catalog card (muted "Installed (disabled)" variant for revoked rows) and `GrantsPanel.runnablePairs` ANDs the enabled installed state into the Phase 14 D strict per-string-grants derivation. The Phase 14 D P1 invariant (partial revocation hides Run) is preserved verbatim — installed-state is an **additional** gate, not a replacement.

### 14-B-#2 — workspace / admin audit reconstruction (Phase 14.5 C)

`GET /api/admin/audit/reconstruction` (superuser-only) returns workspace-scoped rows (`matter_id IS NULL`). Source-semantics locked: only `source="audit"` returns rows; `state_machine` + `advice_boundary` are matter-bound by substrate design and return empty cleanly. Emits the same `audit.reconstruction.viewed` action with `payload.scope="workspace"` + `payload.matter_id=null` — unified payload schema with the matter endpoint. Frontend `/admin/audit` page mirrors the matter view; the two non-audit source chips render disabled with a substrate-constraint tooltip. InstallCeremony's invalid-transition banner regains its deep-link (`?action=module.ceremony.rejected`, action-only per the plan's P1 redline).

## Unified `audit.reconstruction.viewed` payload contract

Locked in Phase 14.5 A. Same `audit_entries.action` value across both surfaces; `payload.scope` discriminates:

```
{
  scope: "matter" | "workspace",
  matter_id: <uuid> | null,
  filters: {
    invocation_id: <uuid> | null,
    action: <str> | null,
    sources: ["audit", "state_machine", "advice_boundary"] | subset,
    since: <iso> | null,
    until: <iso> | null,
  },
  limit, cursor_supplied, returned
}
```

Documented as a single row in `AUDIT_EMISSION_MAP.md`.

## Verification at close-out

| | A (`26cdd05`) | B (`24ebe2c`) | C (`ccf7ec4`) |
| --- | --- | --- | --- |
| Backend pytest | 717 / 8 | 724 / 8 | **735 / 8** |
| Frontend npm test | 114 / 114 | 119 / 119 | **123 / 123** |
| Substrate changes | 1 file + 1 test file | 1 file + 1 test file | 1 file + 1 test file |
| Frontend changes | 3 files + 1 test edit | 3 files + 2 test files | 3 files + 1 test file + 1 test edit |
| Audit emissions added | 0 (payload shape change only) | 0 (read endpoint) | 0 (payload variant) |
| Migrations | 0 | 0 | 0 |

End state: backend **735 passed, 8 skipped**; frontend **123/123**; typecheck + build clean across all three sub-steps; backend-only file count delta = +3 files (1 endpoint mod + 2 new test files); zero migrations; zero new audit action strings.

## Frontend graceful-degradation cleanups

All three Phase 14 graceful-degradation fallbacks have been replaced with final-contract behaviour:

1. **`ReconstructionView`** (Phase 14 E P1 → Phase 14.5 A): the partial-page advisory + "no loaded rows match yet" empty-state branch retired. Substrate filters before paginating; an empty filtered page is now substrate-truthful. Client-side filter dropped entirely (Reviewer P1 on A).
2. **`ModulesCatalog`** + **`GrantsPanel`** (Phase 14 D 14-B-#1 heuristic → Phase 14.5 B): the outer "plugin appears in some grant" heuristic retired. Badges sourced from `/api/modules/installed`; runnable-pairs ANDs the installed-and-enabled state into the strict Phase 14 D per-string-grants derivation.
3. **`InstallCeremony`** (Phase 14 B P1 → Phase 14.5 C): the link-omission disclaimer retired. Banner has a real deep-link to `/admin/audit?action=module.ceremony.rejected`.

## Open findings after 14.5

**Zero.** The three Phase 14 findings are the only ones that were filed; all closed.

## Phase 15 inherits

- Backend contract surface for reconstruction is final: matter endpoint + admin endpoint, both with the unified payload, both with `invocation_id` + `action` filters that apply before pagination.
- Installed-modules listing exists; catalog + grants UI depend on it directly.
- Frontend graceful-degradation fallbacks are gone; Playwright tests written against the final shape stay valid past 15.
- Three open backlog items (none filed as `BACKEND_GAP_AUDIT` findings; carry forward as informal):
  - The TopBar negative auth tests still wait on `document.body` rather than a post-auth signal — flagged by Reviewer at Phase 14 G close-out as a P3 hygiene nit.
  - Per-ceremony filtering on the admin audit endpoint is not implemented (action-only is sufficient for the InstallCeremony banner's deep-link); revisit if Phase 15 surfaces a real need.
  - Phase 14 substrate findings on the matter-scoped reconstruction's pagination performance under very large windows — never filed because no UX failure surfaced. Phase 15 Playwright may stress this.

## Phase 14.5 closes

This commit (docs-only — no substrate, no frontend, no tests). Reviewer's process note from the C ratification:

> the original 14.5 plan mentioned a final `HANDOVER_PHASE_14_5_CONTRACT_CLOSURE_DONE.md` rollup. Not a blocker, but I'd add that as a tiny docs-only close-out before Phase 15 so the three closures and hashes are easy to find.

Done. Next: Phase 15 Playwright against the final contracts.
