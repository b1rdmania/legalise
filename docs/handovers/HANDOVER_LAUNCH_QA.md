# Handover: Launch QA - final state

Pre-Unit-#12 (Phase E W4/W5 launch posture). Reviewer R-launch-qa signed off Option A with a capability-doctrine amendment. This doc is the final state after that work landed. All ratified items shipped except the three Andy-action items at the bottom.

## Doctrine landed in code

> Manifest requests capabilities. Workspace grants capabilities. Runtime enforces capabilities.

Three terms, never blurred:

- **Declared capabilities** - what a `module.json` says a skill wants.
- **Granted capabilities** - what the workspace has authorised for `(workspace/user, plugin, skill)`.
- **Enforced capabilities** - what runtime checks before privileged operations execute.

v0.1 ships all three. Auto-grant on signup keeps the UX honest (declared = granted by default; the workspace user can revoke).

## Test counts

- **Container (canonical, real DB E2E): 108 passed** (was 67 at session start)
- **Host (DB tests skip cleanly): 75 passed, 33 skipped**

Container command:

```bash
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/ -p no:randomly
```

First-time test-DB setup (idempotent after the first run):

```bash
docker compose -f infra/docker-compose.yml exec -T db \
  psql -U legalise -d postgres -c "CREATE DATABASE legalise_test;"
docker compose -f infra/docker-compose.yml exec -T db \
  psql -U legalise -d legalise_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head
```

## What walked the Khan seed against `08f0f0b`

Two latent 500s + one architectural defect + several gaps. All fixed.

Working before fix:
- Auth register, dev autoverify, per-user demo seed
- Matter list + detail, documents, letters catalogue, citations, reviews, assistant history
- Gateway refusal path: clean `422 provider_key_missing` when no Anthropic key

Broken before fix:
- `/auth/login` → 500 (FK metadata)
- `/api/matters/{slug}/chronology` → 500 on tainted-event path (missing import)
- `/api/modules` → empty `skills: []` with 15 broken entries (missing manifests)
- Audit tab on fresh signup → empty (no bootstrap rows written)

## Fix 1 - AccessToken FK metadata

**Symptom.** Every `/auth/login` returns HTTP 500. SQLAlchemy raises `NoReferencedTableError: Foreign key associated with column 'access_token.user_id' could not find table 'user'` at flush.

**Cause.** `SQLAlchemyBaseAccessTokenTableUUID` declares `user_id` with `ForeignKey("user.id")`. Our user table is `users`. Migration `0003_auth.py` had the DB-side FK correct against `users.id`; the ORM model never overrode the mixin.

**Change.** `backend/app/models/user.py`: `@declared_attr user_id` overrides the mixin to point at `users.id`. No migration needed.

**Coverage.** `backend/tests/test_auth_login.py` (6 tests): FK target + ondelete cascade (no-DB regression catchers) plus register → login → cookie → `/auth/users/me` → `access_token` row exists, 401 on no-cookie. The gap that hid this bug - no route test - is now closed.

## Fix 2 - Chronology import

**Symptom.** Every `GET /api/matters/{slug}/chronology` returns HTTP 500. `NameError: name 'AuditEntry' is not defined` at `chronology/router.py:180`. Fired the moment a tainted event was present, which is always for the Khan seed (the dismissal letter is from disclosure).

**Cause.** `_gate_state` queries `AuditEntry` to find the last gate-confirmation row. The symbol was never imported.

**Change.** `backend/app/modules/chronology/router.py`: added `AuditEntry` to the `from app.models import ...` line.

**Coverage.** `backend/tests/test_chronology_smoke.py` (5 tests): module-binding regression + `_gate_state` zero-tainted smoke (no-DB) plus the full route returning 200 + 7 events + gate state showing 1 tainted + 404 on unknown slug.

## Fix 3 - Modules page empty (architectural)

**Symptom.** `/api/modules` returns `skills: []` with 15 entries in `broken[]`, every one `module.json manifest missing`.

**Cause.** `_module_json_for` expects `<plugins_root>/<plugin>/module.json`. The pinned `b1rdmania/claude-for-uk-legal` SHA ships `SKILL.md` per skill but no plugin-root manifest. Schema validation refuses to expose any skill.

