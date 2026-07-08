# Contributing

Thanks for considering a contribution.

## Ways in, easiest first

You do not need to touch the core to contribute. In rough order of
effort:

1. **Practitioner feedback.** You work in or around E&W practice and
   something here is wrong, missing, or would not survive a real
   matter. No code required.
   [Open a feedback issue](https://github.com/b1rdmania/legalise/issues/new?template=practitioner_feedback.yml);
   corrections with authority attached are the most valuable thing this
   project receives.
2. **Eval cases.** One JSONL row asserting an invariant against real
   production functions. Data only, reviewable in minutes. See
   [`evals/agent-kit/`](./evals/agent-kit/README.md) and the
   [eval case template](https://github.com/b1rdmania/legalise/issues/new?template=eval_case.yml).
3. **Skills.** Build a governed legal skill in your own repo (an
   evening's work, mostly legal drafting) and list it with a one-row PR
   to the catalogue. Guide: [`docs/BUILDING_SKILLS.md`](./docs/BUILDING_SKILLS.md).
   Index: [`docs/CATALOGUE.md`](./docs/CATALOGUE.md).
4. **Docs.** If a claim in the docs does not match the code, that is a
   bug either way. PRs welcome.
5. **Core code.** Backend and frontend changes, the highest bar: tests,
   audit integration, posture respect. Look for
   [`good first issue`](https://github.com/b1rdmania/legalise/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
   labels, or open an issue before building anything large.

## Ground rules

1. **Solicitor-in-the-loop is the design assumption.** Every output is a draft. Don't soften this.
2. **Every legal assertion cites authority.** Statutes by short title and section. Rules by CPR Part. Cases by neutral citation.
3. **Audit and privilege are first-class.** New modules must integrate with `app/core/audit.py` and respect `Matter.privilege_posture`. Don't bypass either.
4. **UK-jurisdiction only.** This codebase is England & Wales. Scottish / NI / US contributions belong in separate forks or sibling projects.
5. **Boring stack stays boring.** Don't introduce a new database, new framework, or new language without an issue and discussion first.

## Local development

Clone, `docker compose up`, sign up, walk the demo matter.

```bash
git clone https://github.com/b1rdmania/legalise
cd legalise
cp .env.example .env             # edit ANTHROPIC_API_KEY if you have one
docker compose -f infra/docker-compose.yml up --build
```

Brings up Postgres, Redis, MinIO, Gotenberg, the FastAPI
backend on :8000, and the React frontend on :3000. Open
`http://localhost:3000` and sign up. The Khan v Acme sample matter
seeds automatically.

## Tests

Backend tests run against a real Postgres at `legalise_test` inside
the backend container so the network and DSN match docker-compose.

Full suite:

```bash
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest -x
```

Single file:

```bash
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest -x tests/test_modules_public.py
```

Re-run migrations on the test DB (after a new alembic revision lands):

```bash
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m alembic upgrade head
```

Frontend:

```bash
cd frontend
npm install
npm run build          # type-check + production build
```

## Dependencies

Backend dependencies live in `backend/pyproject.toml` with explicit upper bounds on the security-sensitive packages (`cryptography`, `fastapi-users`, `anthropic`, `openai`). The resolved versions are pinned in `backend/uv.lock`. CI checks the lockfile is in sync with `pyproject.toml` and asserts `cryptography>=44.0.0` in the installed env.

After editing `backend/pyproject.toml`, regenerate the lockfile:

```bash
cd backend
python -m pip install --user uv     # one-off
python -m uv lock                   # regenerate uv.lock from pyproject.toml
```

Commit both `pyproject.toml` and `uv.lock` together. CI will fail with `uv lock --check` errors if they drift.

The production Dockerfile currently installs from `pyproject.toml` ranges. Switching the production build to install from `uv.lock` for full reproducibility is a v0.5 follow-up.

## Voice checks

Two house rules enforced before commit:

```bash
# No em or en dashes in chrome strings or public docs.
rg -n "—|–" frontend/src/ README.md docs/*.md

# No __pycache__ or .pyc tracked.
git ls-files | rg "__pycache__|\.pyc$"

# Sweep stray bytecode dirs left behind by deleted code paths (dry-run first with -n).
git clean -fdX backend/
```

Both should return empty. Em-dashes inside seeded legal-content
strings (`frontend/src/demo/snapshot.ts` case theory etc.) are kept
by intent — solicitor voice, not chrome.

## Where to read first

If you're skimming the repo to evaluate, in this order:

1. [`README.md`](./README.md) — what it is, what it does
2. [`docs/TRUST.md`](./docs/TRUST.md) — privilege, audit, sub-processors, open gaps
3. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — stack rationale and current substrate
4. [`docs/EVALUATING.md`](./docs/EVALUATING.md) — walkthrough and gate records
5. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — shipped, deferred, parked

## Pull requests

Keep PRs focused — one conceptual change per PR. Tests for backend
changes; type-check + build green for frontend. Voice check on
touched chrome strings. Commit messages explain the *why*, not just
the *what*; look at recent commits on master for the house style.

## CLA

This project will use a Contributor License Agreement to allow the maintainer to dual-licence the code in future for commercial distribution. By submitting a PR you agree your contribution is licensed under Apache 2.0 *and* granted to the project under terms that permit future relicensing.

## AI-generated contributions

AI-assisted code is welcome. AI-fabricated authority is not. If you used an LLM to draft a module, verify every legal citation and every statutory reference manually before submitting.

## Issues

For:

- Plan critique — structural feedback on the docs in this directory.
- Architecture pushback — disagreements with stack / scope / timeline calls.
- Coverage gaps — modules you'd want to see in v0.2+.
- Corrections — links to authority that says the plan is wrong.

Entirely optional: add one of the `provenance:practitioner` / `provenance:builder` / `provenance:firm` labels to say where you're coming from — it helps us see whose problems we're actually solving.

## Code of conduct

Be civil. Disagree with reasoning, not people.

## Maintainer reality

This is an evaluation release with a single maintainer. Issues are triaged weekly; security reports are acknowledged within 48 hours (see SECURITY.md). Expect honest response times, not enterprise ones.
