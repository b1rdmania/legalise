# Audit Coverage Matrix

**Phase 15 C deliverable.** Transcription of `AUDIT_EMISSION_MAP.md` with a coverage marker per row. Source of truth for *which tests exist*; the audit map is still the source of truth for *what the substrate emits*.

Every row carries one of:

- `e2e-covered` — Playwright spec under `frontend/e2e/` exercises this row through the real UI + substrate path. Spec file named.
- `pytest-covered` — backend pytest already covers this row substrate-side; e2e doesn't duplicate. Test file named.
- `not-coverable-yet` — no real product / operator surface produces this emission from documented inputs today. Filed as a Phase 15 finding; pytest stays the substrate-side coverage.
- `none-row-asserted` — audit map says NONE for this surface; Playwright asserts the absence of a matching row.

Updates here when a row's coverage changes. The matrix lives next to the audit map deliberately so a row added to the map gets a coverage entry in the same PR.

## Coverage status by surface

### Auth + first-run

| Action | Coverage | Test |
| --- | --- | --- |
| `auth.user.registered` | e2e-covered | `e2e/first-run.spec.ts` step 2 |
| `auth.user.verified` | e2e-covered | `e2e/first-run.spec.ts` step 2 |
| `auth.user.demo_seeded` | e2e-covered | `e2e/first-run.spec.ts` step 2 + `e2e/smoke.spec.ts` |
| `auth.user.capabilities_auto_granted` | e2e-covered | `e2e/first-run.spec.ts` step 2 |
| `auth.user.logged_in` | pytest-covered | `backend/tests/test_phase13b_audit_gap_fill.py::test_login_and_logout_emit_canonical_audit` (e2e signs in for setup; semantic emission already pinned substrate-side) |
| `auth.user.logged_out` | pytest-covered | same |
| `auth.user.password_reset_requested` | not-coverable-yet | substrate emits via the password-reset flow; e2e needs a deterministic email→token loop. Pytest pins the emission (`test_phase13b_audit_gap_fill.py`). |
| `auth.user.password_reset_completed` | not-coverable-yet | same as above |
| `auth.user.profile_updated` | e2e-covered | `e2e/first-run.spec.ts` step 6 (PATCH default model) |
| `user.admin.bootstrapped` | e2e-covered | `e2e/first-run.spec.ts` step 4 (real Phase 12 CLI) |

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
| `matter.create` | e2e-covered | `e2e/first-run.spec.ts` step 6 |
| `document.upload` | e2e-covered | `e2e/audit/matters.spec.ts` |
| `privilege.set` | e2e-covered | `e2e/posture.spec.ts` (Phase 15 D) |
| `matter.deleted` | e2e-covered | `e2e/audit/matters.spec.ts` |
| `module.grant.revoked` (cascade on archive) | pytest-covered | `backend/tests/test_phase7_grants*.py` |
| `GET /api/matters` (NONE) | none-row-asserted | `e2e/audit/matters.spec.ts` |
| `GET /api/matters/{slug}` (NONE) | none-row-asserted | `e2e/audit/matters.spec.ts` |

### Modules + install ceremony

| Action | Coverage | Test |
| --- | --- | --- |
| `module.discovered` | e2e-covered | `e2e/first-run.spec.ts` step 7 |
| `module.manifest.inspected` | e2e-covered | `e2e/first-run.spec.ts` step 7 |
| `module.signature.checked` | e2e-covered | `e2e/first-run.spec.ts` step 7 |
| `module.publisher.checked` | e2e-covered | `e2e/first-run.spec.ts` step 7 |
| `module.permissions.reviewed` | e2e-covered | `e2e/first-run.spec.ts` step 7 |
| `module.enabled` | e2e-covered | `e2e/first-run.spec.ts` step 7 |
| `module.denied` | e2e-covered | `e2e/failure-paths.spec.ts` (Phase 15 E) |
| `module.ceremony.rejected` | e2e-covered | `e2e/failure-paths.spec.ts` (InstallCeremony 409 path) |
| `module.updated` | pytest-covered | `backend/tests/test_phase4_modules*.py` (workflow needs a second manifest version; deferred for e2e) |
| `module.disabled` | e2e-covered | `e2e/failure-paths.spec.ts` (revoke triggers it) |

### Grants

| Action | Coverage | Test |
| --- | --- | --- |
| `module.grant.created` | e2e-covered | `e2e/first-run.spec.ts` step 8 |
| `module.grant.revoked` | e2e-covered | `e2e/failure-paths.spec.ts` |
| Idempotent re-grant (NONE) | none-row-asserted | `e2e/audit/grants-idempotent.spec.ts` |

