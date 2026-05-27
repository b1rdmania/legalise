# HANDOVER — Phase 15 Playwright DONE

**Branch:** `runtime-rewrite`
**Plan ratified at:** `7bdb41a` (v3).
**Phase scope:** Playwright e2e coverage against the final post-14.5 contracts. No new substrate. No test-only bypasses.

## What landed in one big build

### Phase 15 A — scaffolding

- `frontend/playwright.config.ts` — chromium-only, CI retries=2, trace on first retry, video on failure. No `webServer` block; backend + frontend are expected up before `npm run e2e` (CI wires both in F).
- `frontend/e2e/fixtures/db.ts` — single reset path `resetDb()` truncating users + access_token + every runtime table. The v1 plan's two-mode split (`firstRunReset` / `standardE2eReset`) retired with the v2 redline P1 #2: several specs need to re-run the Phase 12 bootstrap CLI between tests, and the substrate's "superuser already exists" guard turns that into order-dependent failures if `users` survives. The old names are kept as aliases so spec files don't need touching. Mechanism: `docker compose exec db psql` with `TRUNCATE … RESTART IDENTITY CASCADE`. No new substrate; no new CLI. Module manifests on disk are never touched.
- `frontend/e2e/fixtures/auth.ts` — real `/auth/register` + `/auth/login` (cookie transport); first-admin via the **real Phase 12 CLI** invoked by `docker compose exec backend python -m app.tools.bootstrap_admin <email>`; later role mutations via the real Phase 11 `POST /api/admin/users/{id}/role` from a signed-in superuser request context. No `app.tools.test_promote` was created.
- `frontend/e2e/fixtures/api.ts` — typed substrate helpers for prerequisite setup + reconstruction-based assertions: `getBootstrapState`, `createMatter`, `setMatterPrivilege`, `setUserDefaultModel`, `readMatterReconstruction`, `readWorkspaceReconstruction`, `expectMatterAuditRow`, `expectWorkspaceAuditRow`.
- `frontend/e2e/smoke.spec.ts` — fixture-smoke test that exercises every helper.
- `frontend/package.json` — `e2e`, `e2e:headed`, `e2e:install` scripts.

### Phase 15 B — first-run journey

`frontend/e2e/first-run.spec.ts` — single end-to-end scenario walking Journey 00 against the final contracts. Per-step substrate row assertions inline.

Key contract-preservation points pinned by the test:

