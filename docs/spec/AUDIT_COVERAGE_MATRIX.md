# Audit Coverage Matrix

**Phase 15 C deliverable.** Transcription of `AUDIT_EMISSION_MAP.md` with a coverage marker per row. Source of truth for *which tests exist*; the audit map is still the source of truth for *what the substrate emits*.

Every row carries one of:

- `e2e-covered` — Playwright spec under `frontend/e2e/` exercises this row through the real UI + substrate path. Spec file path named.
- `pytest-covered` — backend pytest covers this row substrate-side; e2e doesn't duplicate.
- `not-coverable-yet` — no real product / operator surface produces this emission from documented inputs today. Finding filed; pytest remains the substrate-side coverage.
- `none-row-asserted` — audit map says NONE for this surface; Playwright asserts the absence of a matching row.

Discipline: a row is marked `e2e-covered` only if a spec file actually exists and asserts the row by name. The v1 matrix overclaimed several rows where the referenced spec didn't exist; this version was audited against the on-disk specs and trimmed.

## Coverage status by surface

### Auth + first-run

| Action | Coverage | Test |
| --- | --- | --- |
| `auth.user.registered` | e2e-covered | `e2e/first-run.spec.ts` |
| `auth.user.verified` | e2e-covered | `e2e/first-run.spec.ts` |
| `auth.user.demo_seeded` | e2e-covered | `e2e/first-run.spec.ts` + `e2e/smoke.spec.ts` |
| `auth.user.capabilities_auto_granted` | e2e-covered | `e2e/first-run.spec.ts` |
| `auth.user.logged_in` | pytest-covered | `backend/tests/test_phase13b_audit_gap_fill.py::test_login_and_logout_emit_canonical_audit` |
| `auth.user.logged_out` | pytest-covered | same |
| `auth.user.password_reset_requested` | not-coverable-yet (15-#1) | `backend/tests/test_phase13b_audit_gap_fill.py::test_forgot_password_emits_audit` |
| `auth.user.password_reset_completed` | not-coverable-yet (15-#1) | `backend/tests/test_phase13b_audit_gap_fill.py::test_reset_password_emits_audit` |
| `auth.user.profile_updated` | e2e-covered | `e2e/first-run.spec.ts` (PATCH default model step) |
| `user.admin.bootstrapped` | e2e-covered | `e2e/first-run.spec.ts` (real Phase 12 CLI) |

### Settings / BYO keys

| Action | Coverage | Test |
| --- | --- | --- |
| `user.key.configured` (added) | e2e-covered | `e2e/audit/settings-keys.spec.ts` |
| `user.key.configured` (rotated) | e2e-covered | `e2e/audit/settings-keys.spec.ts` |
| `user.key.revoked` | e2e-covered | `e2e/audit/settings-keys.spec.ts` |
| `GET /api/settings/keys` (NONE) | none-row-asserted | `e2e/audit/settings-keys.spec.ts` |

### Matters

| Action | Coverage | Test |
| --- | --- | --- |
| `matter.create` | e2e-covered | `e2e/first-run.spec.ts` |
| `document.upload` | pytest-covered | `backend/tests/test_phase4_matters*.py` |
| `privilege.set` | e2e-covered | `e2e/posture.spec.ts` (PATCH /privilege happens in setup) |
| `matter.deleted` | pytest-covered | `backend/tests/test_phase4_matters*.py` |
| `module.grant.revoked` (cascade on archive) | pytest-covered | `backend/tests/test_phase7_grants*.py` |
| `GET /api/matters` (NONE) | pytest-covered | substrate audit middleware skips GETs by design; pytest asserts no `http.*` rows for reads |
| `GET /api/matters/{slug}` (NONE) | pytest-covered | same |

### Modules + install ceremony

| Action | Coverage | Test |
| --- | --- | --- |
| `module.discovered` | e2e-covered | `e2e/first-run.spec.ts` (ceremony chain) |
| `module.manifest.inspected` | e2e-covered | `e2e/first-run.spec.ts` |
| `module.signature.checked` | e2e-covered | `e2e/first-run.spec.ts` |
| `module.publisher.checked` | e2e-covered | `e2e/first-run.spec.ts` |
| `module.permissions.reviewed` | e2e-covered | `e2e/first-run.spec.ts` |
| `module.enabled` | e2e-covered | `e2e/first-run.spec.ts` |
| `module.denied` | pytest-covered | `backend/tests/test_trust_ceremony.py` (e2e env has no deterministic reject-path scenario yet) |
| `module.ceremony.rejected` | e2e-covered | `e2e/failure-paths.spec.ts` (invalid-transition path) |
| `module.updated` | pytest-covered (15-#4) | `backend/tests/test_phase4_modules*.py` |
| `module.disabled` | e2e-covered | `e2e/failure-paths.spec.ts` (revoke triggers it) |

### Grants

| Action | Coverage | Test |
| --- | --- | --- |
| `module.grant.created` | e2e-covered | `e2e/first-run.spec.ts` |
| `module.grant.revoked` | pytest-covered | `backend/tests/test_phase7_grants*.py` (e2e drives `module.disabled` cascade but not the row-level revoke yet) |
| Idempotent re-grant (NONE) | pytest-covered | `backend/tests/test_phase7_grants*.py::test_idempotent_grant_is_noop` |

### Invocations

| Action | Coverage | Test |
| --- | --- | --- |
| `module.capability.invoked` | e2e-covered | `e2e/first-run.spec.ts` |
| `model.call` | e2e-covered | `e2e/first-run.spec.ts` (stub-echo) |
| `model.invoked` | pytest-covered | `backend/tests/test_invocations_api.py` (the audit_cost helper emits; e2e asserts the parent invocation chain, not this row by name) |
| `module.capability.completed` | e2e-covered | `e2e/first-run.spec.ts` |
| `advice_boundary.check.completed` | pytest-covered | `backend/tests/test_phase9_pre_motion_vertical_slice.py` (first-run's stub-echo capability may not drive the gate; substrate test pins the row) |
| `advice_boundary.check.blocked` | not-coverable-yet (15-#2) | `backend/tests/test_phase9_pre_motion_vertical_slice.py` |
| `advice_boundary.check.denied` | not-coverable-yet (15-#2) | same |
| `advice_boundary.check.failed` | not-coverable-yet (15-#2) | same |
| `posture_gate.check.blocked` | pytest-covered | `backend/tests/test_posture_gate.py` (UI banner tested separately in `posture.spec.ts`; producing the row from an end-to-end UI flow requires installing a module + granting + posture mismatch — not staged in the e2e env yet) |
| `module.capability.denied` | pytest-covered | `backend/tests/test_invocations_api.py` |
| `module.<plugin>.model.key_missing` | pytest-covered | `backend/tests/test_invocations_api.py::test_invoke_provider_key_missing_returns_422` |
| `model.call.error` | not-coverable-yet (15-#3) | `backend/tests/test_invocations_api.py::test_invoke_provider_upstream_error_returns_502` |

### Reconstruction

| Action | Coverage | Test |
| --- | --- | --- |
| `audit.reconstruction.viewed` (scope=matter) | e2e-covered | `e2e/first-run.spec.ts` |
| `audit.reconstruction.viewed` (scope=workspace) | pytest-covered | `backend/tests/test_phase14_5_c_admin_reconstruction.py::test_emits_unified_payload_shape_with_workspace_scope` |

### Admin

| Action | Coverage | Test |
| --- | --- | --- |
| `user.role.changed` | pytest-covered | `backend/tests/test_phase11_admin_users*.py` (e2e drives the Phase 11 endpoint in setup, no Playwright spec asserts the row by name yet) |
| Idempotent same-role POST (NONE) | pytest-covered | `backend/tests/test_phase11_admin_users*.py::test_same_role_noop_no_audit_row` |

## Phase 15 not-coverable-yet findings

Filed for future product / operator surfaces. Pytest is the substrate-side coverage until they're closed. None requires substrate-only-for-tests changes.

### 15-#1 — password reset flow needs a deterministic token loop

`auth.user.password_reset_requested` + `auth.user.password_reset_completed` emit via fastapi-users forgot/reset endpoints. The reset token is sent by email; no in-band surface exposes it to a test runner without intercepting the mail transport. **Pytest covers:** `test_phase13b_audit_gap_fill.py::test_forgot_password_emits_audit` + `test_reset_password_emits_audit`. **What unblocks:** an admin endpoint that lists pending reset tokens, or a stubbed mailer test runners can read.

### 15-#2 — advice-boundary blocked/denied/failed paths need an escalation scenario

`advice_boundary.check.{blocked,denied,failed}` emit when a capability's runtime advice tier exceeds its declared `advice_tier_max`. Producing this through the UI requires a multi-turn conversation that walks the tier scale; no documented input from the matter workspace triggers it deterministically. **Pytest covers:** `test_phase9_pre_motion_vertical_slice.py` exercises the gate via direct substrate calls. **What unblocks:** a capability that explicitly invokes the gate with a configurable tier, or operator tooling that pins a matter to a runtime tier.

### 15-#3 — `model.call.error` needs deterministic provider upstream failure

The substrate's `ProviderUpstreamError` handler emits `model.call.error`. Producing it from the UI requires the provider to return a real error; the stub-echo path never fails. **Pytest covers:** `test_invocations_api.py`. **What unblocks:** a real-but-faulting provider in test mode (substrate change), or a documented operator path to force a provider response. Neither is in scope for Phase 15.

### 15-#4 — `module.updated` workflow needs a second manifest version

`module.updated` lands when an admin POSTs to `/api/modules/{id}/update` with a new manifest. The e2e env has one manifest version per module on disk; producing two requires staging a second module dir or operator tooling to bump versions. **Pytest covers:** `test_phase4_modules*.py`.

---

These findings are not blockers for Phase 15. They name what unblocks e2e coverage and where pytest holds the substrate side. Phase 16+ picks them up if real product surfaces emerge.
