# Phase 16 — Release Readiness / Forker Setup (PLAN)

**Status:** plan v3 (R2 patched: S3 split into endpoint check + bucket soft-note to resolve doctor-green-on-fresh-compose contradiction).
**Branch:** `runtime-rewrite` (continues from Phase 15 ratified at `f0b9914`).
**Bar:** a fresh evaluator clones, follows the path, and gets to a working
Khan demo without us narrating it. No new substrate, no new connectors, no
async or marketplace mechanics.

## Why this is a phase, not a docs-pass

Phase 14/14.5/15 produced a green substrate + a green Playwright run, but
every step that worked in CI worked because the workflow file pre-loaded
the right env, the right reset, the right CLI invocation. None of that is
discoverable by a forker. Phase 16 reifies the implicit operator surface
the e2e suite already proves out, so somebody else can drive it.

## What lands

Six concrete pieces, each scoped narrow enough to ship without inventing
new product surface.

### A. README setup path (forker-grade)

Replace the current marketing-shaped "Try it" section with a numbered
clone-to-signed-in-superuser sequence. Each step names the exact command
and the exact expected output. Steps:

1. `git clone …` + `cd`
2. `cp .env.example .env` and the **one** decision the forker has to
   make (provider key now or stub-echo only). Hosted-access mode is
   set for local forks via `VITE_HOSTED_ACCESS_MODE=open` baked into
   compose (see B) — no env decision required.
3. `docker compose -f infra/docker-compose.yml up --build -d`
4. Wait for `legalise doctor` (see C) to return green at its
   pre-user level (Khan demo check soft-notes pre-bootstrap; see C)
5. Open `http://localhost:3000`, register an account via the real
   signup form (e.g. `you@example.com`). Dev-autoverify is on; you
   land signed in but as a non-superuser.
6. `docker compose exec backend python -m app.tools.bootstrap_admin
   --email you@example.com` — the Phase 12 CLI promotes the existing
   user. The CLI exits `user_not_found` if you skipped step 5; this
   order is load-bearing (R1 finding).
7. Reload `http://localhost:3000/app` so `AuthProvider` re-fetches
   `/auth/users/me`. Superuser context loads.
8. Re-run `legalise doctor`; `khan.demo_present` should now be `ok`.

This is the *only* path documented for v0.1. No `make` aliases, no
shell scripts, no abstractions over compose.

### B. `.env.example` — required vs optional, no surprises

One file, two sections clearly labelled:

- **Required for local fork:** `POSTGRES_DSN`, `REDIS_URL`,
  `S3_ENDPOINT` (defaults to MinIO from compose), `CORS_ORIGINS`,
  encryption key seed.
- **Optional / model providers:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `OLLAMA_URL`. With none set, the stub-echo keyless model still works
  for the Khan demo (Phase 15 first-run uses this path).

**Frontend access mode (R1 finding).** The frontend reads
`VITE_HOSTED_ACCESS_MODE` (Vite build-time prefix), not
`HOSTED_ACCESS_MODE`. Default in `lib/access.ts` is `waitlist`, which is
right for hosted but wrong for a fresh fork (signup form never renders).
Phase 16 fixes this by setting `VITE_HOSTED_ACCESS_MODE=open` in the
**frontend service block** of `infra/docker-compose.yml` so forks get
the open-signup path by default with zero env decisions. Hosted prod
keeps `waitlist` via the Cloudflare Pages build env, unchanged. The
e2e workflow already bakes `open` at build time; this just generalises
that to local compose.

Pin: every var the workflow file exports today must appear with an
honest default. Anything the workflow overrides via env interpolation
(`${POSTGRES_DSN:-…}`, `${CORS_ORIGINS:-…}`) must be reflected in
`.env.example` so the forker doesn't have to read compose.

### C. `legalise doctor` — a single check command

New CLI at `backend/app/tools/doctor.py`, sibling to
`bootstrap_admin.py`. Invoked the same way:

```
docker compose exec backend python -m app.tools.doctor
```

Runs a fixed list of checks, prints one line per check, exits non-zero on
any failure. **No substrate added** — only inspection of state the
substrate already exposes:

