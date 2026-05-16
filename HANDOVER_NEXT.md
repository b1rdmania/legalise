# Handover Next

**Purpose:** one current handover for the next agent/reviewer. Older root
handover files were build-process scratch and have been removed from the
repo surface.

## Current Shape

Legalise v0.1 is a matter-first UK legal AI workspace with:

- account/session flow, per-user demo matter seeding, and BYO provider keys
- matter spine: documents, chronology, privilege posture, audit, filesystem materialisation
- module-style surfaces: Assistant, Pre-Motion, Contract Review, Letters, Anonymisation, tabular review, case-law lookup
- module catalogue: installed skill discovery, declared capabilities/trust posture, enable/disable enforcement
- public module submission flow that opens a draft PR against `b1rdmania/claude-for-uk-legal`
- trust rails: gateway posture routing, audit rows, CPR 31.22 chronology gate, Turnstile on public submission

The product thesis is now:

> Superpower your law firm. Install legal modules. Keep the audit trail.

Do not bury the Assistant or module lifecycle in launch copy. They are the recognisable product shell.

## What Was Cleaned

- Removed root `HANDOVER_*.md` and `REVIEW_HANDOVER.md` build scratch.
- Removed backend phase delta scratch files from the repo root surface.
- Canonical docs now live in `README.md`, `docs/ROADMAP.md`, `docs/TRUST.md`,
  `docs/AUTH.md`, `docs/MODULE_DEVELOPMENT.md`, `docs/PEERS.md`, and
  `PRE_FLIGHT.md`.

## Key Misses / Next Work

1. **Launch docs and copy pass**
   - README now needs a final cold-read pass around the Assistant + module catalogue.
   - Keep peer framing: Mike and Stella are peers, not rivals.
   - Do not claim runtime capability enforcement. v0.1 enforces module enable/disable only.

2. **Assistant prompt polish**
   - The Assistant works, preserves the user message under tight context budgets, cites by stable IDs, and writes audit rows.
   - Before launch, rewrite the system prompt in Andy's voice. Keep the JSON envelope and ID-citation rules.
   - Do not turn Assistant into the thesis; it is the front door into matter + modules.

3. **Live deploy smoke**
   - Follow `PRE_FLIGHT.md`, then `infra/deploy/cloudflare.md`.
   - Required smoke: signup, seeded Khan matter, Assistant message, module toggle, submission config, Contract Review SSE disconnect, Gotenberg PDF path, audit rows.
   - Confirm no public Gotenberg ingress and no stale UK-residency overclaim.

4. **Dependency / infra posture**
   - Keep `pyyaml`, `python-frontmatter`, `jsonschema`, Presidio/spaCy, Gotenberg, Turnstile.
   - `@tanstack/react-query` and router are installed but unused; this is accepted v0.1 debt because v0.2 migrates routing/query.
   - Long-running runs still use router-local tasks/SSE; `arq` + Redis + `jobs` table is v0.2.

5. **v0.2 technical debt to preserve**
   - Runtime capability enforcement.
   - Shared module discovery helper used by Modules page and Assistant.
   - Audit action constants in `backend/app/core/audit_actions.py`.
   - Provider-native structured output where supported.
   - Redline anchor ambiguity: ambiguous match must become conflict/no-op, not first-match mutation.
   - Redis-backed submission rate limiter and GitHub App submission token.

## Review Checklist

Run these before any launch-tag commit:

```bash
python -m compileall -q backend/app
cd frontend && npm run build
rg "HANDOVER_|PHASE_[A-E]_DELTA|PHASE_INFRA_DELTA|REVIEW_HANDOVER" README.md docs PRE_FLIGHT.md infra backend/app frontend/src
rg "capability-gated|capability-enforced|UK data residency end-to-end|docxtpl" README.md docs PRE_FLIGHT.md infra backend/app frontend/src
rg "AuditEntry\\(" backend/app -g "*.py"
```

Expected:

- build/compile pass
- no references to deleted handover/delta docs in canonical docs or app code
- no capability-enforcement overclaim
- no `docxtpl` dependency or launch promise
- direct `AuditEntry(...)` only in model/helper/middleware sites

## External Actions

No agent files issues, PRs, DMs, HN posts, X posts, or LinkedIn posts.
Agents may draft under `docs/outreach/`; Andy files everything.
