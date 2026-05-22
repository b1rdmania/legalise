# Handover — External Technical Audit Calibration

**For:** the next implementation agent and reviewer.
**As of:** 2026-05-21. Repo head before this doc: `ce0f575`.
**Purpose:** translate the external technical audit into an implementation plan without letting live-firm blockers derail the open-source v0.4 evaluation launch.

---

## 1. TL;DR

The external audit is useful. It found real issues. It should not be treated as a raw launch stop.

The audit mixes four different bars:

1. Public open-source repository launch.
2. Hosted evaluation demo with synthetic/sample matters.
3. Private regulated-firm pilot using test matters.
4. Live client matter use by a regulated firm.

Several findings are blockers for 3 or 4, not blockers for 1 or 2. The implementation plan below keeps that distinction explicit.

Current doctrine remains:

- v0.4 can launch as an open-source evaluation release if the first-run path works and public copy is honest.
- Hosted demo must be BYO-key by default; Legalise must not resell model access.
- v0.4 is not for live client matters.
- Real firm/live-matter use is gated by deletion, audit integrity, lockfile/dependency hygiene, and operational runbooks.

---

## 2. What The Audit Got Right

Treat these as real signals, not noise:

- **No backend lock file.** There is no `uv.lock`, `requirements.lock`, or equivalent under `backend/`. `backend/pyproject.toml` still uses floor-style constraints for security-sensitive packages.
- **Audit trail is append-only by convention, not enforcement.** `backend/app/models/audit.py` says WORM enforcement is v0.2. There is no DB-level REVOKE, trigger, hash chain, or insert-only role.
- **No matter deletion path.** `retention_until` exists, but there is no `DELETE /api/matters/{slug}` and no retention job.
- **`app/agents/` is not a live shared abstraction.** The shared orchestrator still raises `NotImplementedError`; module orchestration is local.
- **Capability catalogue layering is inverted.** `backend/app/core/capabilities.py` imports discovery helpers from `app.api.modules`.
- **Pre-Motion semantic audit rows miss `module="pre_motion"`.** Start/complete rows in `backend/app/modules/pre_motion/pipeline.py` currently omit the module kwarg.

---

## 3. Where The Audit Overstates

Do not hand the raw audit to a builder as a launch blocker list.

- "Cannot legally onboard a real law firm" is too broad. More precise: **do not onboard a regulated firm for live client matters** until firm-pilot gates close. A synthetic-data technical pilot or public hosted evaluation is a different risk category.
- The `cryptography==41.0.7` claim needs command evidence. The verified repo-level finding is **no backend lockfile, no reproducible production Python environment**. If an agent can reproduce 41.0.7 in an image, record the exact command and output.
- The GDPR retention point is directionally right, but do not write legal conclusions as if counsel reviewed them. Say "real client data requires deletion/export/retention action" rather than over-stating the legal analysis.
- Unused frontend dependencies create scanner noise and documentation drift. They do not automatically inflate the Vite bundle if tree-shaken.
- Redis exposure depends on the actual Compose port binding. Verify before assigning security severity.

---

## 4. Pre-Launch Work Units

These should happen before public v0.4 launch if time allows. They are small, credibility-sensitive, or directly tied to the audit thesis.

### P0.1 — Fix Pre-Motion audit module namespace

**Files:** `backend/app/modules/pre_motion/pipeline.py`, relevant tests.

Add `module="pre_motion"` to:

- `module.pre_motion.run.start`
- `module.pre_motion.run.complete`

Acceptance:

- Both semantic rows carry `module="pre_motion"`.
- Add or update a test that would fail if these rows have `module=NULL`.

Rationale:

This is a tiny concrete audit-quality fix. It supports the public "keep the audit trail" claim.

### P0.2 — Public disclosure check

**Files:** `README.md`, `docs/TRUST.md`, landing copy if needed.

Verify public docs say:

- hosted demo is for evaluation;
- v0.4 is not for live client matters;
- real AI workflows require BYO provider keys;
- Legalise does not resell model access;
- audit is append-only by convention in v0.4, not WORM/tamper-proof.

Acceptance:

- No public copy implies regulator-grade WORM audit.
- No public copy implies live-client suitability.
- BYO-key-only production posture matches `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=false`.

### P0.3 — Architecture honesty around `app/agents/`

**Files:** `docs/ENGINEERING.md`, any architecture docs that mention `app/agents/`.

Either:

- mark `app/agents/` as experimental/deferred; or
- remove present-tense claims that shared BaseAgent/Orchestrator is current runtime infrastructure.

Acceptance:

- A developer reading architecture docs does not expect a live shared orchestrator.
- Existing local module orchestration is described honestly.

### P0.4 — Clean-clone smoke

This is still the real public launch gate.

Run from a fresh clone:

- create `.env` from `.env.example`;
- `docker compose up --build`;
- open frontend;
- browse demo matter;
- try Settings/BYO-key flow;
- upload valid and invalid docs;
- run one module path or confirm key gate;
- inspect audit rows.

Acceptance:

- First 15 minutes of stranger experience is boring.
- Any failure becomes either a fix or an explicit README caveat.

---

## 5. v0.4.1 / Immediate Post-Launch Work Units

These are not open-source launch blockers, but should be the next engineering batch before serious pilot conversations.

