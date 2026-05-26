# Audit Emission Map

The UI contract for audit emissions. Every user action gets a row here: the audit action it triggers, or an explicit `none` with justification.

Phase 13 Decision #4: **a button that emits no audit row is a deliberate choice the spec records; a button that should emit one but doesn't is a finding.** This map is the source of truth.

## Conventions

- **Substrate-emitted** rows are written by `app.core.api.audit.log` or `audit_failure` inside the API/runtime layer. The UI doesn't emit them; it triggers them via the API call.
- **None (read)** — read endpoints don't emit. Defensible because the read itself isn't a privileged action.
- **None (open question)** — Phase 13 flags this for Reviewer; Phase 15+ either ships an audit row or explicitly defers.
- **Gap** — the action would need an audit row that the substrate currently doesn't emit. A `BACKEND_GAP_AUDIT.md` finding.

## Auth + first-run

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| Click "Register first account" | `/auth/register` | `POST /auth/register` | `auth.user.registered` | substrate |
| Auto-seed Khan v Acme on first register | (server) | (registration hook) | `auth.user.demo_seeded` | substrate |
| Auto-grant legacy capabilities | (server) | (registration hook) | `auth.user.capabilities_auto_granted` | substrate |
| Verify email | `/auth/verify` | `POST /auth/verify` | verify shape | open question — fastapi-users substrate; check before Phase 15 |
| Log in | `/auth/login` | `POST /auth/login` | verify shape | open question — fastapi-users substrate |
| Log out | (any) | `POST /auth/logout` | verify shape | open question |
| Forgot password | `/auth/forgot-password` | `POST /auth/forgot-password` | verify shape | open question |
| Reset password | `/auth/reset-password` | `POST /auth/reset-password` | verify shape | open question |
| Bootstrap admin (CLI) | (CLI) | (direct DB) | `user.admin.bootstrapped` | Phase 12, actor_id=NULL |

The five "verify shape" rows are an explicit open question. Phase 13 doesn't lock the answer; the Phase 15 auth-surface implementation either confirms the substrate's emission or names it as a gap.

## Settings / BYO keys

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| View profile | `/settings` | `GET /auth/users/me` | none (read) | |
| Update profile | `/settings` | `PATCH /auth/users/me` | verify shape | open question — fastapi-users substrate |
| List configured keys | `/settings/keys` | `GET /api/settings/keys` | none (read) | |
| Add provider key | `/settings/keys` | `POST /api/settings/keys` | verify shape | open question — Phase 14 confirms |
| Rotate provider key | `/settings/keys` | `POST /api/settings/keys` | verify shape | open question |
| Remove provider key | `/settings/keys` | `DELETE /api/settings/keys/{provider}` | verify shape | open question |

`UserApiKey` operations should audit; whether they do today is unverified. Phase 14 verifies before shipping the surface.

## Matters

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| List matters | `/matters` | `GET /api/matters` | none (read) | |
| Create matter | `/matters/new` | `POST /api/matters` | verify shape | open question |
| Open matter | `/matters/{slug}` | `GET /api/matters/{slug}` | none (read) | |
| Upload document | `/matters/{slug}` | `POST /api/matters/{slug}/documents` | verify shape | open question |
| Change privilege posture | `/matters/{slug}` | `PATCH /api/matters/{slug}/privilege` | verify shape | open question — this is a high-stakes audit action; MUST emit |
| Archive matter | `/matters/{slug}` | `DELETE /api/matters/{slug}` | `module.grant.revoked` per cascaded grant + matter status change | Phase 4 cascade |

The privilege-posture mutation is one to confirm explicitly. If it doesn't audit, Phase 14 won't ship the surface until the substrate emits.

## Modules + install

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| Browse catalog | `/modules` | `GET /api/modules/v2` | none (read) | |
| View module detail | `/modules/{id}` | `GET /api/modules/v2/{module_id}` | none (read) | |
| Start install ceremony | `/modules/install` | `POST /api/modules/install` | `module.discovered` | Phase 3 |
| Advance ceremony (trust) | `/modules/install` | `POST .../advance {action:"trust"}` | one of `module.manifest.inspected`/`module.signature.checked`/`module.publisher.checked`/`module.permissions.reviewed`/`module.grant.created` depending on target state | Phase 3 |
| Advance ceremony (grant) | `/modules/install` | `POST .../advance {action:"grant"}` | `module.enabled` (transition to ENABLED state) | Phase 3 |
| Reject ceremony | `/modules/install` | `POST .../advance {action:"reject"}` | `module.denied` | Phase 3 |
| Invalid action posted | `/modules/install` | `POST .../advance {action:"banana"}` | `module.ceremony.rejected` | Phase 5 carry-over |
| Invalid transition (e.g. grant too early) | `/modules/install` | `POST .../advance` | `module.ceremony.rejected` + 409 | Phase 6 R2 |
| Install persists | (server) | (after grant) | `module.installed` | Phase 3 |
| Update module to new version | `/modules/{id}` | `POST /api/modules/{id}/update` | `module.updated` | Phase 4 |
| Revoke (disable) module | `/modules/{id}` | `POST /api/modules/{id}/revoke` | one `module.grant.revoked` per cascaded grant + `module.disabled` | Phase 4 |

