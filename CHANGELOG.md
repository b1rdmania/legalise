# Changelog

All notable changes to Legalise are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-beta] — 2026-06-30

First tagged evaluation release. An open-source governance layer for UK legal
AI: human sign-off and a tamper-evident audit trail over AI-assisted legal
work. Runs locally, bring your own model key. **Not for live client matters.**

### Added

- **Governance-first matter Overview** — the landing screen leads with sign-off status, a plain-English activity feed, the privilege posture, and a one-click **Verify integrity** that recomputes the audit hash chain on demand.
- **Audited hybrid retrieval** (pgvector + full-text, keyless fastembed): the assistant cites real passages from the matter's own documents, with click-back to the source span.
- **Multiple named chat threads per matter**, with a left conversation sub-rail.
- **Background document indexing** on the worker — uploads return immediately and index out-of-band.
- **Opt-in scheduled retention enforcement** — a daily, blast-capped, audited sweep, off by default.
- **Per-matter token budget** — a spend guard that refuses a new turn once the matter's recorded token usage reaches the configured ceiling (`LEGALISE_MATTER_TOKEN_BUDGET`, off by default).
- **Rolling-summary conversation memory** — older turns are summarised into the thread instead of silently dropped past the recent window.
- **Optional error tracking** — env-gated Sentry hook (`SENTRY_DSN`), off by default, `send_default_pii=False` so matter content never leaves the app.
- Deterministic **eval harness** (agent-kit): grounding, refusal, and audit-chain integrity as CI-gateable checks against the real production functions.
- Provider key **verified on save**; **Sonnet** the default model.
- **Multi-arch container images** (`linux/amd64`, `linux/arm64`).
- GitHub skill importer: `/api/modules/external/github/skill` + `/draft` convert a `SKILL.md` from any public GitHub repository into a governed module draft at a pinned commit SHA — same contract as the Lawve importer, same trust ceremony, scripts never executed. The Add-a-skill page accepts a repo URL.

### Removed

- The filesystem plugin path: `claude-for-uk-legal` checkout (PLUGINS_ROOT bind mount + Docker build-time clone), the in-process plugin bridge, `POST /api/matters/{slug}/invoke`, the v1 `/api/modules` + `/api/modules/public` listings, the SKILL.md shim, signup auto-grant of plugin capabilities, and the public module-submissions flow (Turnstile + GitHub draft PRs). Skills now arrive exclusively by import (Lawve or GitHub) through the trust ceremony. Pre-Motion lives on as a standalone skill at `b1rdmania/pre-motion`.

- Runtime capability enforcement. `workspace_skill_capability_grants` table + `require_capability` helper, wired at five boundaries (plugin bridge, model gateway, tool invocation, document body read, citation writes). Auto-grant on signup keeps the v0.1 UX honest (declared = granted by default; user can revoke).
- Per-skill module manifests. Schema supports per-skill `capabilities` and `trust_posture` overrides. Bridge surfaces `declared_capabilities` and `granted_capabilities` separately.
- Bootstrap audit rows on per-user demo seed. `actor_id=NULL`, `module=seed`, `payload.kind=seed`. Idempotent across re-runs and upgrade path.
- Real-DB E2E test infrastructure (`backend/tests/conftest.py`) with transaction-rollback per test, ASGI client, savepoint-joined sessions. Skips cleanly when DB unreachable.
- 41 new tests covering auth, chronology, modules, matters, documents, audit, letters, workspace skills, runtime capability enforcement, seed audit, and per-skill capability surfacing.

### Fixed

- Fresh-fork cold start: `.env.example` shipped an invalid encryption-secret placeholder that stopped the backend from booting (validated by a clean cold-clone smoke test).
- Audit-chain advisory-lock deadlocks on the keyless-chat and new-thread paths.
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
