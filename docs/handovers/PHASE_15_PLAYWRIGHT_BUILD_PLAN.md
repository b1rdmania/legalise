# Phase 15 — Playwright End-to-End Coverage Build Plan

**Phase entry conditions (all met):**
- Phase 14.5 closed at `a5e0215` — final substrate contracts in place.
- `BACKEND_GAP_AUDIT.md` carries zero open findings.
- Andy's-four acceptance reachable end-to-end through pixels (verified at Phase 14 close, `4fca435`).
- The three frontend graceful-degradation fallbacks all retired (Phase 14.5 sub-steps A / B / C).

**Goal:** ship browser-driven end-to-end coverage that walks the journey docs against the **final intended contracts** — not against earlier fallback shapes. Per `ACCEPTANCE.md` §coverage-validation, three cross-cutting test families:

1. **First-run end-to-end** — fresh DB → CLI bootstrap → BYO key → install → grant → invoke → reconstruction. Wall-clock under 10 minutes for a real evaluator.
2. **Audit-emission coverage** — for each row in `AUDIT_EMISSION_MAP.md`, a test verifies the substrate emission lands when the documented action runs.
3. **Posture matrix** — for each cell in `POSTURE_GATE_UX.md`, banner content + deep-link behaviour verified.

This phase ships tests + tooling. Zero new substrate, zero new product surface.

## Tooling decision

**Playwright (TypeScript).** Rationale:

- Already named in `ACCEPTANCE.md` §15-coverage ("Playwright (or equivalent)").
- Strong ecosystem; parallel sharding; trace + video on failure; browser variety (chromium + firefox + webkit).
- Vitest handles unit/component (the existing 123-test frontend suite); Playwright is the e2e tier on top — no overlap.
- TypeScript means tests can share types from `frontend/src/lib/api.ts` directly. No DTO drift.

Alternatives considered: Cypress (single-browser, restrictive on cross-origin), WebdriverIO (lower ceiling on TypeScript ergonomics). Playwright wins on every axis we care about.

