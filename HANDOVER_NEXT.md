# Handover Next

**Purpose.** One rolling handover for the next agent or reviewer. Unit-specific records (the most recent: `HANDOVER_LAUNCH_QA.md`) fold back into this file once the unit closes.

## Current Shape

Legalise v0.1 is a UK legal AI workspace, matter-first, privilege-posture-aware, audit-logged. England & Wales only. Apache-2.0.

What ships:

- Auth: fastapi-users cookie sessions, dev autoverify, per-user demo seed (Khan v Acme), per-user AES-256-GCM-encrypted provider keys
- Matter spine: documents, chronology, privilege posture, audit, filesystem materialisation, retention clock
- Five module-style surfaces inside the matter workspace: Pre-Motion, Contract Review, Letters, Anonymisation, Assistant
- Tracked-changes editing, tabular review, case-law citation lookup, public module submission flow
- Privilege-aware model gateway (Anthropic / OpenAI / Ollama / stub-echo) with posture routing and 422 refusal on missing keys
- CPR 31.22 implied-undertaking gate on disclosure-tainted chronology entries
- **Runtime capability enforcement** - `workspace_skill_capability_grants` table, `require_capability` at 5 boundaries (plugin bridge, model gateway, tool invocation, document body read, citation writes), auto-grant on signup, structured 403 + audit row on denial
- **Per-skill module manifests** - schema supports per-skill `capabilities` and `trust_posture` overrides, bridge prefers per-skill, surfaces `declared_capabilities` + `granted_capabilities` separately
- **Bootstrap audit rows on per-user seed** - `actor_id=NULL`, `module=seed`, `payload.kind="seed"`, idempotent across re-runs and upgrade path

Doctrine, locked:

> Manifest requests capabilities. Workspace grants capabilities. Runtime enforces capabilities.

Product thesis (do not bury in launch copy):

> Superpower your law firm. Install legal modules. Keep the audit trail.

The matter workspace is the recognisable product shell. The skill substrate stays invisible in product copy.

## What's open

Items requiring Andy action before Day 15 deploy:

1. **Copy the three drafted `module.json` files** from `claude-for-uk-legal-manifests/` into the `claude-for-uk-legal` repo, commit, push. Hard guard: no agent files in that repo.
2. **Re-pin `PLUGINS_REPO_REF`** in `backend/app/core/config.py` to the new SHA. Verify `/api/modules` returns `skills: 15`, `broken: 0`.
3. **Provider-key launch posture.** Real demo key vs unavoidable BYO-key onboarding. Decision needed before Day 15.
4. **Browser walk** per `PRE_FLIGHT.md` §7. Eyes-on across every tab + Modules page + `#/demo` cold.
5. **Push.** Master is 5 commits ahead of origin.

Items deferred to v0.2 (direction locked):

- TanStack Router + Query migration (deps installed, unused in v0.1)
- Job runner: `arq` + Redis + `jobs` table. Long runs still use router-local `asyncio.create_task`
- `audit_actions.py` constants module (stringly-typed actions become named constants)
- Provider-native structured output / tool calling at the gateway
- Docx templates for Pre-Motion and Contract Review (LBA template returns; procedural generator covers all letter types in v0.1)
- `sse-starlette` swap for bespoke SSE frames
- Multi-instance Redis-backed rate limiter for the submission flow
- GitHub App for module submission (PAT in v0.1)
- Shared module discovery helper between Modules page + Assistant
- Redline anchor: ambiguous match becomes conflict/no-op, not first-match mutation
- **Chronology-write capability wiring** when a module-driven chronology write endpoint lands (no such endpoint exists today; pattern documented)

## Review checklist (run before any launch-tag commit)

```bash
# Source compile + frontend build
python -m compileall -q backend/app
cd frontend && npm run build && cd ..

# No references to deleted historic handover scratch
rg "PHASE_[A-E]_DELTA|PHASE_INFRA_DELTA|REVIEW_HANDOVER" README.md docs PRE_FLIGHT.md infra backend/app frontend/src

# No overclaim in launch copy
rg "capability-gated|capability-enforced|UK data residency end-to-end|docxtpl" README.md docs PRE_FLIGHT.md infra backend/app frontend/src

# Audit writes only via the helper or the model layer
rg "AuditEntry\\(" backend/app -g "*.py"

# No em dashes in public copy (U+2014)
python3 -c "import sys; [print(f, open(f).read().count('—')) for f in ['README.md','docs/MANIFESTO.md','docs/ROADMAP.md','EXECUTIVE_SUMMARY.md','ARCHITECTURE.md']]"
```

Expected:

- build/compile pass
- no references to deleted historic scratch in canonical docs
- launch copy makes no capability-enforcement overclaim that does not exist (NB: v0.1 now actually ships enforcement, so the previous prohibition lifts - but launch copy should still describe accurately, not aspirationally)
- direct `AuditEntry(...)` only in model/helper/middleware/seed sites
- em-dash count = 0 across all five public docs (README, MANIFESTO, ROADMAP, EXECUTIVE_SUMMARY, ARCHITECTURE)

## Test plan

Container (canonical, real DB E2E):

```bash
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/ -p no:randomly
```

Expected: 108 passed. First-time test-DB setup is in `HANDOVER_LAUNCH_QA.md` §"Test counts" or the conftest docstring.

Host (DB tests skip cleanly):

```bash
cd backend && python3.12 -m pytest tests/
```

Expected: 75 passed, 33 skipped.

## External actions

Hard guards remain in force. Agents draft only; Andy files:

- No agent files in `claude-for-uk-legal`
- No agent-filed PRs, issues, DMs, HN posts, X posts, LinkedIn posts
- Drafts under `docs/outreach/` are acceptable

## Doc surface

Root:

- `README.md`, `ARCHITECTURE.md`, `EXECUTIVE_SUMMARY.md`, `SCOPE.md`, `REGULATORY_PLUMBING.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
- `PRE_FLIGHT.md` - interactive deploy preflight
- `HANDOVER_NEXT.md` - this file (rolling)
- `HANDOVER_LAUNCH_QA.md` - most recent unit handover (folds into NEXT after Andy closes the open items above)
- `MANIFESTO.md`, `ROADMAP.md` - 3-line pointer stubs to `docs/`

Canonical under `docs/`:

- `docs/MANIFESTO.md`, `docs/ROADMAP.md`, `docs/AUTH.md`, `docs/TRUST.md`, `docs/PEERS.md`, `docs/MODULE_DEVELOPMENT.md`, `docs/ATTRIBUTIONS.md`, `docs/DESIGN.md`

Deleted in this scan:

- `BUILD_PLAN.md` - daily-granularity launch-week build plan, mission over
