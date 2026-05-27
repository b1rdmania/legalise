# Phase 15 — Playwright End-to-End Coverage Build Plan (v2)

**Phase entry:** Phase 14.5 closed at `a5e0215`. Zero open `BACKEND_GAP_AUDIT` findings. Andy's-four reachable through pixels.

**Goal:** real browser coverage against real product + operator surfaces. Pin the contracts the existing pytest + vitest suites can't pin — full journey, audit-emission, posture matrix — without inventing new substrate.

## Discipline

Plan only where it prevents wrong code. Tests touch the same surfaces an evaluator does. No private bypasses; no test-only substrate hooks; no diverged vocabulary.

The Reviewer ratification bar (lifted verbatim):

- Tests the real app path.
- No new substrate or private bypasses.
- Pins audit and posture claims.
- Does not duplicate docs as prose.
- CI remains useful rather than slow theatre.

## Tooling

**Playwright (TypeScript) under `frontend/e2e/`.** Already named in `ACCEPTANCE.md`; vitest stays for unit/component; Playwright is the e2e tier.

**Test environment:** docker-compose with the existing `legalise_test` DB. Fresh DB per run. Frontend served from `npm run preview` in CI; `npm run dev` locally.

## No new substrate

Substrate hooks the v1 plan proposed are dropped:

- ~~test-only `app.tools.test_promote` helper~~ → use Phase 11 `POST /api/admin/users/{id}/role` from a real superuser session.
- ~~test-only env flag flipping provider upstream errors~~ → if no real surface produces `ProviderUpstreamError`, the branch is **not e2e-coverable yet**; pytest remains the coverage layer.
- ~~test-only `_test_force_tier_above` matter field~~ → if no real surface produces `advice_boundary.check.{blocked,denied,failed}` via documented inputs, the branch is **not e2e-coverable yet**; pytest remains the coverage layer.

First-admin bootstrap uses the real Phase 12 CLI invoked via `docker compose exec`. Later role changes use the real Phase 11 admin endpoint signed into as a superuser.

## Audit coverage is a matrix, not prose

Phase 15 C lands `docs/spec/AUDIT_COVERAGE_MATRIX.md` — a transcription of every row in `AUDIT_EMISSION_MAP.md`, with each row marked exactly one of:

- `e2e-covered` — Playwright test exists and passes.
- `pytest-covered` — substrate-side test already covers; e2e doesn't duplicate.
- `not-coverable-yet` — no real surface produces this audit emission; file as a Phase 15 finding and leave pytest as the coverage layer.
- `none-row-asserted` — audit map says NONE for this surface; Playwright asserts the absence of a row.

The matrix is the source of truth for what tests exist. The hand-list approach the v1 plan took is gone.

## Sub-phase ledger

Six sub-steps. Each lands its own Reviewer ratification per the established cadence.

### Phase 15 A — Scaffolding

- `frontend/playwright.config.ts` — chromium-only default, retries=2 on CI, trace-on-first-retry, video-on-failure.
- `frontend/e2e/fixtures/auth.ts` — register / login via real `/auth/*` endpoints; first-admin promotion via `docker compose exec backend python -m app.tools.bootstrap_admin <email>`; later role mutations via authenticated `POST /api/admin/users/{id}/role`.
- `frontend/e2e/fixtures/db.ts` — between-test truncate of runtime tables (`audit_entries`, `state_machine_transitions`, `state_machine_instances`, `advice_boundary_decisions`, `matter_artifacts`, `installed_modules`, `workspace_skill_capability_grants`, `user_api_keys`, `access_token`, `users` minus the test-runner user). After truncate, calls the existing `seed_demo_matter_for_user` for each fresh user — same path the dev-autoverify uses. Module manifests on disk and their signatures are not touched.
- `frontend/e2e/fixtures/api.ts` — typed substrate clients re-exported from `frontend/src/lib/api.ts`.
- `frontend/package.json` — `e2e` + `e2e:headed` scripts.
- `frontend/e2e/smoke.spec.ts` — single fixture-smoke test that exercises the harness end-to-end before real scenarios land.

### Phase 15 B — First-run end-to-end

One scenario, top-to-bottom, asserting the substrate audit row after every documented step. Mirrors Journey 00 verbatim:

1. Fresh DB. `/app` empty-state renders (Phase 14 A P1 — copy MUST NOT claim registration grants admin).
2. Register first account. Substrate emits the dev-autoverify chain (`auth.user.registered`, `auth.user.verified`, `auth.user.demo_seeded`, `auth.user.capabilities_auto_granted`).
3. Post-register `/app` shows "Bootstrap admin required" with the literal CLI command.
4. Test driver runs `docker compose exec backend python -m app.tools.bootstrap_admin <email>`. Substrate emits `user.admin.bootstrapped`.
5. **Explicit auth refresh** — page reload (or sign-out / sign-in cycle). AuthProvider re-fetches `/auth/users/me`; `is_superuser` flips to true in the React context. Without this, the test passes/fails based on AuthProvider cache rather than product contract.
6. `/settings/keys` — add a provider key. Substrate emits `user.key.configured`.
7. `/modules` → Contract Review → Install → drive the trust ceremony state machine. Substrate emits the full ceremony chain ending in `module.enabled`.
8. Open Khan matter. Add a grant for Contract Review's `review` capability. Substrate emits `module.grant.created`.
9. Click Run. Result panel renders. Substrate emits the invocation chain (`module.capability.invoked`, `model.call`, `module.capability.completed`, `advice_boundary.check.completed`).
10. Click "See audit trail" → reconstruction renders the filtered timeline. Substrate emits `audit.reconstruction.viewed` with `payload.scope="matter"` + `filters.invocation_id=<id>`.

