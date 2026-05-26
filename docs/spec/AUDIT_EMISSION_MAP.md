# Audit Emission Map (v2)

The UI contract for audit emissions. Every user action gets a row here: the audit action it triggers, or an explicit `none` with justification, or a `gap` requiring substrate work in Phase 13b.

Phase 13 Decision #4: **a button that emits no audit row is a deliberate choice the spec records; a button that should emit one but doesn't is a finding.** This map is the source of truth.

**v2 patch (post-Reviewer):** v1 listed several phantom audit actions that turned out to be structured log lines or never emitted at all. Every non-`none` row now carries a verified `file:line` reference OR an explicit `gap` flag with proposed Phase 13b fill.

## Status legend

- **VERIFIED** — substrate emits this exact action string; reference `file:line` checked
- **GAP** — substrate does NOT emit this; the action would need a Phase 13b substrate addition for the UI to honour the audit claim
- **NONE (read)** — read endpoint; no audit by design
- **NONE (verified)** — substrate explicitly does not emit; deliberate choice
- **TBD** — surface where Phase 13 punts to a Reviewer decision

## Conventions

- "Audit row" here always means a row in `audit_entries`. Structured log lines (e.g. `logger.info("auth.user.registered", ...)`) are NOT audit rows; v2 separates them.
- Substrate-emitted rows are written by `app.core.api.audit.log`, `audit_failure`, or `audit_phase1`. The UI doesn't emit them; it triggers them via the API call.

## Auth + first-run

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| Click "Register first account" | `POST /auth/register` | **GAP** | none today; substrate's `core/auth.py:66` emits a structured log only | `backend/app/core/auth.py:66` (log, not audit) |
| Auto-seed Khan v Acme on first register | (registration hook) | **GAP** | none today; structured log only | `backend/app/core/auth.py:115` (log) |
| Auto-grant legacy capabilities | (registration hook) | **GAP** | none today; structured log only | `backend/app/core/auth.py:134` (log) |
| Verify email | `POST /auth/verify` | **GAP** | none today; fastapi-users emits no audit row | (substrate) |
| Log in | `POST /auth/login` | **GAP** | none today; fastapi-users emits no audit row | (substrate) |
| Log out | `POST /auth/logout` | **GAP** | none today; fastapi-users emits no audit row | (substrate) |
| Forgot password | `POST /auth/forgot-password` | **GAP** | none today | (substrate) |
| Reset password | `POST /auth/reset-password` | **GAP** | none today | (substrate) |
| Bootstrap admin (CLI) | (CLI) | **VERIFIED** | `user.admin.bootstrapped` (actor_id=NULL) | `backend/app/tools/bootstrap_admin.py` |

**Substrate finding:** auth events are not audited today. Phase 13b D (audit-shape verification + gap-fill) should add canonical audit rows for register / login / logout / verify / password-reset. Without them the reconstruction view has a hole on the auth surface.

## Settings / BYO keys

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| View profile | `GET /auth/users/me` | NONE (read) | — | — |
| Update profile | `PATCH /auth/users/me` | **GAP** | none today; fastapi-users update | (substrate) |
| List configured keys | `GET /api/settings/keys` | NONE (read) | — | — |
| Add provider key | `POST /api/settings/keys` | **GAP** | none today; `settings.py` has no `audit.log` call | `backend/app/api/settings.py:63` |
| Rotate provider key | `POST /api/settings/keys` (upsert) | **GAP** | none today | `backend/app/api/settings.py:63` |
| Remove provider key | `DELETE /api/settings/keys/{provider}` | **GAP** | none today | `backend/app/api/settings.py:77` |

**Substrate finding:** BYO key operations are security-sensitive and currently unaudited. Phase 13b D must add `user.key.configured` / `user.key.revoked` rows before Phase 14 ships the settings surface. Reviewer flagged this as a P2 blocker for Phase 14 start.

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
| Advance ceremony (grant final) | `POST .../advance {action:"grant"}` | **VERIFIED** | `module.enabled` on transition to ENABLED state — note this is the substrate's actual emission, NOT a separate `module.installed` row | `backend/app/core/trust_ceremony.py:463` |
| Reject ceremony | `POST .../advance {action:"reject"}` | **VERIFIED** | `module.denied` | `backend/app/core/trust_ceremony.py:382` |
| Invalid action posted | `POST .../advance {action:"banana"}` | **VERIFIED** | `module.ceremony.rejected` (via global RequestValidationError handler) | `backend/app/main.py` + Phase 5 carry-over |
| Invalid transition (e.g. grant too early) | `POST .../advance` | **VERIFIED** | `module.ceremony.rejected` + HTTP 409 | `backend/app/api/modules.py` Phase 6 R2 |
| Update module to new version | `POST /api/modules/{id}/update` | **TBD** | Phase 4 endpoint exists; canonical emission needs file:line verification | Phase 13b D |
| Revoke (disable) module | `POST /api/modules/{id}/revoke` | **TBD** | Phase 4 endpoint exists; emission needs verification | Phase 13b D |

