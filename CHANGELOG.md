# Changelog

All notable changes to Legalise are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] — 2026-07-09

Not a feature release — a hygiene checkpoint before an evaluation walkthrough.
Self-serve signup and streaming chat landed since 0.2.1; the rest is
hardening, public-positioning honesty passes, and test-suite cleanup.

### Added
- **Self-serve signup** — public `/auth/signup` register form with email
  verification (24h token), fork-first framing.
- **OpenRouter** as a BYO-key provider, Sonnet 5 as the reference model.
- **Token-by-token streaming** chat answers; **Stop** and **Regenerate**
  turn controls; doc-count popover in the chat header.
- **Save assistant replies as draft outputs** directly from chat.
- **Mobile thread control** — dropdown + New chat on small screens.
- Matter **export carries the audit hash chain** plus an offline verifier
  (F5), and 10 ADRs (`docs/adr/ADR-001` to `ADR-010`) documenting why the
  system is shaped the way it is.
- `MIGRATION_DSN` — a privileged DSN for `alembic`, so the app can run
  under a reduced-privilege role (the WORM role split) while migrations
  keep DDL authority. Unset = use `POSTGRES_DSN` (single-role deployments
  unchanged).
- Contributor onramp: community skill catalogue, skill-authoring guide,
  contribution ladder.

### Changed
- Design-audit pass across matters/chat/skill-library/activity surfaces:
  consolidated header tiers, mobile drawer scrim + focus trap, role
  display words instead of enum tokens in the posture banner, doc-viewer
  command row, Outputs page renamed to match what it holds.
- Skill library redesigned: sources story, categorised catalogue,
  plain-English pass.
- Public docs (README, EVALUATING, ARCHITECTURE) rewritten across several
  honesty passes — gaps and caveats led with, stale claims fixed, internal
  build scaffolding (`PRODUCT_PLAN.md`) dropped from the public repo.

### Security / Hardening
- Login throttle, keyless-path limits, and model-passthrough hardening on
  the backend launch surface.
- Module install fast path now gated on cryptographic `VERIFIED` status
  only; native skills whose entrypoint can't run on the deployment are
  refused rather than silently failing later.
- Provenance grading (`verified_at_source`) now requires an actual
  byte-match check instead of trusting the claim.
- Patched 4 dev-tooling advisories (`vite`, `undici`, `@babel/core`,
  `js-yaml`) — all transitive dev deps of vite/vitest/eslint/jsdom, not
  runtime dependencies. `npm audit`: 0 vulnerabilities.

### Fixed
- `doctor` masked the DB/Redis password in `db.reachable` /
  `redis.reachable` output (it was printing full DSNs).
- `doctor` s3 check now round-trips an object on the configured bucket
  instead of calling `list_buckets()`, which a least-privilege
  (bucket-scoped) Cloudflare R2 token correctly denies — it was reporting
  `AccessDenied` / "storage down" while uploads actually worked.
- Background document-index jobs no longer block matter deletion.
- Chronology rebuild deduplicates instead of re-proposing existing events.
- Sandbox module tests were failing locally on macOS (not in CI): `RLIMIT_AS`
  on Darwin counts mapped shared-library address space against the cap,
  breaking `exec()` in the child. Marked Darwin-skipped with the real
  reason instead of left as unexplained local failures.
- Frontend Docker image (`node:22-slim`) had drifted from the Node 20 CI
  pin, with nothing local to catch it — added `.nvmrc` and an `engines`
  field, realigned the Dockerfile.

### Tests
- Split 4 oversized test files (1100–1650 lines each) by behavior area:
  `test_assistant_pipeline.py`, `DocumentDetail.test.tsx`,
  `AssistantTab.test.tsx`, `DocumentRichEditor.test.tsx`.
- Collapsed near-duplicate ACL/gate test clusters — 12 "canonical
  scenario" advice-boundary tests, 2 route-ACL 404 clusters, 6
  malformed-cursor tests — into `pytest.mark.parametrize` tables. No
  scenario dropped; backend collection count unchanged at 993.

### Docs
- `docs/README.md` front-door index now includes `LIMITATIONS.md` and
  `docs/adr/`, matching what the root README already treats as core
  evaluator reading.

## [0.2.1] — 2026-06-30

Hardening on top of the first cut — closing three "not production-grade" gaps.
Still an evaluation release; still a work in progress.

### Added

- **Per-matter token budget** — a spend guard that refuses a new turn once the matter's recorded token usage reaches the configured ceiling (`LEGALISE_MATTER_TOKEN_BUDGET`, off by default).
- **Rolling-summary conversation memory** — older turns are summarised into the thread instead of silently dropped past the recent window.
- **Optional error tracking** — env-gated Sentry hook (`SENTRY_DSN`), off by default, `send_default_pii=False` so matter content never leaves the app.

### Docs

- `LIMITATIONS.md`: token (budget now enforces, cost partial), memory (rolling summary), monitoring (Sentry hook + structured logs), embedder (reframed as a deliberate privilege tradeoff).
- README: published images noted as multi-arch (`amd64` + `arm64`).

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