### V1 — Backend lockfile and dependency ceilings

Generate and commit a backend lockfile (`uv.lock` preferred if the team standardises on `uv`; otherwise a pinned requirements lock).

Also add:

- `fastapi-users[sqlalchemy]>=14.0.1,<15.0.0`
- `openai>=1.57.0,<2.0.0`

Confirm the built image resolves `cryptography>=44.0.0`.

Acceptance:

- CI fails if the lockfile is missing or stale.
- Lockfile-backed build is documented in README/CONTRIBUTING.
- Exact `cryptography` version is visible in CI output or an auditable command.

### V2 — Magic-byte upload validation

Current upload validation checks declared MIME type and body size. Add first-bytes validation.

Acceptance:

- PDF requires `%PDF-`.
- DOC/DOCX/zip-based Office files require expected signatures.
- TXT/MD/RTF paths are handled explicitly.
- Declared MIME and inferred format mismatch returns a structured 415.

### V3 — Remove `python-frontmatter<1.2` cap

Fix the bytes/str incompatibility in the submissions path, then remove the `<1.2` ceiling.

Acceptance:

- Submission tests pass on current `python-frontmatter`.
- Unauthenticated module submission still sanitises frontmatter safely.

### V4 — Extract `backend/app/core/module_catalogue.py`

Move discovery helpers out of `app.api.modules`:

- `_discover_skills`
- `_module_json_for`
- `_skill_paths`
- `_plugins_root`

Then import from the new core module in both:

- `backend/app/core/capabilities.py`
- `backend/app/api/modules.py`

Acceptance:

- No `app.core.*` module imports from `app.api.*` for catalogue/capability enforcement.
- Existing public/authed module listing parity tests still pass.

### V5 — Dependency and attribution cleanup

Review unused runtime dependencies and docs claims:

- Redis
- boto3
- pgvector Python adapter
- TanStack packages
- lucide-react
- recharts
- clsx
- tailwind-merge

Acceptance:

- Either remove unused dependencies or mark them as explicitly future-facing in docs.
- Do not claim a dependency is "used for" a surface unless code imports it.

---

## 6. Firm-Pilot Gates

These should block real regulated-firm/live-client matter use. They should not block public v0.4 evaluation launch.

### F1 — Manual matter deletion/export path

Ship `DELETE /api/matters/{slug}` or equivalent matter archive/delete/export workflow with owner/admin checks.

Acceptance:

- A user can remove a matter they own, subject to explicit retention/export warnings.
- Account deletion no longer dead-ends forever for users with matters.
- Audit/retention implications are documented.

### F2 — Audit WORM / tamper-resistance

Minimum for pilot:

- explicit disclosure that v0.4 audit is not forensically reliable.

Better before real firm pilot:

- insert-only DB role for app writes;
- REVOKE UPDATE/DELETE on `audit_entries`;
- migration/runbook for permissions;
- optional hash chain as follow-up.

Acceptance:

- TRUST.md and any pilot docs are honest.
- Exported audit logs are not represented as regulator-grade unless enforcement exists below the app layer.

### F3 — Encryption key rotation runbook

Build a CLI/runbook to rotate `LEGALISE_KEY_ENCRYPTION_SECRET`.

Acceptance:

- Re-encrypts all `user_api_keys` rows in one transaction or a documented resumable process.
- Documents compromise response and operator responsibilities.

### F4 — Durable jobs

SSE request-bound workflows are acceptable for demo. They are not enough for real client workflow reliability.

Acceptance:

- Long-running module runs have persisted job rows.
- Client disconnect/reload can recover status/result.
- Failed provider calls preserve audit provenance.

### F5 — Logic tests for high-risk modules

Before using with real client documents, add dedicated tests for:

- anonymisation detection/detokenisation/fallback;
- document edit anchor/conflict/reject-all behaviour.

Acceptance:

- These modules are either tested and enabled for pilot scope, or explicitly out of pilot scope.

---

## 7. What Not To Do

- Do not treat WORM audit, deletion automation, durable jobs, and key rotation as public v0.4 launch blockers.
- Do not claim v0.4 is ready for live client matters.
- Do not add a third-party guardrail layer just to satisfy the audit unless it fits the gateway/capability doctrine.
- Do not rewrite the module system before launch.
- Do not spend launch week cleaning unused dependencies unless they break CI, deploy, or scanner output being shown publicly.

---

## 8. Suggested Hand-Off Line

Use this when passing to the implementation agent:

> Read `docs/HANDOVER_EXTERNAL_AUDIT.md`. Treat the external audit as calibrated input, not a launch stop. Do P0.1-P0.4 before public v0.4 launch if feasible. Put V1-V5 into v0.4.1. Treat F1-F5 as firm-pilot/live-client gates. Do not reclassify firm-pilot blockers as open-source launch blockers without explicit reviewer approval.

---

## 9. Reviewer Questions

1. Are P0.1-P0.4 the right public-launch subset?
2. Should backend lockfile move from v0.4.1 into pre-launch if time allows?
3. Should manual matter deletion be required before any hosted signup, or only before real-firm/live-matter use?
4. Is `app/agents/` better deleted for v0.4 honesty, or left with explicit "experimental" documentation?
5. Should unused dependencies be removed now, or tracked as scanner-noise cleanup after launch?