**v2 patch:** v1 listed `module.installed` as a row that lands after install. That action does NOT exist in the substrate; the ceremony emits `module.enabled` when the state machine reaches ENABLED. The UI must assert against `module.enabled`, NOT a phantom `module.installed`.

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

### Advice-boundary dual-name clarification (P3 fix)

The substrate exposes TWO names for the same logical event through different reconstruction sources:

- **Audit row** (`audit_entries.action`): `advice_boundary.check.{completed|blocked|denied|failed}`. Emitted by `gate.py:_emit` to `audit_entries` and read by the reconstruction view's `source="audit"` rows.
- **Reconstruction source row** (synthetic, from the WORM `advice_boundary_decisions` table): `advice_boundary.decision.{completed|blocked|denied|failed}`. Synthesised by `audit_reconstruction.py:_abd_to_entry` from the `AdviceBoundaryDecision` table; never written to `audit_entries`.

Both appear in `GET /api/matters/{slug}/audit/reconstruction` under different `source` values:

- `source="audit"` rows have `action = advice_boundary.check.X`
- `source="advice_boundary"` rows have `action = advice_boundary.decision.X`

**Frontend implication:** if a journey filters by action, the spec must say which source it expects. Where this map and the journey docs say `advice_boundary.decision.completed`, they refer to the `source="advice_boundary"` row. Where they say `advice_boundary.check.completed`, they refer to the `source="audit"` row.

UI tests asserting on action names must match the source they're checking. Phase 14 picks a default rendering convention; both are surfaced today by the reconstruction endpoint and both should appear in the timeline.

## Artifacts

| User action | API call | Status | Audit row | Reference |
| --- | --- | --- | --- | --- |
| List artifacts on matter | `GET /api/matters/{slug}/artifacts` ★ | **GAP (endpoint + decision)** | endpoint missing; if added, no audit by default (read) | Phase 13b A |
| Read artifact | `GET /api/matters/{slug}/artifacts/{id}` ★ | **GAP (endpoint + open question)** | endpoint missing; **open question:** does reading a privileged artifact audit? | Phase 13b A + Reviewer call |

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
| List users | `GET /api/admin/users` ★ | **GAP (endpoint)** | endpoint missing; if added, no audit by default (read) | Phase 13b B |
| Open user detail | `GET /api/admin/users/{id}` ★ | **GAP (endpoint)** | endpoint missing; if added, no audit by default (read) | Phase 13b B |
| Change role | `POST /api/admin/users/{id}/role` | **VERIFIED** | `user.role.changed` with from-to + reason | `backend/app/api/admin_users.py` Phase 11 |
| Idempotent same-role POST | same | NONE (verified) | Phase 11 idempotent no-op | `admin_users.py` |
| Self-promote attempt | same | NONE (verified) | 403 fires before mutation | `admin_users.py` |

## Summary of substrate findings (v2)

### Substrate gaps confirmed — must fix in Phase 13b D

- **All auth events** — register, login, logout, verify, password reset emit structured logs only, no audit rows.
- **All settings key operations** — add, rotate, remove all unaudited. Reviewer's P2 blocker.
- **`auth.user.demo_seeded` + `auth.user.capabilities_auto_granted`** — structured logs, not audit rows.
- **fastapi-users profile update** — `PATCH /auth/users/me` unaudited.

### Substrate-emission verification needed (Phase 13b D)

- `POST /api/modules/{id}/update` — Phase 4 endpoint, canonical emission TBD
- `POST /api/modules/{id}/revoke` — Phase 4 endpoint, canonical emission TBD

### Phantom action names removed from v2

- `auth.user.registered` (was: VERIFIED → now: GAP)
- `auth.user.demo_seeded` (was: VERIFIED → now: GAP)
- `auth.user.capabilities_auto_granted` (was: VERIFIED → now: GAP)
- `module.installed` (was: VERIFIED → now: REMOVED; the real row is `module.enabled` per `trust_ceremony.py:463`)

## Phase 13b D scope (audit-shape verification + gap-fill)

Inside the bundled Phase 13b Option B, before Phase 14:

1. Add canonical audit rows for the 8 auth events (register / login / logout / verify / forgot / reset + profile update + demo seed + capabilities-auto-granted)
2. Add audit rows for the 3 settings key operations
3. Verify Phase 4 module update + revoke emissions; gap-fill if missing
4. Confirm artifact endpoints (Phase 13b A) don't audit reads by default; decide on artifact-read auditing per Reviewer
5. Confirm admin user-list endpoints (Phase 13b B) don't audit reads by default

Estimated ~2 days inside Phase 13b Option B (~5 days total).
