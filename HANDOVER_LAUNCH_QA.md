# Handover: Launch QA findings + fix plan

Pre-Unit-#12 (Phase E W4/W5 launch posture). Browser-equivalent API walk of the Khan seed against backend `08f0f0b` surfaced two latent 500s and one architectural defect on the Modules surface. Reviewer R-launch-qa signed off Option A with a capability-doctrine amendment. This doc is the resulting fix plan.

## Doctrine landed by this review

> Manifest requests capabilities. Workspace grants capabilities. Runtime enforces capabilities.

Three terms, never blurred:

- **Declared capabilities** — what a `module.json` says a skill wants.
- **Granted capabilities** — what the workspace has authorised for `(workspace/user, plugin, skill)`.
- **Enforced capabilities** — what runtime actually checks before privileged operations execute.

Product-copy line, for honest framing in v0.1:

> v0.1 validates and displays declared module capabilities. Production Legalise must persist granted capabilities per workspace and enforce them at runtime before module actions can read, write, call models, or emit audit rows.

## What was walked

API-level walk against the seeded Khan matter, dev stack via `infra/docker-compose.yml`. The `#/demo` route is fully client-side static (`frontend/src/demo/snapshot.ts`) and was not exercisable from curl. Browser-eye QA on every tab is owed regardless; see §"Browser walk" below.

Working:

- Auth: register, dev autoverify, per-user demo seed, login (after Fix 1), `/auth/users/me`
- Matter list + detail, documents (3 seeded), letters catalogue, citations, reviews, assistant history
- Chronology after Fix 2: 7 events on Khan, gate unacknowledged as expected
- Gateway refusal path: clean `422 provider_key_missing` when no Anthropic key
- Assistant POST end-to-end with `default_model_id=stub-echo`; stub cannot produce a valid envelope, so the `parse_failed` controlled-error path fires (working as designed)

Tests: 67/67 green before fixes, 67/67 green after.

## P0 fixes in this unit

### Fix 1. AccessToken FK metadata

**Symptom.** Every `/auth/login` returns HTTP 500. SQLAlchemy raises `NoReferencedTableError: Foreign key associated with column 'access_token.user_id' could not find table 'user'` at flush time.

**Cause.** `SQLAlchemyBaseAccessTokenTableUUID` (fastapi-users mixin) declares `user_id` with `ForeignKey("user.id")`. Our user table is `users`. Migration `0003_auth.py` correctly creates the DB-side FK against `users.id`, but the ORM model never overrides the mixin, so flush resolves against in-memory metadata and fails.

**Change.** `backend/app/models/user.py`: override `user_id` on `AccessToken` via `@declared_attr` to point at `users.id`. No migration needed. DB shape is already correct.

**Coverage to add (mandatory before merge).** `backend/tests/test_auth_login.py`. Minimum:

1. Register a user.
2. Login.
3. Assert 204 + cookie set.
4. Assert `auth/users/me` returns 200 with the user payload.
5. Assert a row exists in `access_token` for the user.

The coverage gap is the real defect. No test in the suite hits `/auth/login`. Without this test the bug returns on any future fastapi-users upgrade.

### Fix 2. Chronology import

**Symptom.** Every `GET /api/matters/{slug}/chronology` returns HTTP 500. `NameError: name 'AuditEntry' is not defined` at `chronology/router.py:180`.

**Cause.** `_gate_state` queries `AuditEntry` to find the last gate-confirmation row. The symbol was never imported.

**Change.** `backend/app/modules/chronology/router.py`: add `AuditEntry` to the `from app.models import ...` line.

**Coverage to add (mandatory before merge).** Smoke test for `GET /api/matters/{slug}/chronology` against the Khan seed. One assertion: 200 + 7 events.

## P0 architectural fix: Modules page cannot be empty

### The defect

`GET /api/modules` returns `skills: []` and `broken: [...]` with 15 entries, every one `module.json manifest missing`. The Modules surface is empty on a fresh install.