**Resolution (reviewer ratified Option A).** Three plugin-root manifests drafted at `claude-for-uk-legal-manifests/` for Andy to copy across, with per-skill capability granularity per the reviewer's amendment.

**Schema change.** `schemas/module.json` extended with an optional `skills` object (`{ "<skill>": { "capabilities": [...], "trust_posture": "..." } }`). Per-skill caps and trust posture take precedence over plugin-level when present; absent skills inherit plugin-level. Validation remains mandatory.

**Bridge change.** `backend/app/api/modules.py`: response surfaces `declared_capabilities`, `granted_capabilities`, and `capabilities` (alias of declared, kept for back-compat). Per-skill overrides resolved at the bridge layer.

**Manifests.** Three plugins, 15 skills:

| Plugin | Skill count | Notable per-skill divergence |
|---|---|---|
| `uk-employment-legal` | 6 | `unfair-dismissal-screener` drops `document.generated.write` (returns a verdict, not a doc) |
| `uk-litigation-legal` | 5 | `pre-motion` reads chronology but no `chronology.write`; only `chronology` itself writes |
| `uk-research-legal` | 4 | uniform: all four are research lookups, each writes a citation row, none generates a document |

All three validate clean against the new schema. All descriptions use plain English, no em dashes.

**Coverage.** `backend/tests/test_modules_per_skill_capabilities.py` (2 tests): override-takes-precedence + plugin-level fallback when `skills` map is absent. Test uses a temp `plugins_root` so it's stable regardless of the upstream SHA.

## Fix 4 - Audit bootstrap on per-user seed

**Symptom.** Fresh signup → Khan seed → Audit tab empty on first paint. Audit is a top-line product claim, empty tab reads as broken.

**Change.** `backend/app/core/seed.py::seed_demo_matter_for_user` now writes bootstrap audit rows in both branches:

- New-matter branch: three action types per seeded resource (`seed.matter.created`, `seed.document.ingested`, `seed.chronology.ingested`).
- Existing-matter branch: presence-checked backfill. If no `seed.matter.created` row exists for the matter, write the full set. Idempotent.

Doctrine, locked in module-level constants:
- `actor_id = None` (system actor)
- `module = "seed"`
- `payload = {"actor": "system.bootstrap", "kind": "seed", ...}`

So the audit log stays truthful about user actions vs system bootstrap.

**Coverage.** `backend/tests/test_seed_audit.py` (4 tests): doctrine compliance, presence-check, idempotency on second call, upgrade path (matter exists without bootstrap rows).

## Fix 5 - Runtime capability enforcement (reviewer P1, pulled forward)

**Persistence.** `backend/app/models/workspace_skill_capability_grant.py` + migration `0008_capability_grants.py`. Table `workspace_skill_capability_grants` with composite unique on `(user_id, plugin, skill, capability)`.

**Helper.** `backend/app/core/capabilities.py`:
- `require_capability(session, *, user_id, plugin, skill, capability)` - raises `CapabilityDenied` when the grant is missing
- `grant`, `revoke`, `list_granted` - idempotent
- `auto_grant_declared_for_user(session, *, user_id)` - reads each installed plugin's declared per-skill caps and grants the full set for the user. Called from signup.

**Exception → HTTP.** `backend/app/main.py` adds an exception handler that converts `CapabilityDenied` into a structured 403:

```json
{
  "error": "capability_denied",
  "plugin": "...",
  "skill": "...",
  "capability": "...",
  "message": "Module 'plugin/skill' was not granted 'capability'. Grant from the Modules page."
}
```

`require_capability` commits a `module.capability.denied` audit row before raising, so denied attempts always leave a trail.

**Wired boundaries (5 of 6).**

1. **Plugin bridge** (`adapters/plugin_bridge.py::invoke`) - requires `matter.read` and `model.invoke`.
2. **Tool invocation** (`core/model_gateway.py::invoke_tool`) - when `plugin`/`skill` supplied, requires `model.invoke` plus the per-tool capability (`generate_docx` → `document.generated.write`).
3. **Document body read** (`api/documents.py::get_document_body`) - optional `plugin`/`skill` query params; when supplied, requires `document.body.read`. User-initiated UI calls (no params) keep the existing owner-only gate.
4. **Generated document writes** - flow through the tool boundary above.
5. **Model calls** (`core/model_gateway.py::call`) - when the gateway payload carries both `plugin` and `skill`, requires `model.invoke`.
6. **Citation writes** (`modules/case_law/router.py::create_citation`) - optional `plugin`/`skill` query params; when supplied, requires `citation.write`.