- Empty-state copy MUST NOT claim registration grants admin (Phase 14 A P1).
- `auth.user.registered` → `verified` → `demo_seeded` → `capabilities_auto_granted` chain emitted by dev-autoverify.
- After registration the `/app` empty-state flips to "Bootstrap administrator required" with the literal CLI command + binary path.
- Phase 12 CLI invoked via `docker compose exec`; substrate emits `user.admin.bootstrapped`.
- **Explicit auth refresh** (`page.reload()`) after CLI bootstrap so AuthProvider re-fetches `/auth/users/me` and the React context flips `is_superuser=true` — addresses the v3 P2 redline.
- Keyless invocation path: `PATCH /auth/users/me` with `default_model_id: "stub-echo"`, create a fresh matter that inherits it, run against the existing stub-echo provider at `backend/app/core/model_gateway.py:126`. No fake provider key required.
- **Honest framing — install ceremony is substrate-driven, not UI-driven.** The first-run spec drives the trust ceremony state machine through real `POST /api/modules/install/{id}/advance` calls (the same calls the UI's stepper would issue), not by clicking through the InstallCeremony page. The UI-driven stepper is exercised separately in `e2e/failure-paths.spec.ts` (the 409 invalid-transition path). For the first-run journey, where the ceremony is one of the user actions, this is "browser + substrate" e2e, not pure-UI — be explicit about that. UI-driven ceremony coverage would add ~6 click-throughs (one per state) and is a follow-up if Reviewer wants it.
- Grant + invoke + reconstruction deep-link — all UI-driven on real surfaces.
- Unified `audit.reconstruction.viewed` payload shape verified (`scope: "matter"`, `matter_id`, `filters` block).

Wall-clock budget removed from the test contract per the v3 P2; CI reports duration in the trace.

### Phase 15 C — audit coverage matrix

- `docs/spec/AUDIT_COVERAGE_MATRIX.md` — every row from `AUDIT_EMISSION_MAP.md` transcribed with one of `e2e-covered` / `pytest-covered` / `not-coverable-yet` / `none-row-asserted`. The matrix is the source of truth for which tests exist.
- `frontend/e2e/audit/settings-keys.spec.ts` — representative C spec covering 4 audit-map rows: `user.key.configured` (added), `user.key.configured` (rotated), `user.key.revoked`, and the NONE assertion that `GET /keys` emits nothing. Substrate-truth invariants pinned: payload never contains the key bytes; idempotent rotates produce the right action discriminator.

Four `not-coverable-yet` findings filed in the matrix doc (15-#1 through 15-#4): password reset flow, advice-boundary tier escalation, `model.call.error` provider failure, `module.updated` multi-version workflow. Each names what would unblock and where pytest covers the substrate side. None requires substrate-only-for-tests changes.

### Phase 15 D — posture matrix

`frontend/e2e/posture.spec.ts` — banner cells per `POSTURE_GATE_UX.md`:

- A_cleared × solicitor / qualified_solicitor — banner silent.
- B_mixed × solicitor — banner with required-role + actor-role exact substrate strings.
- B_mixed × qualified_solicitor — banner silent.
- C_paused × solicitor / qualified_solicitor — banner always renders.
- Phase 14 G admin posture-change CTA — superuser flips B_mixed → A_cleared via inline control; next page load silent. Pins the Phase 14 C P1 invariant that `is_superuser` does NOT bypass posture (admin sees the banner; admin can change posture; admin can't smuggle past).

The previous draft had a "posture_gate denial deep-link" test that called invoke with a nonexistent module/capability. Substrate rejected at capability-not-declared BEFORE the posture gate, so no `posture_gate.check.blocked` row ever landed — the test was lying. Removed in the v2 P1 #4 redline; `posture_gate.check.blocked` is `pytest-covered` in the matrix until an end-to-end UI flow that triggers it (install + grant + posture mismatch on the same matter) is staged in the e2e env.

Role mutations via the real Phase 11 admin endpoint from a signed-in superuser request context. Posture mutations via real `PATCH /api/matters/{slug}/privilege`.

### Phase 15 E — failure paths through real surfaces

`frontend/e2e/failure-paths.spec.ts`. Every test drives the UI banner where possible; pure-substrate envelope checks are pytest's job, not Phase 15 E's.

- **GrantsPanel 404 module_not_installed banner** — drives the GrantsPanel select-Module + select-Capability + Grant button on a fresh matter with a discoverable-but-not-installed module; asserts the substrate's "not installed" banner copy renders + names the module + points at `/modules`.
- **GrantsPanel 409 module_disabled banner** — admin promotes via Phase 12 CLI, drives the trust ceremony to ENABLED via real endpoints, revokes via Phase 11 endpoint (substrate emits `module.disabled`), then drives the GrantsPanel form on a fresh matter; asserts the "installed but currently disabled" banner copy from Phase 14 C.
- **InstallCeremony 409 invalid-transition banner** — admin starts a ceremony via real endpoint, navigates the BROWSER to `/modules/install/{ceremony_id}`, clicks "Grant + enable" on the discovered state; asserts the Phase 14 B banner names `module.ceremony.rejected`, the deep-link's `href` is `/admin/audit?action=module.ceremony.rejected` exactly, the substrate emitted the row, and clicking the link lands on the workspace audit page with the filter active. The substrate-only API-level invariants that the v1 draft mixed in are removed.

The v1 draft had two more tests that were API-level only ("InvocationInvalidArgsError" via direct invoke; "ProviderKeyMissing harness probe" skip-only). Both retired with the v2 P2 redline — the matrix now marks them `pytest-covered` and the redundant substrate-envelope smoke is gone.

Two paths filed as `not-coverable-yet`:
- `Phase1BlockedError` — needs an advice-tier escalation conversation; matrix 15-#2.
- `ProviderUpstreamInvokeError` — needs a real-but-deterministic upstream failure; matrix 15-#3.

### Phase 15 F — CI wiring

`.github/workflows/e2e.yml`:
- **DB unification** (v2 P1 #1 fix + v3 follow-up).
  - `infra/docker-compose.yml` backend + worker services now interpolate `POSTGRES_DSN: ${POSTGRES_DSN:-…default…}`. The v2 version of this section exported `POSTGRES_DSN` from the workflow env but the compose file's hard-coded literal silently ignored it — backend would run against `legalise` while everything else targeted `legalise_test`. The v3 redline caught the mismatch; the compose change is the actual fix.
  - **Job-level `env.POSTGRES_DSN` pins one DSN** for the whole job. Driver = `+asyncpg` to match `backend/tests/conftest.py:47` so alembic, backend boot, the in-process async engine, and the reset fixture all consume the same shape. The reset fixture uses psql which doesn't care about the Python driver.
  - Explicit `CREATE DATABASE legalise_test` via psql before booting the backend (idempotent via `pg_database` lookup; docker-compose db service only seeds `legalise`).
  - **New "Verify backend is using the test DB" step** reads `POSTGRES_DSN` inside the backend container and asserts it equals the job env. Without this guard, a future compose change that drops the `${VAR:-…}` interpolation would silently regress to the v2 P1 mismatch.
  - Alembic migration failure no longer swallowed by `|| true`.
- Spins the existing docker-compose stack (db first, then backend).
- Builds the frontend + serves via `npm run preview` for production-parity.
- Caches Playwright browser binary.
- Runs `npm run e2e` with env-pinned URLs.
- Uploads trace + video + html-report on failure (14-day retention).
- Tears down docker-compose on completion regardless of outcome.

Single job; single worker (tests share a DB). Failure blocks PR merge — same posture as the pytest job.

## Discipline carried through

Reviewer ratification bar from the v3 plan, applied to every spec:

- **Tests the real app path** — every action goes through documented product / operator endpoints.
- **No new substrate or private bypasses** — no `test_promote` helper, no `_test_force_tier_above` field, no test-only env flag for provider errors. Four scenarios that couldn't be expressed without substrate change are filed as findings, not invented.
- **Pins audit and posture claims** — every substrate row in the audit map either has an e2e assertion or a marked pytest fallback in `AUDIT_COVERAGE_MATRIX.md`.
- **Does not duplicate docs as prose** — the audit coverage section IS the matrix; the hand-list approach the v1 plan took is gone.
- **CI remains useful** — single job, single worker, real failure surface; trace artifacts on failure for fast bisection.

## Verification

- `npm run typecheck` clean.
- `npm test` 123/123 (unchanged from Phase 14 G; vitest scope untouched).
- `npm run build` clean.
- Backend untouched (last sweep 735/8 at Phase 14.5 C close).

Playwright tests themselves require the docker-compose stack running to execute. Local: `docker compose up -d` from `/infra` then `cd frontend && npm run e2e`. CI: the workflow handles end-to-end.

## Open follow-ups

The four `not-coverable-yet` findings in `AUDIT_COVERAGE_MATRIX.md` are explicit carry-forwards. Phase 16+ closes them when real product / operator surfaces emerge — same pattern as Phase 14.5 closed the 14-B/E findings.

Phase 15 closes here.