`backend/app/api/modules.py::_module_json_for` expects `<plugins_root>/<plugin>/module.json` at the plugin root. The pinned `b1rdmania/claude-for-uk-legal` SHA ships `SKILL.md` per skill and `README.md` per plugin, but no plugin-root manifest. Schema validation then refuses to expose any skill.

The Letters tab still populates because `letters/catalog` reads from a different code path. The `/api/modules` page itself breaks.

### Ratified resolution: Option A, with amendment

Reviewer rejected B (optional manifests weaken the trust model) and C (bundling canonical manifests inside Legalise splits source-of-truth). Approved A:

- Add plugin-root `module.json` files in `claude-for-uk-legal`.
- Re-pin `PLUGINS_REPO_REF` in `backend/app/core/config.py`.
- Keep schema validation mandatory.

**Amendment.** Manifests must not stay thin. Per-skill capability declarations are required:

- Manifests include a `skills[].capabilities` list per skill.
- v0.1 surfaces these in the Modules page as **declared** metadata only. Honest framing per the doctrine line above.
- v0.1 does not gate runtime on this metadata. That is the next unit; see §"Pre-production unit" below.

### Capability vocabulary for v0.1 declarations

Initial set, agreed by the reviewer:

```
matter.read
document.body.read
document.generated.write
model.invoke
chronology.read
chronology.write
citation.write
audit.emit
```

Manifests declare what each skill needs from this set. New names go through review before being added.

### Work for this unit (Option A)

In `claude-for-uk-legal`:

- `uk-employment-legal/module.json`
- `uk-litigation-legal/module.json`
- `uk-research-legal/module.json`

Each manifest declares the skills it ships and the per-skill capability list against the vocabulary above.

In `legalise`:

- Re-pin `PLUGINS_REPO_REF` after the manifests land.
- Verify `/api/modules` returns the skills under `skills:` (not `broken:`) with declared capabilities visible.

## P1 pulled forward: audit bootstrap on per-user seed

Reviewer overruled the original "deferred to a separate unit" stance. Empty audit tab on a freshly-seeded Khan reads as a broken core feature. Pull into this unit.

### Change

`backend/app/core/seed.py::seed_demo_matter_for_user` writes bootstrap audit rows alongside the resource copy. Actor is system/bootstrap, not the user. Payload explains the rows represent seeded demo data.

Rows to write:

- `seed.matter.created` — one row per seeded matter
- `seed.document.ingested` — one row per seeded document
- `seed.chronology.ingested` — one row per seeded event

Actor convention. Use a reserved system actor identifier rather than the user. `actor_id` should be `NULL` and the payload should carry `{"actor": "system.bootstrap", "kind": "seed"}` so the audit row's truth ("not your action") is preserved.

### Coverage

`backend/tests/test_seed_audit.py`. After per-user seed: matter audit query returns N rows where N matches `1 + len(seeded_documents) + len(seeded_events)`. Each row has `payload.kind == "seed"` and `actor_id IS NULL`.

## Pre-production unit (v0.1.1) — DONE

Landed on branch `feat/capability-enforcement`. The doctrine line is now
load-bearing in code:

- `backend/app/models/workspace_skill_capability_grant.py` — model.
- `backend/alembic/versions/0008_capability_grants.py` — migration.
- `backend/app/core/capabilities.py` — `require_capability`, `grant`,
  `revoke`, `list_granted`, plus `auto_grant_declared_for_user` for the
  signup hook.
- `backend/app/main.py` — `CapabilityDenied` handler returns the
  structured 403 payload (`{error, plugin, skill, capability, message}`)
  and the audit row is committed inside `require_capability` before the
  exception propagates, so denied attempts always leave a trail.

Wired boundaries:

1. **Plugin bridge** (`adapters/plugin_bridge.py::invoke`) — requires
   `matter.read` and `model.invoke` for the `(plugin, skill)`.
2. **Tool invocation** (`core/model_gateway.py::invoke_tool`) — accepts
   `plugin` + `skill` kwargs; when present, requires `model.invoke` plus
   the tool-write capability (`generate_docx` → `document.generated.write`).
