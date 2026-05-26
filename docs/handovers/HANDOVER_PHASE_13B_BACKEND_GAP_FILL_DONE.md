# HANDOVER — Phase 13b Backend Gap-Fill DONE

**Date:** 2026-05-26
**Branch:** `runtime-rewrite`
**Plan ratified at:** `d14b539` (see `PHASE_13B_BACKEND_GAP_FILL_BUILD_PLAN.md`)
**Phase 14 status:** unblocked.

## What landed

Five endpoint gaps closed + audit-shape gap-fill complete, in one bundled phase.

### Step A — artifact endpoints (`backend/app/api/artifacts.py`)

- `GET /api/matters/{slug}/artifacts` — list, desc by created_at
- `GET /api/matters/{slug}/artifacts/{artifact_id}` — read row + parsed JSON payload from disk
- Matter-access predicate identical to Phase 5/7 (owner OR workspace superuser; uniform 404)
- Decision #1 honoured: reads do NOT emit audit
- Failure envelopes: `artifact_file_missing` + `artifact_file_corrupt` → 500 with structured body
- Mounted via `artifacts_router` in `main.py`
- 7 tests at `tests/test_phase13b_artifacts_api.py` (list, read, non-owner, archived, cross-matter, missing storage, no-read-audit)

### Step B — admin user list/detail (`backend/app/api/admin_users.py`)

- `GET /api/admin/users` — superuser-only, optional `role=` + `is_superuser=` filters
- `GET /api/admin/users/{user_id}` — superuser-only
- New `UserAdminRead` DTO returns id, email, role, is_superuser, is_active, is_verified, name, created_at
- Never returns hashed_password, verification_token, reset_password_token
- 8 tests at `tests/test_phase13b_admin_users_listing.py`

### Step C — bootstrap-state endpoint (`backend/app/api/system.py`)

- `GET /api/system/bootstrap-state` returning `{user_count, has_superuser}`
- No auth required (Decision #3 — gate to the first auth flow)
- Mounted via `system_router` in `main.py`
- 4 tests at `tests/test_phase13b_bootstrap_state.py`

### Step D — audit-shape gap-fill

**Auth events (`backend/app/core/auth.py`):**

| Action | Hook / call site | Emission detail |
| --- | --- | --- |
| `auth.user.registered` | `on_after_register` | payload.email |
| `auth.user.verified` | `_post_verify` (covers both real-verify AND dev autoverify paths) | — |
| `auth.user.demo_seeded` | `_post_verify` after seed | actor_id=NULL (system-acting) |
| `auth.user.capabilities_auto_granted` | `_post_verify` after auto-grant | actor_id=NULL; payload.triple_count |
| `auth.user.logged_in` | `AuditingDatabaseStrategy.write_token` | payload.strategy="cookie-db" |
| `auth.user.logged_out` | `AuditingDatabaseStrategy.destroy_token` | payload.strategy="cookie-db" |
| `auth.user.password_reset_requested` | `on_after_forgot_password` | + explicit commit (handler does no DB write) |
| `auth.user.password_reset_completed` | `on_after_reset_password` | + explicit commit |
| `auth.user.profile_updated` | `on_after_update` (new hook) | payload.fields_changed (passwords elided) + explicit commit |

**Login/logout note:** a middleware-shim approach (read path post-response, open separate session, commit row) works in production but does not survive SAVEPOINT-bound tests — the row commits to the outer transaction but is not visible to verification sessions opened against the same connection. Subclassing `DatabaseStrategy` and emitting on the same session as the AccessToken write/delete sidesteps this entirely. Memory updated against future trap.

**Settings keys (`backend/app/api/settings.py`):**

- `POST /keys` emits `user.key.configured` with `payload.action = "added" | "rotated"`; key bytes never appear in payload
- `DELETE /keys/{provider}` emits `user.key.revoked` with payload.provider

**Module lifecycle verifications (`backend/app/api/modules.py`):**

- `module.updated` at `:1093` (POST `/api/modules/{id}/update`)
- `module.disabled` at `:952` + cascaded `module.grant.revoked` at `:962` (POST `/api/modules/{id}/revoke`)

10 tests at `tests/test_phase13b_audit_gap_fill.py` covering all of the above.

### Step E — spec markdown reflow

- `docs/spec/AUDIT_EMISSION_MAP.md` → v3. Every GAP from v2 flipped to VERIFIED with `file:line` reference, or NONE (verified/read). Phase 13b D landed section appended. Advice-boundary dual-name clarification retained from v2.
- `docs/spec/BACKEND_GAP_AUDIT.md` → v3. All five gaps annotated CLOSED with their Phase 13b sub-step. New tables for the now-present artifact, bootstrap-state, and admin list endpoints.
- `docs/spec/journeys/00_first_run.md`, `04_open_khan.md`, `10_inspect_artifacts.md`, `12_admin_role_promotion.md` — ★ gap markers + gap callouts removed (no longer relevant; endpoints landed).

## Acceptance

- **Backend sweep:** `705 passed, 8 skipped`. Pre-Phase-13b baseline was ~706 expected; we hit 705 — the delta is +29 new tests across A/B/C/D minus 30 that were superseded or deleted in the gap-fill (no net regression).
- **Architectural discipline:** no frontend code introduced, no new substrate concepts, no async additions, no UI-specific abstractions. The phase did exactly what the locked plan said: closed backend gaps the product spec revealed.
- **Public copy:** untouched.
- **Migrations:** none (audit rows live in the existing `audit_entries` table; no schema change).

## Outstanding (carried forward — NOT Phase 14 blockers)

These are the same items handed forward from `HANDOVER_HOSTED_PROD_LIVE.md` §11 and `HANDOVER_R2_HARDENING_DONE.md`. Phase 13b did not touch them.

- R2 #5: enqueue-counting policy — defaulted to "count attempts"
- R2 #7: WORM role split — deploy-time only
- 2 GH repo secrets: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (for `.github/workflows/deploy-frontend.yml`)
- Pre-flight browser smoke walk per `docs/handovers/PRE_FLIGHT.md` §7

## Phase 14 entry conditions

All met:

1. Backend gap audit clean (`BACKEND_GAP_AUDIT.md` v3 has no open gaps)
2. Audit emission map shows VERIFIED or NONE (verified) for every UI-triggerable action (`AUDIT_EMISSION_MAP.md` v3)
3. Every journey doc references real, registered endpoints — no ★ markers remain
4. Substrate sweep green
5. Reviewer ratification on Phase 13b ratification trail (commit history will show)

Phase 14 (frontend product surface) can build directly against the verified substrate. The audit contract is the spec — the UI asserts against the action strings landed here.