## Grants

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| List matter grants | `/matters/{slug}` (panel) | `GET /api/matters/{slug}/grants` | none (read) | |
| Enable module on matter | `/matters/{slug}` | `POST /api/matters/{slug}/grants` | one `module.grant.created` per declared cap string | Phase 7 |
| Idempotent re-enable | same | same body | none (Phase 7 Decision #4) | |
| Disable module on matter | `/matters/{slug}` | `DELETE /api/matters/{slug}/grants/{id}` per row | one `module.grant.revoked` per row | Phase 7 |
| Workspace-scope attempt | same | POST with non-matter cap | none (422 fires before mutation) | Phase 7 Decision #5 |

## Invocations

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| Invoke capability (entry) | `/matters/{slug}` | `POST /api/matters/{slug}/invocations` | `module.capability.invoked` | substrate inside capability |
| Provider call | (server, mid-invocation) | (gateway) | `model.call` (gateway) + `model.invoked` (module via `audit_emit_model_invoked`) | Phase 10 documented dual emission |
| Advice-boundary check (success) | (server, mid-invocation) | (substrate) | `advice_boundary.check.completed` | substrate |
| Advice-boundary check (block) | (server, mid-invocation) | (substrate) | `advice_boundary.check.blocked` | substrate |
| Artifact write (success) | (server, mid-invocation) | `write_artifact` helper | none | Phase 9 follow-up — write_artifact emits no audit; this is an open question for a future "artifact.created" action |
| Capability complete | (server, end of invocation) | (substrate) | `module.capability.completed` | substrate |
| Posture block at invoke | (server) | (posture_gate) | `posture_gate.check.blocked` | Phase 8 |
| Capability denied at invoke | (server) | (require_capability) | `module.capability.denied` | substrate |
| Invalid args (capability ValueError) | (server) | (capability) | none (the 422 lands before any side-effect audit) | this is correct — the user's bad input shouldn't pollute the matter audit log |
| Scope/kind rejection (pre-dispatch) | (server) | (endpoint) | none (no module dispatch — no audit) | Phase 10 Decision #7 |
| Provider key missing | (server) | (model_gateway) | `module.<plugin>.model.key_missing` | substrate |
| Provider upstream error | (server) | (model_gateway) | `model.call.error` | substrate |

## Artifacts

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| List artifacts on matter | `/matters/{slug}/artifacts` | `GET /api/matters/{slug}/artifacts` ★ | none (read) | gap — endpoint doesn't exist |
| Read artifact | `/matters/{slug}/artifacts/{id}` | `GET /api/matters/{slug}/artifacts/{id}` ★ | open question — should reading a privileged artifact audit? | flagged for Reviewer |

## Reconstruction

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| View reconstruction | `/matters/{slug}/audit` | `GET /api/matters/{slug}/audit/reconstruction` | `audit.reconstruction.viewed` | Phase 5; "audit the auditor" |
| Apply filter | same | re-fetch | none | |
| Paginate | same | re-fetch with cursor | none | |
| Expand row | same | UI-only | none | |

## Admin

| User action | Page | API call | Audit row | Notes |
| --- | --- | --- | --- | --- |
| List users | `/admin/users` | `GET /api/admin/users` ★ | none (read) | gap |
| Open user detail | `/admin/users/{id}` | `GET /api/admin/users/{id}` ★ | none (read) | gap |
| Change role | `/admin/users/{id}` | `POST /api/admin/users/{id}/role` | `user.role.changed` | Phase 11 |
| Idempotent same-role POST | same | same | none | Phase 11 |
| Self-promote attempt | same | same | none (403 fires before mutation) | Phase 11 |

## Summary of findings

Three categories of follow-up:

1. **Verify shape (open questions):** auth-flow audits, settings/key audits, matter mutation audits — Phase 14/15 confirms the substrate emits.
2. **Open product questions:** does reading a privileged artifact audit? Should `write_artifact` emit a dedicated `artifact.created` row?
3. **Gaps (Phase 13b backlog):** artifact endpoints + admin user listing endpoints.

The verify-shape rows are the most numerous. Phase 14 takes one pass through them before any surface lands; gaps that turn out missing are added to the Phase 13b backlog.