3. **Document body read** (`api/documents.py::get_document_body`) —
   optional `plugin` + `skill` query params; when supplied, requires
   `document.body.read`. User-initiated UI calls (no params) keep the
   existing owner-only gate, no behavioural change.
4. **Generated document writes** — flow through the tool boundary above.
5. **Model calls** (`core/model_gateway.py::call`) — when `payload`
   carries both `plugin` and `skill`, requires `model.invoke`.
6. **Citation writes** (`modules/case_law/router.py::create_citation`) —
   optional `plugin` + `skill` query params; when supplied, requires
   `citation.write`.

Chronology mutations: no module-attributed write endpoint exists today
(the `POST /chronology/gate` route is the user's own acknowledgement).
When a module-driven chronology write lands, the same pattern applies:
optional `plugin` + `skill` params trigger `chronology.write`.

Auto-grant on signup runs inside `_post_verify` alongside the demo seed,
wrapped in try/except + log so a manifest read failure cannot block
registration.

Modules surface (`/api/modules`) returns `declared_capabilities` and
`granted_capabilities` per skill alongside the existing `capabilities`
field (kept as an alias of declared for backward-compat).

Test coverage: `backend/tests/test_capabilities.py` covers
helper-level (raise on miss, succeed on grant, idempotent grant, no-op
revoke, list_granted), an HTTP wire-through (module-attributed body
read 403s on missing grant), and the signup auto-grant.

Test counts (container): **108 passed** (was 82). The new
`test_capabilities.py` plus pre-existing capability surface tests run on
the same DB-backed infra.

## P2: browser walk (moves to PRE_FLIGHT)

API-only QA is no longer enough. This unit's QA went deeper than the existing PRE_FLIGHT covers, but the visual surfaces still need an eyes-on pass before Day 15.

Promoted out of this temporary handover into `PRE_FLIGHT.md`. Surface checklist:

- Unauth landing
- Signup
- Seeded Khan matter (Overview, Documents, Chronology gate, Pre-Motion, Contract Review, Letters, Anonymisation, Assistant, Audit, Reviews, Research, Citations)
- Modules page
- `#/demo` cold (no localStorage, no cookie)

The PRE_FLIGHT.md change is part of this unit. Single edit. No other content shifts.

## P2: provider-key launch posture

Clean `422 provider_key_missing` is correct backend behaviour. Two acceptable launch postures for the deployed demo, agreed with the reviewer:

- **Configure a real provider key for the demo instance.** Lowest friction. Demo "just works." Cost lands on `b1rdmania`.
- **Make BYO-key onboarding unavoidable and obvious.** First post-signup screen, blocking the matter UI until a key is saved.

Stub-echo is not an acceptable launch impression. Decision before Day 15 deploy, not in this unit.

## File-level summary

```
backend/app/models/user.py                      # Fix 1: override AccessToken.user_id FK
backend/app/modules/chronology/router.py        # Fix 2: import AuditEntry
backend/app/core/seed.py                        # P1: write bootstrap audit rows
backend/app/core/config.py                      # Option A: re-pin PLUGINS_REPO_REF
backend/tests/test_auth_login.py                # NEW: cookie auth E2E
backend/tests/test_chronology_smoke.py          # NEW: chronology GET 200 smoke
backend/tests/test_seed_audit.py                # NEW: bootstrap audit rows
PRE_FLIGHT.md                                   # P2: browser walk checklist
```

In `claude-for-uk-legal` (no agent files per hard guard — Andy authors):

```
uk-employment-legal/module.json
uk-litigation-legal/module.json
uk-research-legal/module.json
```

Not in this unit:

```
backend/app/models/workspace_skill_capability_grant.py   # next unit
backend/app/core/capabilities.py                          # next unit
backend/alembic/versions/000X_capability_grants.py        # next unit
backend/app/api/modules.py                                # next unit: declared-vs-granted diff
```

## Test plan

DB-backed E2E lives in `backend/tests/conftest.py` and skips cleanly when the test Postgres is unreachable. Two operating modes:

- **Host run, fast local iteration.** From `backend/`, `python3.12 -m pytest -x`. The 7 DB-backed tests skip with a one-line message pointing at the conftest docstring. Expect: 75 passed, 7 skipped.
- **Container run, full coverage.** Inside the dev compose backend, against the `legalise_test` database. Expect: 82/82.

Container command (canonical for CI / pre-merge):

```bash
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/ -x
```

The `legalise_test` database is provisioned once via:

```bash
docker compose -f infra/docker-compose.yml exec -T db \
  psql -U legalise -d postgres -c "CREATE DATABASE legalise_test;"
docker compose -f infra/docker-compose.yml exec -T db \
  psql -U legalise -d legalise_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head
```

E2E coverage now in place:

- `test_auth_login.py` — register → login → cookie → `/auth/users/me` + access_token row written + 401 on no-cookie. Plus the FK-metadata regression test as a fast no-DB sanity check.
- `test_chronology_smoke.py` — login → seed → GET chronology returns 200 with 7 events, gate state surfaces 1 tainted, 404 on unknown slug. Plus the module-import regression test as a fast no-DB sanity check.
- `test_seed_audit.py` — bootstrap audit rows are system-actor with `payload.kind == "seed"`, action namespace is `seed.*`, resource IDs round-trip.

Manual checks before deploy:

- Manual: assistant POST with stub-echo default returns the controlled `parse_failed` envelope (200, empty actions). Provider-key path still 422 with structured error.
- Browser walk per the PRE_FLIGHT checklist. Walk `#/demo` cold. Required before Day 15 regardless.

## Risks

1. **Fix 1 regresses on fastapi-users upgrade.** The mixin override is the kind of thing a `pip` upgrade can silently invalidate. The new E2E test is the guard.
2. **Option A requires push access on `claude-for-uk-legal` and a SHA re-pin.** Both controlled by `b1rdmania`. No agent files in `claude-for-uk-legal` per the hard guard.
3. **Audit-bootstrap rows must not appear as user actions.** The `actor_id IS NULL` + `payload.kind == "seed"` convention is what keeps the audit log honest. Worth a reviewer eye on the SQL pattern when the change lands.
4. **The capability vocabulary is now load-bearing for the runtime unit that follows.** Adding to it after the manifests ship in `claude-for-uk-legal` means coordinated changes across two repos. Lock the v0.1 set before pushing the manifests.

## What this unit ships

- 2 P0 bug fixes (login, chronology)
- 1 P0 architectural fix: 3 upstream manifests drafted + capability vocabulary locked + ready for SHA re-pin
- 1 P1 fix: audit bootstrap rows on per-user seed
- 1 P2 fix: real DB E2E test infrastructure (conftest, transaction-rollback, ASGI client)
- 8 new tests covering routes that had no E2E coverage (auth, chronology, seed audit)
- 1 PRE_FLIGHT.md edit: browser walk checklist
- 3 staged manifests at `claude-for-uk-legal-manifests/` ready for Andy to copy

What it does not ship: runtime capability enforcement (carved into the next unit), provider-key launch decision (Andy call before Day 15), Unit #12 launch copy + outreach drafts (follow).

## Open items needing Andy action

- **`claude-for-uk-legal` authorship.** Per hard guard, Andy copies the three drafted `module.json` files from `claude-for-uk-legal-manifests/` into the `claude-for-uk-legal` repo and pushes. Instructions in `claude-for-uk-legal-manifests/README.md`. The vocabulary is locked at the schema's enum.
- **`PLUGINS_REPO_REF` re-pin.** After the manifests land, update the SHA in `backend/app/core/config.py` and verify `/api/modules` returns `skills: 15` and `broken: 0`.
- **Provider-key launch posture.** Real demo key vs unavoidable BYO-key onboarding. Needed before Day 15 deploy.
