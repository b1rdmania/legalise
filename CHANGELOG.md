# Changelog

All notable changes to Legalise are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Runtime capability enforcement. `workspace_skill_capability_grants` table + `require_capability` helper, wired at five boundaries (plugin bridge, model gateway, tool invocation, document body read, citation writes). Auto-grant on signup keeps the v0.1 UX honest (declared = granted by default; user can revoke).
- Per-skill module manifests. Schema supports per-skill `capabilities` and `trust_posture` overrides. Bridge surfaces `declared_capabilities` and `granted_capabilities` separately.
- Bootstrap audit rows on per-user demo seed. `actor_id=NULL`, `module=seed`, `payload.kind=seed`. Idempotent across re-runs and upgrade path.
- Real-DB E2E test infrastructure (`backend/tests/conftest.py`) with transaction-rollback per test, ASGI client, savepoint-joined sessions. Skips cleanly when DB unreachable.
- 41 new tests covering auth, chronology, modules, matters, documents, audit, letters, workspace skills, runtime capability enforcement, seed audit, and per-skill capability surfacing.

### Fixed

- `/auth/login` returned HTTP 500 on every attempt. `AccessToken.user_id` inherited a FK to `user.id` from the fastapi-users mixin; our table is `users`. ORM override added in `app/models/user.py`.
- `/api/matters/{slug}/chronology` returned HTTP 500 on the tainted-event path. `_gate_state` referenced `AuditEntry` without importing it.

### Changed

- README, MANIFESTO, ROADMAP, and the assistant system prompt rewritten to remove AI tics and em dashes. Skill substrate no longer surfaced in product copy.
- docs/handovers/PRE_FLIGHT.md gains §7 browser walk checklist required before deploy.

## [0.1.0] - Target: pending

Initial release. Demo positioning - drafts for solicitor review, not a production legal tool.

### Added

- Matter workspace with audit log, privilege posture toggle, and local-model routing.
- Pre-Motion adversarial premortem module (Optimistic Analyst → Evidence Inspector → Premortem Adversary → Synthesiser). Ported from the standalone premotion app.
- CPR-letter drafter as plugin-bridge proof of `claude-for-uk-legal` invocation from the workspace.
- Chronology read-only demo with CPR 31.22 implied-undertaking gate and SoF variant filtering.
- Contract review as a roadmap tab labelled v0.2.
- Module SDK: `app.core.api` public surface, `module.json` manifest schema, example-tab starter, `MODULE_DEVELOPMENT.md` guide.
- Live demo at `legalise.dev` (Cloudflare Pages + Fly.io `lhr` + Neon London + Cloudflare R2).
- Docker Compose self-host stack.

### Documentation

- `docs/MANIFESTO.md`, `EXECUTIVE_SUMMARY.md`, `SCOPE.md`, `ARCHITECTURE.md`, `BUILD_PLAN.md`, `docs/ROADMAP.md`, `REGULATORY_PLUMBING.md`, `CONTRIBUTING.md`.

To be expanded with detail at launch - this entry is a scaffold during the build window.