Wall-clock bar: 10 minutes per `ACCEPTANCE.md` §15-coverage. Test hard-fails past that.

### Phase 15 C — Audit-emission coverage matrix

1. Land `docs/spec/AUDIT_COVERAGE_MATRIX.md` — every row from `AUDIT_EMISSION_MAP.md` transcribed, each marked one of the four statuses.
2. For each `e2e-covered` row, a Playwright test that:
   - Sets up prerequisites via API fixtures.
   - Performs the user action through the UI.
   - Queries the substrate reconstruction endpoint for the documented action.
   - Asserts the row's `action`, `module`, and the payload keys named in the audit map.
3. For each `none-row-asserted` row, a Playwright test that:
   - Performs the read / no-op action.
   - Asserts the absence of any row with the relevant action string.
4. `not-coverable-yet` rows are filed as Phase 15 findings in `BACKEND_GAP_AUDIT.md` (or a new `PHASE_15_FINDINGS.md`) with a one-line rationale and a pointer to the pytest test that covers the substrate side.

The matrix is the deliverable; the tests implement against it.

### Phase 15 D — Posture matrix

For each cell in `POSTURE_GATE_UX.md`:

1. Set matter posture via `PATCH /api/matters/{slug}/privilege`.
2. Set actor role via `POST /api/admin/users/{id}/role` from a real superuser session (no test-only DB UPDATE).
3. Open the matter workspace.
4. Assert banner content matches the documented cell exactly — substrate posture tokens verbatim.
5. For non-`A_cleared` postures, click Run on a granted capability. Assert substrate 403 with the documented body shape. Click the deep-link. Assert reconstruction renders the `posture_gate.check.blocked` row.

The Phase 14 G unpause CTA — admin changing posture `B_mixed` → `A_cleared` via the inline control — is part of the matrix: assert no banner after the next page load.

### Phase 15 E — Failure paths through real surfaces

The InvocationRunner banners that can be produced through real surfaces:

- `CapabilityDeniedError` — revoke a grant string via the real `DELETE /api/matters/{slug}/grants/{id}` endpoint; click Run.
- `ModuleNotInstalledError` (Phase 14 C) — attempt to grant a discovered-but-not-installed module; assert the GrantsPanel 404 banner.
- `ModuleDisabledError` (Phase 14 C) — admin revokes a module via `POST /api/modules/{id}/revoke`; attempt to grant; assert the 409 banner.
- `InvocationInvalidArgsError` — Run a capability with required args missing; assert the banner cites the substrate's `invalid_args` body.
- `ProviderKeyMissingForInvokeError` — DELETE the user's provider key via `DELETE /api/settings/keys/{provider}`; click Run; assert the banner + `/settings/keys` deep-link.

The InstallCeremony 409 invalid-transition path is reachable through real surfaces: POST advance with `action=grant` on a fresh ceremony. Assert the banner cites `module.ceremony.rejected` and deep-links to `/admin/audit?action=module.ceremony.rejected`.

`PostureBlockedError` — covered by Phase 15 D.

`Phase1BlockedError` + `ProviderUpstreamInvokeError` — no real surface produces these from documented inputs without substrate-side staging. Filed as Phase 15 not-coverable-yet findings; pytest stays the coverage layer.

### Phase 15 F — CI wiring + close-out

- `.github/workflows/e2e.yml` — runs on PR + push. Spins docker-compose, runs `npm run e2e` against `npm run preview`. Traces + videos uploaded on failure.
- Browser binary cache.
- README: how to run locally + how to read CI traces.
- `HANDOVER_PHASE_15_PLAYWRIGHT_DONE.md` — rollup of the sub-step ratification hashes + the coverage matrix state at close.
- Merge gate: e2e failure blocks PR merge, same as the pytest job.

## Findings policy

A scenario that can't be tested through real surfaces is filed as a Phase 15 finding — same shape as the Phase 14 → 14.5 finding chain. The finding names:

- The action / surface that would need to be coverable.
- Why no real product / operator path produces it today.
- Where pytest covers the substrate side (test file + name).

The plan does not ship test-only substrate to close findings. They get closed by future product surface, future operator tooling, or a deliberate substrate phase — same pattern as 14-B-#1 / 14-B-#2 / 14-E-#1 followed.

## Handover convention

Per sub-step: `docs/handovers/HANDOVER_PHASE_15_<letter>_<name>_DONE.md` + ratification hash recorded.

Phase 15 closes with `HANDOVER_PHASE_15_PLAYWRIGHT_DONE.md` covering all six sub-steps + the matrix state.

**No test code lands before Reviewer ratifies this plan.**
