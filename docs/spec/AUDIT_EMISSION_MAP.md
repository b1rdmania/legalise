# Audit Emission Map (v3)

The UI contract for audit emissions. Every user action gets a row here: the audit action it triggers, or an explicit `none` with justification.

Phase 13 Decision #4: **a button that emits no audit row is a deliberate choice the spec records; a button that should emit one but doesn't is a finding.** This map is the source of truth.

**v3 patch (Phase 13b D landed):** every GAP from v2 is now either VERIFIED with a `file:line` reference, or explicitly NONE (verified) with the design reason. The audit-shape surface required for the UI is now complete in substrate.

## Status legend

- **VERIFIED** — substrate emits this exact action string; reference `file:line` checked
- **NONE (read)** — read endpoint; no audit by design
- **NONE (verified)** — substrate explicitly does not emit; deliberate choice

## Conventions

- "Audit row" here always means a row in `audit_entries`. Structured log lines (e.g. `logger.info("auth.user.registered", ...)`) are NOT audit rows. Where v1 conflated the two, v3 separates them.
- Substrate-emitted rows are written by `app.core.api.audit.log`, `audit_failure`, or `audit_phase1`. The UI doesn't emit them; it triggers them via the API call.

## Auth + first-run

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| Click "Register first account" | `POST /auth/register` | **VERIFIED** | `auth.user.registered` — payload deliberately empty; `actor_id` + `resource_id` are the durable handles, the `users` table is the single PII source | `backend/app/core/auth.py:72` |
| Auto-seed Khan v Acme on first register | (registration hook) | **VERIFIED** | `auth.user.demo_seeded` (actor_id=NULL, system-acting) | `backend/app/core/auth.py:147` |
| Auto-grant declared capabilities | (registration hook) | **VERIFIED** | `auth.user.capabilities_auto_granted` (actor_id=NULL, payload.triple_count) | `backend/app/core/auth.py:181` |
| Verify email (or dev autoverify) | `POST /auth/verify` (or hook) | **VERIFIED** | `auth.user.verified` — emitted from `_post_verify` so both real-verify and dev-autoverify paths land it | `backend/app/core/auth.py:130` |
| Log in | `POST /auth/login` | **VERIFIED** | `auth.user.logged_in` — emitted by `AuditingDatabaseStrategy.write_token` on the request session | `backend/app/core/auth.py:287` |
| Log out | `POST /auth/logout` | **VERIFIED** | `auth.user.logged_out` — emitted by `AuditingDatabaseStrategy.destroy_token` | `backend/app/core/auth.py:303` |
| Forgot password | `POST /auth/forgot-password` | **VERIFIED** | `auth.user.password_reset_requested` | `backend/app/core/auth.py:195` |
| Reset password | `POST /auth/reset-password` | **VERIFIED** | `auth.user.password_reset_completed` | `backend/app/core/auth.py:212` |
| Bootstrap admin (CLI) | (CLI) | **VERIFIED** | `user.admin.bootstrapped` (actor_id=NULL) | `backend/app/tools/bootstrap_admin.py` |

## Settings / BYO keys

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| View profile | `GET /auth/users/me` | NONE (read) | — | — |
| Update profile | `PATCH /auth/users/me` | **VERIFIED** | `auth.user.profile_updated` (payload.fields_changed; passwords never recorded) | `backend/app/core/auth.py:233` |
| List configured keys | `GET /api/settings/keys` | NONE (read) | — | — |
| Add provider key | `POST /api/settings/keys` | **VERIFIED** | `user.key.configured` with `payload.action="added"` — key bytes never in payload | `backend/app/api/settings.py:83` |
| Rotate provider key | `POST /api/settings/keys` (upsert) | **VERIFIED** | `user.key.configured` with `payload.action="rotated"` | `backend/app/api/settings.py:83` |
| Remove provider key | `DELETE /api/settings/keys/{provider}` | **VERIFIED** | `user.key.revoked` (payload.provider) | `backend/app/api/settings.py:122` |

## Matters

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| List matters | `GET /api/matters` | NONE (read) | — | — |
| Create matter | `POST /api/matters` | **VERIFIED** | `matter.create` | `backend/app/api/matters.py:280` |
| Open matter | `GET /api/matters/{slug}` | NONE (read) | — | — |
| Upload document | `POST /api/matters/{slug}/documents` | **VERIFIED** | `document.upload` | `backend/app/api/matters.py:467` |
| Change privilege posture | `PATCH /api/matters/{slug}/privilege` | **VERIFIED** | `privilege.set` | `backend/app/api/matters.py:569` |
| Archive matter | `DELETE /api/matters/{slug}` | **VERIFIED** | `matter.deleted` + `module.grant.revoked` per cascaded grant | `backend/app/api/matters.py:1074` + Phase 4 cascade in same file |

