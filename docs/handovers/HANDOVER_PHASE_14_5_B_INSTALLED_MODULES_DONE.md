# HANDOVER — Phase 14.5 B Installed Modules DONE

**Branch:** `runtime-rewrite`
**Plan ratified at:** `b98f0ab`. **14.5 A ratified at:** `26cdd05`.
**Closes:** BACKEND_GAP_AUDIT finding **14-B-#1**.
**Reviewer brief:** "Phase 14.5 B: `GET /api/modules/installed` plus the catalog badge / installed-enabled gate, with the Phase 14 D strict grant derivation preserved."

## What landed

### Substrate (`backend/app/api/modules.py`)

New endpoint `GET /api/modules/installed`:

- Any authenticated user (mirrors `/api/modules/v2`).
- Returns `list[InstalledModuleOut]`: `{module_id, version, publisher, visibility, signature_status, enabled, installed_at, installed_by_user_id}`.
- One row per `module_id` — dedupes the per-version history via a `row_number()` window function partitioned by `module_id`, ordered by `installed_at DESC`. Most recent installed version wins, mirroring `revoke_module_endpoint`'s "most recent installed version" lookup.
- Disabled rows surface with `enabled: false` so the catalog can render a muted "Installed (disabled)" badge.
- No new audit emission. Phase 13b Decision #1 — reads don't audit. The test pins this by counting audit rows referencing the path before/after + asserting no `module.installed.*` semantic action ever lands.
- Response DTO excludes `manifest_snapshot`, `permissions_snapshot`, `install_path`, `signed_by`. The DTO surface is closed; substrate-side internals don't leak.

### Frontend client (`frontend/src/lib/api.ts`)

- `InstalledModule` interface mirroring the substrate DTO.
- `listInstalledModules()` fetcher.

### Frontend catalog (`frontend/src/modules-v2/ModulesCatalog.tsx`)

- Catalog mount triggers a parallel `listInstalledModules` fetch. Failure of that fetch sets an empty index → no badges render, catalog still loads (graceful degradation; the gap is no worse than pre-14.5 B).
- Per card, three states:
  - Installed + enabled → `Installed vX.Y` badge (`data-testid="installed-badge-{module_id}"`).
  - Installed + disabled → `Installed (disabled)` badge (`data-testid="installed-disabled-badge-{module_id}"`), title attribute names the installed version.
  - Not installed → no badge.

### Frontend grants panel (`frontend/src/matter/GrantsPanel.tsx`)

The Phase 14 D `runnablePairs` derivation — the load-bearing P1 invariant the Reviewer pinned — is preserved verbatim. One extra AND clause added:

```ts
const inst = installed.get(m.module_id);
if (!inst || !inst.enabled) continue;
```

…inserted between the manifest-valid check and the matter-scope check. Inner per-string AND-of-grants logic (Phase 14 D's regression: read remains, write removed → no Run) untouched. The outer "plugin in some grant" heuristic that the plan flagged as the only piece sidestepping 14-B-#1 retires — installed-state is now the trustworthy gate.

Failure modes:
- Catalog or grants not yet loaded → empty pairs (existing behaviour).
- `listInstalledModules` fetch in flight (state `null`) → empty pairs (rather than racing; prevents Run rendering before we know if the module is installed).
- `listInstalledModules` fetch failed (state empty Map) → empty pairs. Fail closed: better no Run than Run that 409s at invocation.

## Test coverage

### Substrate

7 new tests in `backend/tests/test_phase14_5_b_installed_modules.py`:

1. Anon caller → 401.
2. Authenticated caller, no installs in this matter scope → 200 with a list (other tests may leave rows; assert shape).
3. **Dedup invariant** — three installed rows for the same `module_id` (versions 0.1.0 / 0.2.0 / 0.3.0-rc), endpoint returns one row, the most-recent version.
4. Disabled row surfaces with `enabled: false`.
5. **Disabled-recent-wins** — older enabled row + newer disabled row → endpoint returns the disabled one. The catalog renders current state, not last-enabled state.
6. Response shape — set of returned keys matches the documented eight; never leaks `manifest_snapshot`, `permissions_snapshot`, `install_path`, or `signed_by`.
7. **No audit emission** — count of audit rows referencing the path is unchanged before/after; no semantic `module.installed.*` action ever lands. Pins Phase 13b Decision #1.

Backend full sweep: **724 passed, 8 skipped** (was 717 → +7 new from B).

### Frontend

5 new tests across two files. Total frontend: **119 passing** (was 114; +5 new from B).

- `ModulesCatalog.test.tsx` Phase 14.5 B describe block — 3 tests:
  - Installed + enabled → enabled badge with the installed version surfaced verbatim.
  - Installed + disabled → muted badge; **the enabled-badge variant is NOT also rendered**.
  - Not installed → no badge of either kind.
- `GrantsPanel.test.tsx` — 2 new Phase 14.5 B regressions in the Phase 14 D describe block:
  - **Installed-but-disabled → no Run.** Grants complete, capability matter-scoped, manifest valid; the only difference is `enabled: false`. Pins the enabled-AND gate.
  - **Not-installed → no Run.** Empty installed list with otherwise-complete grants → no runnable pairs. Pins the not-installed branch.

The four Phase 14 D regressions (capability A granted but B not, partial revocation hides Run, both grants present surfaces Run, wrong-skill rows don't unlock) are preserved verbatim — they got an `installed: [{enabled: true}]` mock so the Phase 14 D scope still exercises.

## Verification

- `docker compose exec backend pytest tests/test_phase14_5_b_installed_modules.py` — **7/7**.
- `docker compose exec backend pytest` — **724 passed, 8 skipped**, no regressions.
- Frontend `npm test` — **119/119**.
- Frontend `npm run typecheck` — clean. `npm run build` — clean.

## Spec updates

- `BACKEND_GAP_AUDIT.md` — finding **14-B-#1** marked CLOSED with the closure description; original problem statement preserved below.

## Reviewer brief honoured

- New endpoint shipped against the plan's locked shape.
- Phase 14 D strict grant derivation preserved verbatim — the enabled-AND gate is additive, the per-string AND-of-grants logic untouched.
- The Phase 14 D P1 invariant (partial revocation hides Run) is pinned by the four pre-existing tests + the two new 14.5 B regressions.
- Backend file count diff for the endpoint: +1 endpoint, +1 DTO class. No model changes, no migration.
- Frontend: badge added to catalog cards, enabled-AND gate added to GrantsPanel. No new product surface.
- 14.5 C still pending per the "A then B then C" cadence — not touched here.

## Phase 14.5 status after B

- **A** — ratified at `26cdd05`.
- **B** — ratified at this commit (pending Reviewer).
- **C** — pending.

Hand to Reviewer.