### Invocations

| Action | Coverage | Test |
| --- | --- | --- |
| `module.capability.invoked` | e2e-covered | `e2e/first-run.spec.ts` step 9 |
| `model.call` | e2e-covered | `e2e/first-run.spec.ts` step 9 (stub-echo) |
| `model.invoked` | e2e-covered | `e2e/first-run.spec.ts` step 9 |
| `module.capability.completed` | e2e-covered | `e2e/first-run.spec.ts` step 9 |
| `advice_boundary.check.completed` | e2e-covered | `e2e/first-run.spec.ts` step 9 (gated capability path) |
| `advice_boundary.check.blocked` | not-coverable-yet | requires tier-escalation conversation; no documented input from the UI today. Pytest pins it (`backend/tests/test_phase9_pre_motion_vertical_slice.py`). |
| `advice_boundary.check.denied` | not-coverable-yet | same |
| `advice_boundary.check.failed` | not-coverable-yet | same |
| `posture_gate.check.blocked` | e2e-covered | `e2e/posture.spec.ts` (Phase 15 D) |
| `module.capability.denied` | e2e-covered | `e2e/failure-paths.spec.ts` |
| `module.<plugin>.model.key_missing` | e2e-covered | `e2e/failure-paths.spec.ts` (revoke key + run) |
| `model.call.error` | not-coverable-yet | requires inducing real provider upstream errors deterministically; no documented surface produces this from the UI today. Pytest pins the substrate handler. |

### Reconstruction

| Action | Coverage | Test |
| --- | --- | --- |
| `audit.reconstruction.viewed` (scope=matter) | e2e-covered | `e2e/first-run.spec.ts` step 10 |
| `audit.reconstruction.viewed` (scope=workspace) | e2e-covered | `e2e/audit/admin-audit.spec.ts` |

### Admin

| Action | Coverage | Test |
| --- | --- | --- |
| `user.role.changed` | e2e-covered | `e2e/audit/admin-roles.spec.ts` |
| Idempotent same-role POST (NONE) | none-row-asserted | `e2e/audit/admin-roles.spec.ts` |

## Phase 15 not-coverable-yet findings

Filed for future product / operator surfaces; pytest is the substrate-side coverage layer until they're closed.

### 15-#1 — password reset flow needs a deterministic token loop

`auth.user.password_reset_requested` and `auth.user.password_reset_completed` emit via the fastapi-users forgot/reset endpoints. The reset token is sent via email; no in-band surface exposes it to a test runner without intercepting the mail transport. **Pytest covers:** `backend/tests/test_phase13b_audit_gap_fill.py::test_forgot_password_emits_audit` + `test_reset_password_emits_audit`. **What it'd take to close:** an explicit "list pending reset tokens" admin endpoint, or wire the test to read the outbox of a stub mailer.

### 15-#2 — advice-boundary blocked/denied/failed paths need an escalation scenario

`advice_boundary.check.{blocked,denied,failed}` emit when a capability's runtime advice tier exceeds the declared `advice_tier_max`. Producing this from the UI requires a multi-turn conversation that walks the tier scale; no documented input from the matter workspace today triggers it deterministically. **Pytest covers:** `backend/tests/test_phase9_pre_motion_vertical_slice.py` exercises the gate via direct substrate calls. **What it'd take to close:** a capability that explicitly invokes the gate with a configurable tier, or operator tooling that pins a matter to a runtime tier.

### 15-#3 — `model.call.error` needs deterministic provider upstream failure

The substrate's `ProviderUpstreamError` handler emits `model.call.error`. Producing it from the UI requires the provider to return a real error; the stub-echo path never fails. **Pytest covers:** `backend/tests/test_phase10*.py` exercises the handler with a faulting mock. **What it'd take to close:** a real-but-faulting provider in test mode (substrate change), or a documented operator path to force a provider response.

### 15-#4 — `module.updated` workflow needs a second manifest version

`module.updated` lands when an admin POSTs to `/api/modules/{id}/update` with a new manifest. The e2e env has one manifest version per module on disk; producing two requires either staging a second module dir or operator tooling to bump versions. **Pytest covers:** `backend/tests/test_phase4_modules*.py`.

---

These findings are not blockers for Phase 15. Each names what would unblock e2e coverage; none requires substrate-only-for-tests changes. Phase 16+ can pick them up if real product surfaces emerge.