## Modules + install

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| Browse catalog | `GET /api/modules/v2` | NONE (read) | — | — |
| View module detail | `GET /api/modules/v2/{module_id}` | NONE (read) | — | — |
| Start install ceremony | `POST /api/modules/install` | **VERIFIED** | `module.discovered` via the trust-ceremony state-transition emit chain | `backend/app/core/trust_ceremony.py` (`_emit_state_transition` + `_audit_for_state`) |
| Advance ceremony (trust) | `POST .../advance {action:"trust"}` | **VERIFIED** | one of `module.manifest.inspected` / `module.signature.checked` / `module.publisher.checked` / `module.permissions.reviewed` / `module.grant.created` (mapped by target state at `trust_ceremony.py:451-462`) | `backend/app/core/trust_ceremony.py:451-462` |
| Advance ceremony (grant final) | `POST .../advance {action:"grant"}` | **VERIFIED** | `module.enabled` on transition to ENABLED state — this is the substrate's actual emission, NOT a `module.installed` row | `backend/app/core/trust_ceremony.py:463` |
| Reject ceremony | `POST .../advance {action:"reject"}` | **VERIFIED** | `module.denied` | `backend/app/core/trust_ceremony.py:382` |
| Invalid action posted | `POST .../advance {action:"banana"}` | **VERIFIED** | `module.ceremony.rejected` (via global RequestValidationError handler) | `backend/app/main.py` + Phase 5 carry-over |
| Invalid transition (e.g. grant too early) | `POST .../advance` | **VERIFIED** | `module.ceremony.rejected` + HTTP 409 | `backend/app/api/modules.py` Phase 6 R2 |
| Update module to new version | `POST /api/modules/{id}/update` | **VERIFIED** | `module.updated` (payload.new_version + expansion_detected flag) | `backend/app/api/modules.py:1093` |
| Revoke (disable) module | `POST /api/modules/{id}/revoke` | **VERIFIED** | `module.disabled` + (per cascaded grant) `module.grant.revoked` | `backend/app/api/modules.py:952` + `:962` |