| Check | What it asserts |
| --- | --- |
| `db.reachable` | Open async session, `SELECT 1` |
| `db.migrations_current` | Alembic head == DB version |
| `db.audit_table_present` | `audit_entries` exists; WORM trigger present (just inspect `pg_trigger`) |
| `redis.reachable` | `PING` returns `PONG` |
| `s3.endpoint_reachable` | Endpoint responds (e.g. `ListBuckets` or root probe). Hard `fail` if MinIO/S3 is not reachable. |
| `s3.bucket_present` | `HEAD` the configured bucket. On miss → `note:bucket_not_created_yet` and exit 0 (R2 fix: fresh MinIO won't have the bucket yet; storage layer creates it lazily on first use, and `--create-bucket` remains available as explicit mutation). Hard `fail` only if endpoint is reachable AND the bucket is required by a later check that already ran. |
| `plugins.root_mounted` | `PLUGINS_ROOT` resolves; at least one manifest discovered via the existing Phase 2 discovery surface |
| `manifests.valid` | Calls the existing registry/validator path against `schemas/module.v2.json` (R1 finding — reference modules are v2-shaped). No hand-rolled validation. |
| `khan.demo_present` | **Stateful** (R1 P2): if `users` is empty → `note:not_yet_seeded` and exit 0 for this check. After a user exists, demand the Khan matter + seed audit row; `fail` if missing. |
| `provider.mode` | Print which providers are configured + whether stub-echo is available; never fail |

Output shape: `ok` / `fail` / `note` per row, plus a footer with the one
remediation hint each failure pre-bakes. Pattern mirrors `kubectl
diagnose` / `flyctl doctor` — instructions in the error, not in a
separate document.

The provider check is **diagnostic, not gating**; a fork with zero
provider keys is a fully valid state because stub-echo works.

**Doctor doctrine: inspection-only by default.** No check writes,
creates, migrates, or seeds anything. Mutations live behind explicit
flags (`--create-bucket` for S3 today; future mutating helpers must
follow the same pattern). A no-flag invocation only reads.

### D. Demo runbook — install → grant → run → audit

New `docs/DEMO.md` (reviewer answer Q2: evaluator-facing, separate from
the operational `docs/RUNBOOK.md`). Linked from both README and
RUNBOOK. One sequence the forker follows after the README path:

1. Sign in as the bootstrap superuser
2. Navigate to `/modules`, install Contract Review via the real trust
   ceremony UI (no CLI shortcut)
3. Open Khan v Acme, grant the Contract Review capability via the UI
4. Click Run, observe deterministic stub-echo result
5. Open the matter Audit tab, see the substrate rows (`module.enabled`,
   `module.grant.created`, `module.capability.invoked`,
   `module.capability.completed`)
6. Same loop for Pre-Motion

This is the journey Phase 15's first-run spec drives in CI; the runbook
just narrates it for a human and links the relevant audit rows back to
`docs/spec/AUDIT_EMISSION_MAP.md` for forkers who want to know what to
expect.

### E. Failure guide — the Phase 15 hardening cycle, externalised

New `docs/TROUBLESHOOTING.md`. Each entry: symptom → diagnosis → fix.
Sourced from the actual Phase 15 hardening cycle so forkers hit fewer
of the silent CI-vs-local divergences we burned through:

- `POSTGRES_DSN` set in shell but backend still hits the default DB →
  hard-coded literal in `infra/docker-compose.yml` overriding env →
  use `${VAR:-default}` interpolation pattern.
- `auth.user.registered` not appearing on matter audit → workspace-scope
  rows need `/api/admin/audit/reconstruction` (superuser only), not the
  matter endpoint. Mirror the substrate scope table from the
  `legalise-phase15-state` memory note.
- `vite preview` doesn't honor `server.proxy` → build with
  `VITE_API_BASE_URL` set; add the preview origin to `CORS_ORIGINS`.
- `bootstrap_admin` exits with usage error → keyword `--email`, not
  positional.
- Audit reconstruction returns empty for a user who just got promoted
  via the CLI → re-sign-in (or `page.reload()`) so the React context
  refetches `/auth/users/me`.

No new findings invented — only the ones the Phase 15 reviewer cycle
proved are real.

### F. Final smoke — one command, asserts forker is usable

New `scripts/smoke.sh` (reviewer answer Q3: bare bash, no Makefile —
no command surface introduced for one script). Runs the
**already-existing** e2e first-run spec against the local stack. No
new test file. No duplicated assertions. Just:

```bash
./scripts/smoke.sh   # internally: cd frontend && npx playwright test e2e/first-run.spec.ts
```

Exits 0 = the fork is wired correctly. Exits non-zero = the doctor and
troubleshooting guide together should explain why.

This is the one place where Phase 16 *uses* existing Phase 15 substrate
rather than documenting it. No new spec; the first-run spec already
walks the exact path the README + runbook describe.

## Explicitly out of scope

- New substrate (no new endpoints, no new tables, no new migrations).
- New connectors, MCP servers, or marketplace mechanics.
- Async refactors, queue work, durable-job hardening.
- Production deploy doctrine — `docs/handovers/HANDOVER_HOSTED_PROD_LIVE.md`
  already covers hosted. Phase 16 is fork-side only.
- Module signing changes.
- Any change to the model gateway, provider list, or stub-echo.
- Re-tokening, re-branding, or design changes.

## Coverage map — what each gap closes

| Forker question | Closed by |
| --- | --- |
| "How do I run this?" | A (README path) |
| "What env do I need?" | B (.env.example) |
| "Did it start correctly?" | C (`legalise doctor`) |
| "Now what?" | D (demo runbook) |
| "Why is X broken?" | E (troubleshooting) |
| "How do I know my fork is healthy?" | F (smoke command) |

## Sub-step order (proposed)

1. **B** — `.env.example` rewrite. Cheapest, unblocks everything else.
2. **C** — `legalise doctor` CLI. Concrete; lets A and E reference real
   commands and real output.
3. **A** — README path. References C's output verbatim.
4. **D** — demo runbook. References A's signed-in state as precondition.
5. **E** — troubleshooting. Written *after* A/C/D so symptom→fix entries
   reference the real paths.
6. **F** — smoke script. Last, because it asserts the whole chain.

Each sub-step is its own PR / commit family; each ratifies independently.

## Verification per sub-step

- **A**: a colleague who hasn't touched this repo follows the README
  alone and reaches a signed-in superuser. No verbal coaching.
- **B**: every var named in `.env.example` either has a working default
  for the Khan demo or is documented as optional with the consequence.
- **C**: `docker compose exec backend python -m app.tools.doctor` returns
  green on a fresh `compose up`; exits non-zero with a clear hint when
  Postgres is down or migrations are behind.
- **D**: every audit row the runbook claims will appear is one the
  Phase 15 first-run spec already asserts. No invented rows.
- **E**: every entry maps to a Phase 15 hardening commit or to a known
  on-disk error path; nothing speculative.
- **F**: `./scripts/smoke.sh` on a clean local stack passes; with the DB
  intentionally stopped it fails fast with a doctor-shaped message.

## Reviewer answers (R1, resolved)

1. `python -m app.tools.doctor`, sibling to `bootstrap_admin`. Python
   module, no shell wrapper.
2. New `docs/DEMO.md` (evaluator-facing), linked from README + RUNBOOK.
   RUNBOOK stays operational.
3. `scripts/smoke.sh`, bare bash, no Makefile.
4. `khan.demo_present` soft-notes pre-signup; hard-fails only after a
   user exists and the seed should have landed.

## Non-negotiables carried forward

- No server-paid model keys in prod (still true; doctor never prompts
  for one, only reports presence).
- Redis never holds matter content (doctor's redis check is `PING`
  only).
- Fly fs not source of truth (doctor's s3 check uses the configured
  endpoint, not the Fly volume).
- Module manifests on disk and their signatures are not touched
  (doctor reads them, never writes).
- Real product/operator surfaces only — the doctor uses the same DB
  session, same alembic version table, same manifest validator the
  substrate uses. No private hooks.