**Not wired (deliberate).** Chronology mutation. The only chronology-write endpoint today is `POST /chronology/gate`, which is the user's own acknowledgement of CPR 31.22 and is not module-attributed. The pattern is ready to drop in (optional `plugin`/`skill` → require `chronology.write`) the moment a module-driven chronology write lands.

**Auto-grant on signup.** Inside `_post_verify` alongside the demo seed. Wrapped in try/except + log so a manifest read failure cannot block registration.

**Modules surface.** `/api/modules` now returns `declared_capabilities` and `granted_capabilities` per skill alongside the legacy `capabilities` field.

**Coverage.** `backend/tests/test_capabilities.py` (7 tests): helper raise-on-miss + succeed-on-grant + grant idempotency + revoke no-op + `list_granted` shape + HTTP wire-through (module-attributed body read 403s on missing grant) + auto-grant on signup populates the expected triples.

## Fix 6 - Real DB test infrastructure

Existing suite used stub sessions everywhere; no test hit `/auth/login`, no test hit `/api/matters/*` for read paths, no test exercised the modules listing. That's how a one-line FK typo took 67/67 green for weeks.

**Change.** `backend/tests/conftest.py`. Function-scoped engine (avoids pytest-asyncio event-loop scoping bugs), outer transaction per test, `async_sessionmaker` joined to that transaction via SAVEPOINT, `httpx.AsyncClient` over `ASGITransport` with `get_session` overridden. Skips cleanly via socket probe when the test DB is unreachable (host-side runs).

**Broader route E2E coverage (19 new tests).** `test_matters_routes.py`, `test_documents_routes.py`, `test_audit_route.py`, `test_modules_route.py`, `test_letters_catalog.py`, `test_workspace_skills.py`. Each follows the same pattern: signup → assertions.

## File-level summary (what's in master, 5 commits ahead of origin)

```
# Source
schemas/module.json                            # + optional `skills` per-skill overrides
backend/app/models/user.py                     # Fix 1: AccessToken.user_id FK override
backend/app/models/__init__.py                 # + WorkspaceSkillCapabilityGrant export
backend/app/models/workspace_skill_capability_grant.py  # NEW: grant table
backend/app/modules/chronology/router.py       # Fix 2: import AuditEntry
backend/app/core/seed.py                       # Fix 4: bootstrap audit rows (both branches)
backend/app/core/capabilities.py               # NEW: enforcement helper
backend/app/core/auth.py                       # + auto-grant on _post_verify
backend/app/core/model_gateway.py              # + require_capability at call + invoke_tool
backend/app/api/modules.py                     # + per-skill resolution, declared/granted fields
backend/app/api/documents.py                   # + optional plugin/skill -> require document.body.read
backend/app/adapters/plugin_bridge.py          # + require matter.read + model.invoke
backend/app/modules/case_law/router.py         # + optional plugin/skill -> require citation.write
backend/app/main.py                            # + CapabilityDenied -> 403 handler
backend/alembic/versions/0008_capability_grants.py  # NEW: grants table migration

# Tests (+41 new)
backend/tests/conftest.py                      # NEW: DB-backed fixtures
backend/tests/test_auth_login.py               # NEW: 6 tests
backend/tests/test_chronology_smoke.py         # NEW: 5 tests
backend/tests/test_seed_audit.py               # NEW: 4 tests
backend/tests/test_capabilities.py             # NEW: 7 tests
backend/tests/test_modules_per_skill_capabilities.py  # NEW: 2 tests
backend/tests/test_matters_routes.py           # NEW: 4 tests
backend/tests/test_documents_routes.py         # NEW: 3 tests
backend/tests/test_audit_route.py              # NEW: 3 tests
backend/tests/test_modules_route.py            # NEW: 2 tests
backend/tests/test_letters_catalog.py          # NEW: 2 tests
backend/tests/test_workspace_skills.py         # NEW: 3 tests

# Docs
README.md, docs/MANIFESTO.md, docs/ROADMAP.md  # voice rewrites (substrate hidden, no em dashes)
backend/app/modules/assistant/pipeline.py      # SYSTEM_PROMPT rewrite in Andy voice
PRE_FLIGHT.md                                  # + §7 browser walk checklist
HANDOVER_LAUNCH_QA.md                          # this file

# Staged for upstream
claude-for-uk-legal-manifests/                 # 3 manifests + README with copy-paste steps
```

