# HANDOVER — Phase 15 Playwright DONE

**Branch:** `runtime-rewrite`
**Plan ratified at:** `7bdb41a` (v3).
**Phase scope:** Playwright e2e coverage against the final post-14.5 contracts. No new substrate. No test-only bypasses.

## What landed in one big build

### Phase 15 A — scaffolding

- `frontend/playwright.config.ts` — chromium-only, CI retries=2, trace on first retry, video on failure. No `webServer` block; backend + frontend are expected up before `npm run e2e` (CI wires both in F).
- `frontend/e2e/fixtures/db.ts` — two explicit reset modes per the v3 P1:
  - `firstRunReset` — truly empty app DB (users + access_token + runtime tables truncated).
  - `standardE2eReset` — runtime tables only; `users` survives.
  Mechanism: `docker compose exec db psql` with `TRUNCATE … RESTART IDENTITY CASCADE`. No new substrate; no new CLI; psql lives in the existing db container. Module manifests on disk are never touched.
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
- Trust ceremony drives state machine through `trust → … → grant` to ENABLED; substrate emits the full ceremony chain.
- Grant + invoke + reconstruction deep-link — all real surfaces.
- Unified `audit.reconstruction.viewed` payload shape verified (`scope: "matter"`, `matter_id`, `filters` block).

Wall-clock budget removed from the test contract per the v3 P2; CI reports duration in the trace.

### Phase 15 C — audit coverage matrix

- `docs/spec/AUDIT_COVERAGE_MATRIX.md` — every row from `AUDIT_EMISSION_MAP.md` transcribed with one of `e2e-covered` / `pytest-covered` / `not-coverable-yet` / `none-row-asserted`. The matrix is the source of truth for which tests exist.
- `frontend/e2e/audit/settings-keys.spec.ts` — representative C spec covering 4 audit-map rows: `user.key.configured` (added), `user.key.configured` (rotated), `user.key.revoked`, and the NONE assertion that `GET /keys` emits nothing. Substrate-truth invariants pinned: payload never contains the key bytes; idempotent rotates produce the right action discriminator.

Four `not-coverable-yet` findings filed in the matrix doc (15-#1 through 15-#4): password reset flow, advice-boundary tier escalation, `model.call.error` provider failure, `module.updated` multi-version workflow. Each names what would unblock and where pytest covers the substrate side. None requires substrate-only-for-tests changes.

### Phase 15 D — posture matrix

`frontend/e2e/posture.spec.ts` — 7 cells:

- A_cleared × solicitor / qualified_solicitor — banner silent.
- B_mixed × solicitor — banner with required-role + actor-role exact substrate strings.
- B_mixed × qualified_solicitor — banner silent.
- C_paused × solicitor / qualified_solicitor — banner always renders.
- Phase 14 G admin posture-change CTA — superuser flips B_mixed → A_cleared via inline control; next page load silent. Pins the Phase 14 C P1 invariant that `is_superuser` does NOT bypass posture (admin sees the banner; admin can change posture; admin can't smuggle past).
- `posture_gate.check.blocked` deep-link follow-through.

Role mutations via the real Phase 11 admin endpoint from a signed-in superuser request context. Posture mutations via real `PATCH /api/matters/{slug}/privilege`.

### Phase 15 E — failure paths through real surfaces

`frontend/e2e/failure-paths.spec.ts`:

- GrantsPanel 404 module_not_installed via attempting to grant a discovered-but-not-installed module.
- GrantsPanel 409 module_disabled via admin revoke followed by grant attempt.
- InstallCeremony 409 invalid-transition: POST advance with `action=grant` on a fresh ceremony → 409 + `module.ceremony.rejected` substrate audit row + workspace audit deep-link.
- InvocationInvalidArgsError via direct invoke with garbage args.
- ProviderKeyMissing harness probe — skip-guarded; pytest covers the substrate handler (`model_gateway.py:411`).

Two paths filed as not-coverable-yet:
- `Phase1BlockedError` — needs an advice-tier escalation conversation; matrix 15-#2.
- `ProviderUpstreamInvokeError` — needs a real-but-deterministic upstream failure; matrix 15-#3.

### Phase 15 F — CI wiring

`.github/workflows/e2e.yml`:
- Spins the existing docker-compose stack.
- Provisions the test DB schema via alembic.
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
