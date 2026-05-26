# Handover — Phase 12 Done (Bootstrap-Admin CLI)

**Builder:** Claude
**Branch:** `runtime-rewrite`
**Plan:** `docs/handovers/PHASE_12_BOOTSTRAP_ADMIN_BUILD_PLAN.md`
**Sweep:** 676 passed, 8 skipped, 0 failed

---

## The first-admin gap is closed

Phase 11 made role mutation real via HTTP. Phase 12 closes the symmetric gap: a fresh fork / hosted-eval deployment can mint its first operator without DBA access.

```bash
python -m app.tools.bootstrap_admin --email alice@example.com
python -m app.tools.bootstrap_admin --email alice@example.com --role workspace_admin

# Second-admin path (rare; lost-key recovery):
LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true \
    python -m app.tools.bootstrap_admin --email bob@example.com --force
```

Phase 11 + Phase 12 together close the admin lifecycle: **bootstrap (CLI) → promotion / demotion (HTTP)**.

---

## Deliverables ledger

| Step | Title | Status |
| --- | --- | --- |
| 1 | `app/tools/__init__.py` + `bootstrap_admin.py` | done |
| 2 | 10 tests in `test_phase12_bootstrap_admin.py` | done |
| 3 | Full sweep — 676 / 8 / 0 | done |
| 4 | This handover | done |

---

## Architectural decisions ratified

The five decisions from the plan held end-to-end. Restating the load-bearing ones:

### Decision #1 — User must already exist

The CLI promotes; it does not register. Registration goes through `/auth/register` (which auto-seeds Khan v Acme and grants legacy capabilities — a complete user-creation pipeline). The CLI would have to duplicate that pipeline or shortcut it.

Cleanest: target must already exist. CLI exits with code 2 + `user_not_found` if no row matches the email.

### Decision #2 — Refuse-by-default if a superuser already exists

The CLI is for the zero-superuser case (clean deploy, fresh fork). Subsequent admins go through Phase 11's HTTP endpoint. An operator accidentally bootstrapping a second admin via CLI would have meant the wrong tool.

CLI exits with code 3 + `superuser_already_exists` if any superuser exists and `--force` is absent.

### Decision #3 — `--force` requires `LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true`

Two gates: the flag AND the env var. A one-off misclick can't escalate; the operator has to set the env var deliberately (typically once per deploy, then unset).

CLI exits with code 4 + `force_requires_env` if `--force` is supplied without the env var. The env var name + the structured error message both name the env var explicitly so the operator knows what to set.

### Decision #4 — Single audit action: `user.admin.bootstrapped`

Mirrors Phase 11's `user.role.changed`. Payload:

```python
{
  "target_user_id": "<uuid>",
  "target_email": "<email>",
  "is_superuser_was": false,
  "is_superuser_is": true,
  "role_was": "solicitor",
  "role_is": "workspace_admin",  # or unchanged
  "forced": false,
  "bootstrapped_at": "<iso8601>"
}
```

`actor_id` is NULL (the system bootstrapped the row, not a user). Reconstruction view picks it up under the standard audit source.

### Decision #5 — Role flag optional; vocabulary locked

`--role` accepts the three Phase 11 tokens: `solicitor`, `qualified_solicitor`, `workspace_admin`. Validation moves out of argparse and into `_bootstrap()` so unknown roles produce the structured exit code 5 + `invalid_role` instead of argparse's generic 2.

---

## Exit code reference

| Code | Constant | Meaning |
| --- | --- | --- |
| `0` | `EXIT_OK` | Success |
| `1` | (argparse) | Generic argument parse error |
| `2` | `EXIT_USER_NOT_FOUND` | Target email has no User row |
| `3` | `EXIT_SUPERUSER_EXISTS` | A superuser exists and `--force` is missing |
| `4` | `EXIT_FORCE_REQUIRES_ENV` | `--force` supplied without env var set |
| `5` | `EXIT_INVALID_ROLE` | `--role` not in `{solicitor, qualified_solicitor, workspace_admin}` |

All constants exported from `app.tools.bootstrap_admin` so test code asserts against the symbol, not the literal.

---

## Operator runbook

**Clean-deploy first-admin path:**

```bash
# 1. Stand up the stack, ensure migrations are at head.
# 2. Register the operator's user via the auth endpoint.
curl -X POST http://api/auth/register \
  -d '{"email":"alice@example.com","password":"..."}'

# 3. Bootstrap them as the first admin.
docker compose -f infra/docker-compose.yml exec backend \
  python -m app.tools.bootstrap_admin \
    --email alice@example.com \
    --role workspace_admin
```