**Layout:** `frontend/e2e/` — same TypeScript tooling, can import from `frontend/src/lib/api.ts` for typed substrate clients. Separate from the existing `frontend/src/` Vitest suite (Vitest config already restricts to `src/**/*.test.{ts,tsx}` so the e2e dir doesn't conflict).

## Architectural discipline

Carried verbatim from Phase 14:

- **No diverged vocabulary.** Test assertions cite substrate action strings, posture tokens, error codes verbatim — same patterns Phase 14 tests pinned.
- **No claim-without-ship.** A scenario that depends on a feature the substrate doesn't expose doesn't ship — it surfaces as a Phase 15 finding.
- **No bypassed audit.** Tests verify the substrate rows that the documented actions emit; they don't tolerate "row didn't land but UI looks fine."
- **No new substrate.** If a scenario can't be expressed without backend changes, that's a Phase 15 finding, not a unilateral substrate edit.

## Out of scope for Phase 15

- **Visual regression / pixel diffing.** Brand drift is a separate concern; substrate-behaviour coverage is the priority.
- **Cross-browser parity beyond chromium.** Multi-browser runs are a config flag; default to chromium-only in CI, add others only when a real bug surfaces.
- **Load / stress testing.** The 10-minute wall-clock budget is a UX bar, not a performance bar.
- **Hosted-eval smoke tests.** `legalise.dev` smoke testing is a separate Cloudflare-Pages concern; Phase 15 tests run against the docker-compose stack with a fresh test DB.
- **Substrate-side integration tests.** Pytest already covers those at 735/8.

## Test environment

**Docker-compose, fresh test DB per run.** The existing pattern:

```
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head
```

…provisions a clean schema. Playwright tests spin against the running backend + frontend (frontend dev server on `:3000`, backend on `:8000`). A per-test reset hook truncates `audit_entries`, `state_machine_*`, `advice_boundary_decisions`, `matter_artifacts`, `installed_modules`, `workspace_skill_capability_grants`, and `user_api_keys` between tests — same shape as conftest's SAVEPOINT-bound pytest fixtures.

**Bootstrap CLI in the first-run scenario:** the test triggers it via `docker compose exec` rather than mocking. The CLI is part of the journey; mocking it would weaken the test.

## Sub-phase ledger

Six sub-steps. Each lands its own Reviewer ratification cycle per the Phase 13b / 14 / 14.5 cadence.

### Phase 15 A — Playwright scaffolding (~0.5 day)

**Closes:** nothing — infrastructure.
**Builds:**
- `frontend/playwright.config.ts` — chromium-only default, retries=2 on CI, video-on-failure, trace-on-first-retry.
- `frontend/e2e/fixtures/auth.ts` — register / login / promote-to-superuser helpers calling backend endpoints directly. Promotion uses `docker compose exec backend python -m app.tools.bootstrap_admin <email>` for the first-admin case; per-test runtime promotion uses direct DB UPDATE via a test-only endpoint OR a worker fixture invoking the CLI.
- `frontend/e2e/fixtures/db.ts` — between-test reset helper. Truncates the named tables in a single transaction.
- `frontend/e2e/fixtures/api.ts` — typed substrate clients re-exported from `frontend/src/lib/api.ts` so tests can drive the API directly without going through the UI when the test is checking UI-emits-row, not UI-renders.
- `frontend/package.json` — `e2e` + `e2e:headed` npm scripts.
- `frontend/e2e/smoke.spec.ts` — single "fixture smoke" test that registers a user + reaches `/app`. Verifies the scaffolding works end-to-end before the real scenarios land.

**Reviewer decisions for A:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| A1 | Promote-to-superuser mechanism | Real CLI via `docker compose exec` for first-admin; direct DB UPDATE via a test-only `app.tools.test_promote` helper for runtime promotion mid-test | Real CLI in the first-run path; DB UPDATE everywhere else avoids 30+ subprocess spawns per test run |
| A2 | Backend reset between tests | Truncate named tables + reseed Khan via existing seed function | Mirrors the pytest fixture pattern; faster than per-test container restart |
| A3 | Frontend served from `npm run dev` or `npm run preview`? | `npm run dev` for traceability; CI runs against `npm run build` + `npm run preview` for production-parity | Two-stage: dev for fast iteration, preview for the "this is what ships" run |
| A4 | Default browser | chromium only | Multi-browser is a one-line flag flip; default fast |

### Phase 15 B — First-run end-to-end scenario (~1.5 days)

**Closes:** `ACCEPTANCE.md` §9 (first-run experience matches Journey 00) + Andy's-four #1 (registered → run module → reconstruction).
**Builds:**

One scenario, top-to-bottom, asserting the substrate audit row after every documented step. Mirrors Journey 00 verbatim:

1. Fresh DB. Empty `users` table → `GET /api/system/bootstrap-state` returns `{user_count: 0, has_superuser: false}`. Navigate to `/app` → "Register first account" empty state renders (Phase 14 A P1 invariant: copy MUST NOT claim registration grants admin).
2. Click "Register first account" → `/auth/signup` → submit form. Substrate emits `auth.user.registered` (Phase 13b D row 1). Auto-verify in dev mode → `_post_verify` fires; `auth.user.verified` + `auth.user.demo_seeded` + `auth.user.capabilities_auto_granted` rows land.
3. Post-register → user is at `/app`. State is now `user_count=1, has_superuser=false` → "Bootstrap admin required" state renders with the literal CLI command.
4. Test driver runs `docker compose exec backend python -m app.tools.bootstrap_admin <email>` against the registered user. Substrate emits `user.admin.bootstrapped`. Refresh `/app` → authed home renders (recent matters + Khan CTA).
5. Visit `/settings/keys` → POST a fake provider key (Anthropic). Substrate emits `user.key.configured` with `action: "added"`.
6. Visit `/modules` → click Contract Review card → `/modules/{moduleId}`. Click Install → ceremony starts → drive through the state machine (trust → trust → trust → grant). Substrate emits the full ceremony row chain (`module.discovered` → ... → `module.enabled`).
7. Open the Khan matter at `/matters/khan-v-acme-trading-2026`. Grants panel renders. Add a grant for Contract Review's `review` capability. Substrate emits `module.grant.created`.
8. Run buttons appear (Phase 14 D enabled-AND gate post-14.5 B). Click Run for Contract Review's `review`. Result panel renders with the kind-aware preview. Substrate emits `module.capability.invoked` + `model.call` + `module.capability.completed` + `advice_boundary.check.completed` rows.
9. Click "See audit trail for this invocation" → `/matters/khan-.../audit?invocation_id=<id>` → reconstruction view renders the filtered timeline. Substrate emits `audit.reconstruction.viewed` with `payload.scope="matter"` + `filters.invocation_id=<id>` (Phase 14.5 A unified payload contract).
10. Wall-clock budget: **<10 minutes** end-to-end. Test fails (not just warns) if it exceeds.

**Reviewer decisions for B:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| B1 | Test the CLI step in-process or via subprocess? | Subprocess via `docker compose exec` | Mocking the CLI defeats the point of the journey test |
| B2 | Wall-clock budget enforcement | Hard fail at 600s | UX bar from ACCEPTANCE.md §15-coverage |
| B3 | Per-step substrate row assertions inline OR rolled up at end? | Inline — fail at the step the row drops | Faster bisection on regression |

### Phase 15 C — Audit-emission coverage (~2 days)

**Closes:** `ACCEPTANCE.md` §6 (every documented user action lands the documented audit row).
**Builds:**

Per row in `AUDIT_EMISSION_MAP.md`, one Playwright test that:

1. Sets up the prerequisite state (logged-in user, matter open, capability granted, etc.) — uses the API fixtures for setup speed, not the UI.
2. Performs the user action through the UI (per the audit map's "User action" column).
3. Queries the substrate reconstruction endpoint (`/api/matters/{slug}/audit/reconstruction` or `/api/admin/audit/reconstruction` post-14.5 C) for the documented action string.
4. Asserts the row is present + the payload matches what `AUDIT_EMISSION_MAP.md` documents.

**Action coverage from the audit map (post-Phase-13b-D + Phase-14.5):**

Auth + first-run (9 rows):
- `auth.user.registered`, `auth.user.verified`, `auth.user.demo_seeded`, `auth.user.capabilities_auto_granted`, `auth.user.logged_in`, `auth.user.logged_out`, `auth.user.password_reset_requested`, `auth.user.password_reset_completed`, `auth.user.profile_updated`

Settings keys (2 rows):
- `user.key.configured` (with `action: "added"` + `action: "rotated"` variants), `user.key.revoked`

Matters (4 rows):
- `matter.create`, `document.upload`, `privilege.set`, `matter.deleted` (+ cascaded `module.grant.revoked`)

Modules (9 rows):
- `module.discovered`, `module.manifest.inspected`, `module.signature.checked`, `module.publisher.checked`, `module.permissions.reviewed`, `module.grant.created` (workspace-side, on ceremony), `module.enabled`, `module.denied`, `module.ceremony.rejected`, `module.updated`, `module.disabled`

Grants (2 rows + 1 no-op):
- `module.grant.created` (matter-scoped), `module.grant.revoked`, idempotent no-op (no row — assert absence)

Invocations (8 rows):
- `module.capability.invoked`, `model.call`, `model.invoked`, `advice_boundary.check.{completed,blocked,denied,failed}`, `module.capability.completed`, `posture_gate.check.blocked`, `module.capability.denied`, `module.<plugin>.model.key_missing`, `model.call.error`

Reconstruction (2 variants):
- `audit.reconstruction.viewed` with `scope: "matter"`, `audit.reconstruction.viewed` with `scope: "workspace"`

Admin (1 row):
- `user.role.changed`

Total: ~35 audit rows. Each one a test case. Group by surface category in spec files; ~6 spec files of ~5–8 cases each.

**Negative coverage:** the `NONE (read)` and `NONE (verified)` rows in the audit map get explicit "absence" assertions where they matter — e.g. listing artifacts emits NO `*.viewed` row (Phase 13b Decision #1), idempotent grant emits NO row (Phase 7 Decision #4).

**Reviewer decisions for C:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| C1 | Setup via UI or via API fixtures? | API fixtures for prerequisites; UI for the action being tested | 35 tests × 60s UI setup = 35 minutes; API setup brings it to ~6 minutes |
| C2 | Payload shape assertions: exact match OR field-presence? | Field-presence + value-match for keys named in the audit map | Audit payloads carry transient fields (latency_ms, request_id); pinning exact shape would flap |

### Phase 15 D — Posture matrix coverage (~1 day)

**Closes:** `ACCEPTANCE.md` §7 (posture-gate denial visible + actionable).
**Builds:**

For each cell in `POSTURE_GATE_UX.md`, a Playwright test that:

1. Sets the matter posture (via `PATCH /api/matters/{slug}/privilege`).
2. Sets the actor role (via `POST /api/admin/users/{id}/role` or test-only DB UPDATE per A1).
3. Opens the matter workspace.
4. Asserts the banner content matches the documented cell — exact role tokens, exact required-role tokens, exact posture badges.
5. For non-`A_cleared` postures, clicks Run on a granted capability and asserts the substrate 403 with the documented body shape. Then asserts the timeline filter deep-link (`/matters/{slug}/audit?action=posture_gate.check.blocked`) renders the row.

**Cells from POSTURE_GATE_UX.md v2 (post-Phase-14-C):**

| | `solicitor` | `qualified_solicitor` | `workspace_admin` / superuser |
| --- | --- | --- | --- |
| `A_cleared` | no banner | no banner | no banner |
| `B_mixed` | banner | no banner | **banner** (admin doesn't satisfy posture) |
| `C_paused` | banner | banner | banner + unpause hint |

9 cells = 9 tests, plus 3 invocation-denial cells from non-`A_cleared` postures.

**Reviewer decisions for D:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| D1 | Test the unpause CTA (Phase 14 G addition) | Yes — change posture B_mixed → A_cleared via the UI control; assert next page load sees no banner | Phase 14 G surface is part of the contract |

### Phase 15 E — Failure-path scenarios (~1.5 days)

**Closes:** `ACCEPTANCE.md` §11 (no hidden failures).
**Builds:**

The seven typed-error banners from `InvocationRunner` (Phase 14 D) each get an end-to-end test:

1. `PostureBlockedError` — covered by D.
2. `CapabilityDeniedError` — revoke a grant string mid-test; click Run; assert the structured banner.
3. `Phase1BlockedError` — drive an advice-boundary-blocking invocation (via a test-only `advice_tier` flag on the matter); assert the banner.
4. `ProviderKeyMissingForInvokeError` — revoke the user's key; click Run; assert the banner + `/settings/keys` deep-link.
5. `ProviderUpstreamInvokeError` — inject a provider error via a test-only env flag on the backend; assert the banner.
6. `InvocationInvalidArgsError` — Run a capability with required args missing; assert the banner.
7. Unknown envelope — substrate returns an unrecognised error shape; assert the fallback banner renders the raw substrate text.

Plus the InstallCeremony 409 invalid-transition path:
- POST `/api/modules/install/{id}/advance` with `action=grant` on a fresh ceremony → 409 → banner cites `module.ceremony.rejected` + deep-link to `/admin/audit?action=module.ceremony.rejected` (Phase 14.5 C).

Plus the GrantsPanel 404 / 409 paths from Phase 14 C: `module_not_installed` + `module_disabled`.

**Reviewer decisions for E:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| E1 | Provider error injection: real upstream call or test-only env flag? | Test-only env flag flipping `ProviderResponse` → raise `ProviderUpstreamError` | Real upstream errors are flaky; the substrate handler is what we care about |
| E2 | Phase1Blocked tier — test-only mutator on the matter, or a real advice-tier scenario? | Test-only mutator: a `_test_force_tier_above` field on the matter that the substrate honours only in `environment="test"` | Reproducing tier escalation requires a long conversation; the substrate path is what we care about |

### Phase 15 F — CI wiring + handover (~0.5 day)

**Closes:** the open question of "where does Phase 15 run?"
**Builds:**

- `.github/workflows/e2e.yml` — runs on PR + push to `runtime-rewrite`. Spins the docker-compose stack, runs `npm run e2e` against `npm run preview`. Trace + video artifacts uploaded on failure.
- Cache the Playwright browser binary so reruns are fast.
- README addition: how to run e2e locally + how to read traces from CI.
- `HANDOVER_PHASE_15_PLAYWRIGHT_DONE.md` rollup naming the four ratification hashes for B/C/D/E.

**Reviewer decisions for F:**

| # | Decision | Default | Reason |
| --- | --- | --- | --- |
| F1 | Block PR merge on e2e failure? | Yes — same as the pytest job | The whole point is "tests run against the final contract" |
| F2 | Test parallelism in CI | 2 workers default (matches GHA standard runner capacity) | Higher requires larger runners; revisit if CI runtime becomes the bottleneck |

## Total estimate

≈ 7 days of focused test work + 0.5 day CI. Six sub-steps, each with its own Reviewer ratification per the established cadence.

Phase 15 closes when:

- All six sub-steps have ratified handovers.
- The audit-emission coverage matrix is complete — every row in `AUDIT_EMISSION_MAP.md` has a passing test.
- The posture matrix is complete — every cell in `POSTURE_GATE_UX.md` has a passing test.
- The first-run scenario passes within the 10-minute wall-clock budget.
- CI runs e2e on every PR; failure blocks merge.

## What this is NOT

- **Not feature work.** Zero new product surface. Zero new substrate. Zero new audit emissions.
- **Not a refactor.** The existing 123-test Vitest suite stays. Playwright sits on top.
- **Not a one-off.** The suite is the regression-prevention spine for everything after Phase 15.
- **Not hosted-eval testing.** `legalise.dev` smoke is separate.

## Handover convention

Per sub-step:
- `docs/handovers/HANDOVER_PHASE_15_<letter>_<name>_DONE.md`
- Reviewer ratification hash recorded

Phase 15 closes with `docs/handovers/HANDOVER_PHASE_15_PLAYWRIGHT_DONE.md` summarising the six sub-steps + the test counts + the CI status.

## Hand to Reviewer

This plan is the input. **No test code lands before Reviewer ratifies.** Same cadence as 13b / 14 / 14.5.
