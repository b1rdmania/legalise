# Contributing

Thanks for considering a contribution.

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
rg -n "—|–" frontend/src/ README.md EXECUTIVE_SUMMARY.md ARCHITECTURE.md docs/MANIFESTO.md docs/ROADMAP.md

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
2. [`docs/ENGINEERING.md`](./docs/ENGINEERING.md) — bespoke vs boring
3. [`docs/DESIGN.md`](./docs/DESIGN.md) — visual contract (v0.4 FROZEN)
4. [`docs/JOY.md`](./docs/JOY.md) — product-feel doctrine
5. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — stack rationale
6. [`docs/TRUST.md`](./docs/TRUST.md) — privilege, audit, sub-processors

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

## Code of conduct

Be civil. Disagree with reasoning, not people.