**Fresh-fork first-admin path:** identical to clean-deploy. The CLI works regardless of how the user was registered (auth endpoint, signup form, etc.) as long as a `User` row exists.

**Legitimate second-admin path (e.g. lost-key recovery):**

```bash
# Set the env var ONLY for the duration of the bootstrap call.
LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true \
  docker compose -f infra/docker-compose.yml exec backend \
    python -m app.tools.bootstrap_admin --email bob@example.com --force

# Optional: unset the env var on the host to prevent accidental re-use.
unset LEGALISE_BOOTSTRAP_ADMIN_ALLOWED
```

The audit row records `forced: true` so reconstruction can flag forced bootstraps for review.

---

## New / modified files

```
NEW
  backend/app/tools/__init__.py
  backend/app/tools/bootstrap_admin.py
  backend/tests/test_phase12_bootstrap_admin.py
  docs/handovers/HANDOVER_PHASE_12_BOOTSTRAP_ADMIN_DONE.md (this doc)

MODIFIED
  (none — Phase 12 is a pure addition; no core/api/models/test edits)
```

---

## Tests added (10 total)

The plan named 6 cases; the implementation adds 4 small extras (the workspace_admin role flag + 3 argparse-contract tests). All ten green on first run after the subprocess-vs-SAVEPOINT refactor.

1. Missing user → `BootstrapError(EXIT_USER_NOT_FOUND)`
2. First bootstrap success → DB reflects + audit row landed with canonical payload
3. Second bootstrap refused without `--force` → `BootstrapError(EXIT_SUPERUSER_EXISTS)`
4. `--force` without env → `BootstrapError(EXIT_FORCE_REQUIRES_ENV)`
5. `--force` with env → success + audit payload notes `forced: true`
6. Invalid role → `BootstrapError(EXIT_INVALID_ROLE)`
7. `--role workspace_admin` end-to-end → user is superuser + role is `workspace_admin`
8. argparse: missing `--email` → exit code 2 (argparse default)
9. argparse: `--email` only → `args.role is None`, `args.force is False`
10. argparse: `--role workspace_admin --force` → flags parse correctly

---

## How to run

```bash
docker compose -f infra/docker-compose.yml up -d db backend

# Phase 12 only — 10 tests.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest tests/test_phase12_bootstrap_admin.py

# Full sweep.
docker compose -f infra/docker-compose.yml exec -T \
  -e POSTGRES_DSN="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  -e TEST_DATABASE_URL="postgresql+asyncpg://legalise:legalise@db:5432/legalise_test" \
  backend python -m pytest
```

---

## Implementation note: subprocess vs in-process testing

The plan called for subprocess invocation so the exit-code path was real. During build the tests failed because the test fixtures live in a SAVEPOINT-bound session that's never committed to the database — the CLI subprocess opens its own connection and can't see uncommitted users.

Refactored to call `_bootstrap()` directly with the test session. Exit codes are still pinned (via `BootstrapError.code` assertions) and exported as module constants. The argparse contract is exercised by three additional in-process tests. The CLI's `main()` wrapper is a thin glue layer (parse → call _bootstrap → print → exit); the tested path covers everything except the literal `sys.exit()` translation, which is straight-line `EXIT_*` constant.

Same pattern Phase 5/6/8/10 used (capture audit_failure via monkeypatch) — the SAVEPOINT-vs-subprocess gap is a known test infrastructure limit, not a Phase 12 substrate concern.

---

## Out of scope at end of Phase 12

- HTTP endpoint variant of bootstrap — CLI only
- User registration via the CLI — registration stays on the auth surface
- Bulk bootstrap — one user per invocation
- Superuser demotion via CLI — use Phase 11's HTTP role endpoint
- Web admin console → Phase 13+
- YAML config file — args only
- Audit-log surface for past bootstraps — `/audit/reconstruction` covers it

---

## Hand-off line for Reviewer

> *Phase 12 (bootstrap-admin CLI) implemented end-to-end on `runtime-rewrite`. Full sweep green: 676 passed, 8 skipped. Five architectural decisions request ratification. Pure addition — zero edits to existing code outside the new `app/tools/` package + the new test file. The first-admin gap Phase 11 left open is closed: a fresh fork can mint its first operator with one CLI invocation. Env-gated `--force` covers the rare second-admin / lost-key-recovery case. Ready for ratification.*

---

*End of Phase 12 handover.*