## Grants

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| List matter grants | `GET /api/matters/{slug}/grants` | NONE (read) | — | — |
| Enable module on matter | `POST /api/matters/{slug}/grants` | **VERIFIED** | one `module.grant.created` per declared cap string | Phase 7; `backend/app/core/grants_lifecycle.py` |
| Idempotent re-enable | same body | NONE (verified) | no row by design (Phase 7 Decision #4) | `backend/app/core/grants_lifecycle.py` |
| Disable module on matter | `DELETE /api/matters/{slug}/grants/{id}` per row | **VERIFIED** | one `module.grant.revoked` per row | Phase 7 |
| Workspace-scope attempt | POST with non-matter cap | NONE (verified) | 422 fires before mutation | Phase 7 Decision #5 |

## Invocations

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| Invoke capability (entry) | `POST /api/matters/{slug}/invocations` | **VERIFIED** | `module.capability.invoked` (emitted inside the capability via `audit_phase1`) | `examples/modules/*/capability.py` + `core/phase1_runtime/` |
| Provider call | (server, mid-invocation) | **VERIFIED** | `model.call` (gateway) + `model.invoked` (adapter via `audit_emit_model_invoked`) — Phase 10 documented dual emission | `backend/app/core/model_gateway.py:495` + `backend/app/core/audit_cost.py` |
| Advice-boundary check — success | (substrate) | **VERIFIED** | `advice_boundary.check.completed` in `audit_entries`; reconstruction also surfaces `advice_boundary.decision.completed` from a different source. **See dual-name clarification below.** | `backend/app/core/advice_boundary/gate.py:438` + `backend/app/core/audit_reconstruction.py:378` |
| Advice-boundary check — block | (substrate) | **VERIFIED** | `advice_boundary.check.blocked` (audit) + `advice_boundary.decision.blocked` (reconstruction source) | `gate.py:246, 284, 325` |
| Advice-boundary check — denied | (substrate) | **VERIFIED** | `advice_boundary.check.denied` (audit) + `advice_boundary.decision.denied` (reconstruction source) | `gate.py:362, 399` |
| Advice-boundary check — failed | (substrate) | **VERIFIED** | `advice_boundary.check.failed` (audit) + `advice_boundary.decision.failed` (reconstruction source) | `gate.py:212` |
| Artifact write (success) | `write_artifact` helper | NONE (verified) | helper emits no audit row by design; reconstruction relies on the parent capability's `module.capability.completed.payload` carrying the artifact ids | Phase 9 follow-up; `backend/app/core/matter_artifacts.py` |
| Capability complete | (substrate) | **VERIFIED** | `module.capability.completed` (via `audit_phase1` from inside the capability) | `examples/modules/*/capability.py` |
| Posture block at invoke | (posture_gate) | **VERIFIED** | `posture_gate.check.blocked` (via `audit_failure`) with canonical `gate_state` payload | `backend/app/core/posture_gate.py` |
| Capability denied at invoke | (require_capability) | **VERIFIED** | `module.capability.denied` (substrate) | `backend/app/core/capabilities.py:require_capability` |
| Invalid args (capability ValueError) | (capability) | NONE (verified) | 422 lands before any side-effect audit; bad input doesn't pollute the matter audit log | Phase 10 endpoint translation |
| Scope/kind rejection (pre-dispatch) | (endpoint) | NONE (verified) | no module dispatch → no audit; the rejection is endpoint-side, not module-side | Phase 10 Decision #7 |
| Provider key missing | (model_gateway) | **VERIFIED** | `module.<plugin>.model.key_missing` via `audit_failure` | `backend/app/core/model_gateway.py:411` |
| Provider upstream error | (model_gateway) | **VERIFIED** | `model.call.error` via `audit_failure` | `backend/app/core/model_gateway.py:451` |

### Advice-boundary dual-name clarification (P3, retained from v2)

The substrate exposes TWO names for the same logical event through different reconstruction sources:

- **Audit row** (`audit_entries.action`): `advice_boundary.check.{completed|blocked|denied|failed}`. Emitted by `gate.py:_emit` to `audit_entries` and read by the reconstruction view's `source="audit"` rows.
- **Reconstruction source row** (synthetic, from the WORM `advice_boundary_decisions` table): `advice_boundary.decision.{completed|blocked|denied|failed}`. Synthesised by `audit_reconstruction.py:_abd_to_entry` from the `AdviceBoundaryDecision` table; never written to `audit_entries`.

Both appear in `GET /api/matters/{slug}/audit/reconstruction` under different `source` values. Where this map and the journey docs say `advice_boundary.decision.completed`, they refer to the `source="advice_boundary"` row; where they say `advice_boundary.check.completed`, they refer to the `source="audit"` row.

## Artifacts

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| List artifacts on matter | `GET /api/matters/{slug}/artifacts` | NONE (read) | — Phase 13b Decision #1: artifact reads do NOT emit audit | `backend/app/api/artifacts.py:111` |
| Read artifact | `GET /api/matters/{slug}/artifacts/{id}` | NONE (read) | — same: Phase 13b Decision #1 | `backend/app/api/artifacts.py:136` |

## Reconstruction

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| View reconstruction | `GET /api/matters/{slug}/audit/reconstruction` | **VERIFIED** | `audit.reconstruction.viewed` ("audit the auditor") | `backend/app/api/audit.py:170` |
| Apply filter | re-fetch | NONE (read) | — | — |
| Paginate | re-fetch with cursor | NONE (read) | — | — |
| Expand row | UI-only | NONE (UI) | — | — |

## Admin

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| List users | `GET /api/admin/users` | NONE (read) | — | `backend/app/api/admin_users.py` |
| Open user detail | `GET /api/admin/users/{id}` | NONE (read) | — | `backend/app/api/admin_users.py` |
| Change role | `POST /api/admin/users/{id}/role` | **VERIFIED** | `user.role.changed` with from-to + reason | `backend/app/api/admin_users.py` Phase 11 |
| Idempotent same-role POST | same | NONE (verified) | Phase 11 idempotent no-op | `admin_users.py` |
| Self-promote attempt | same | NONE (verified) | 403 fires before mutation | `admin_users.py` |

## System (bootstrap)

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| Check bootstrap state | `GET /api/system/bootstrap-state` | NONE (read) | — no auth required; no audit by design (Phase 13b Decision #3) | `backend/app/api/system.py` |

## Phase 13b D landed (v3)

Every action that v2 flagged as GAP is now VERIFIED with a `file:line` reference:

- 8 auth events (register, verify, demo_seeded, capabilities_auto_granted, login, logout, forgot_password, reset_password, profile_update) — all emitted via `app.core.auth`
- 3 settings key operations (configure added / configure rotated / revoked) — emitted by `app.api.settings`
- 2 module lifecycle verifications (`module.updated`, `module.disabled`) — confirmed at `modules.py:1093` + `:952`

Login/logout emission uses `AuditingDatabaseStrategy` (subclass of fastapi-users' `DatabaseStrategy`) so the row commits on the same session as the AccessToken write/delete. Middleware-shimming the audit row in a separately-opened session does not survive SAVEPOINT-bound tests; binding to the request session avoids the visibility gap.
