# Changelog

All notable changes to Legalise are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- v0.1 build in progress — see `BUILD_PLAN.md` for the day-by-day plan.

## [0.1.0] — Target: May/June 2026

Initial release. Demo positioning — drafts for solicitor review, not a production legal tool.

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

- `MANIFESTO.md`, `EXECUTIVE_SUMMARY.md`, `SCOPE.md`, `ARCHITECTURE.md`, `BUILD_PLAN.md`, `ROADMAP.md`, `REGULATORY_PLUMBING.md`, `CONTRIBUTING.md`.

To be expanded with detail at launch — this entry is a scaffold during the build window.