## Risks

1. **Fix 1 regresses on a fastapi-users upgrade.** The mixin override is the kind of thing a `pip` upgrade can silently invalidate. The new E2E test plus the FK-metadata regression catcher are the guards.
2. **Capability vocabulary is now load-bearing in two repos.** Adding a name requires schema PR + claude-for-uk-legal manifest update + bridge enum extension. Lock the v0.1 set before shipping the manifests.
3. **Auto-grant on signup must not block registration.** Wrapped in try/except + log; manifest read failures cannot fail signup. Worth a reviewer eye on the failure modes.
4. **Module attribution via optional query params** (`plugin`/`skill`) is the v0.1 wire format for capability gating on user-facing routes. When MCP-style transport lands in v0.2, attribution moves to a header or a signed JWT claim. The current pattern is a deliberate temporary shape.
5. **Worktrees from the parallel-agent work are still on disk.** `git worktree list` shows two locked entries under `.claude/worktrees/`. Harmless. They release automatically when the agent processes exit.

## What this unit ships

- 2 P0 bug fixes (login, chronology)
- 1 P0 architectural fix: schema + bridge + 3 staged manifests with per-skill granularity
- 1 P1 fix: audit bootstrap rows on per-user seed, idempotent across both branches
- 1 P1 fix (pulled forward from "next unit"): runtime capability enforcement at 5 boundaries + auto-grant on signup
- 1 P2 fix: real DB E2E test infrastructure
- 41 new tests (108 total in container, was 67 at session start)
- Voice rewrites of README, MANIFESTO, ROADMAP, assistant system prompt
- PRE_FLIGHT.md gains §7 browser walk checklist

What it does not ship: chronology-write capability wiring (no module-driven write endpoint exists), provider-key launch decision (Andy call before Day 15), Unit #12 launch copy + outreach drafts (follow).

## Open items needing Andy action

1. **`claude-for-uk-legal` manifests.** Copy the three drafts from `claude-for-uk-legal-manifests/` into your `claude-for-uk-legal` checkout, commit, push. Hard guard: no agent files in that repo. Instructions in `claude-for-uk-legal-manifests/README.md`.
2. **`PLUGINS_REPO_REF` re-pin.** After the manifests land in upstream, update the SHA in `backend/app/core/config.py`. Verify `/api/modules` returns `skills: 15` and `broken: 0`.
3. **Provider-key launch posture.** Two acceptable shapes:
   - Configure a real provider key for the demo instance (lowest friction; cost on `b1rdmania`).
   - Make BYO-key onboarding unavoidable (first post-signup screen, blocking matter UI until a key is saved).
   Stub-echo is not an acceptable launch impression. Decision before Day 15.
4. **Browser walk per PRE_FLIGHT §7.** Eyes-on pass across all matter tabs + Modules page + `#/demo` cold.
5. **Push.** Master is 5 commits ahead of origin. Nothing to merge, just push.

## What reviewer should audit

Suggested audit pass:

- `git diff origin/master..HEAD --stat` for the file-level summary above
- Test counts: `docker compose -f infra/docker-compose.yml exec -T -e POSTGRES_DSN="..." backend python -m pytest tests/ -p no:randomly` should print 108 passed
- Manifest validation: every file in `claude-for-uk-legal-manifests/*.module.json` passes `Draft202012Validator(json.load(open('schemas/module.json')))`
- Capability wiring: `grep -rn "require_capability" backend/app/` should return the 5 boundaries listed under Fix 5
- Doctrine check: no `chronology.write` enforcement (deliberate, documented)
- Voice check: `rg -n "—|–" README.md docs/MANIFESTO.md docs/ROADMAP.md` should return no matches (em dash U+2014, en dash U+2013)
