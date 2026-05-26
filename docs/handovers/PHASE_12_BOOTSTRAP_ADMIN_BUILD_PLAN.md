# Phase 12 Build Plan — Bootstrap-Admin CLI

**Builder:** Claude (this session)
**Branch:** `runtime-rewrite`
**Base:** `6f96ab3` (Phase 11 done; sweep 666/8)
**Goal:** Close the first-admin bootstrap gap. Phase 11 made role promotion real via HTTP, but `is_superuser` still requires direct DB. A hosted evaluator or fresh fork shouldn't need DBA access to mint their first operator.

KISS rule: one CLI script, env-gated double-check for the second-run path, one audit action.

---

## Scope (per Reviewer spec)

**In:**
- `python -m app.tools.bootstrap_admin --email <email>` — promotes an existing user to `is_superuser=True`
- Optional `--role {qualified_solicitor,workspace_admin}` flag to set the workspace role at the same time
- Refuses by default if any superuser already exists in the DB
- `--force` only honoured if `LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true` env var is set
- Emits `user.admin.bootstrapped` audit row
- Six tests (the list below)

**Out (KISS):**
- HTTP endpoint variant — CLI only
- User registration via the CLI — target must already exist (registration goes through the auth surface)
- Bulk bootstrap — one user per invocation
- Rollback / demote-superuser via this CLI — out of scope (use direct DB for off-boarding)
- Reading config from a YAML file — args only
- Web UI — Phase 13+
- Sigstore signing — still parked

---

## Pre-build findings

- `User.is_superuser` is the existing admin gate (boolean column at `app/models/user.py:30`); no DB-level constraint stops multiple admins.
- `User.role` is a free-form `String(32)` column; Phase 11's vocabulary (`solicitor` / `qualified_solicitor` / `workspace_admin`) is enforced at the API layer in `api/admin_users.py`. The CLI honours the same vocabulary.
- `audit.log()` from `app.core.api` accepts `actor_id: uuid.UUID | None = None`; the CLI uses `None` because the system bootstrapped the row, not an authenticated user.
- No `app/tools/` directory exists today; Phase 12 creates it with `__init__.py` + `bootstrap_admin.py`.
- Phase 6's signer at `backend/scripts/sign_example_module.py` is a CLI but lives at `backend/scripts/` and is invoked via `python -m scripts.sign_example_module`. Phase 12 uses `app.tools` instead so future CLI tools live alongside app code (matches typical Python project layouts and lets the CLI import substrate cleanly).

### Architectural decisions

**Decision #1 — User must already exist.**

The CLI promotes; it does not register. Registration goes through `/auth/register` (which seeds Khan v Acme + auto-grants legacy capabilities). Mixing those concerns into the bootstrap CLI would couple it to the registration pipeline.

If the target user doesn't exist, the CLI exits with code 2 + `user_not_found`. Operator either registers the target first or fixes the email.

**Decision #2 — Refuse by default if any superuser already exists.**

Operators should not accidentally elevate a second admin via the bootstrap CLI — that's what the Phase 11 endpoint exists for. The CLI is for the zero-superuser case (clean deploy, fresh fork).

If a superuser already exists and `--force` is missing OR `LEGALISE_BOOTSTRAP_ADMIN_ALLOWED` is unset, the CLI exits with code 3 + `superuser_already_exists`. Forces a deliberate operator gesture (env var) for the rare legitimate second-admin case (e.g. lost-key recovery).

**Decision #3 — `--force` only honoured under env var.**

`--force` alone is not enough. The operator must also set `LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true`. Two gates means a one-off misclick can't escalate; the env var has to be set deliberately (typically once per deploy, then unset).

If `--force` is supplied without the env var, the CLI exits with code 4 + `force_requires_env`.

**Decision #4 — Single audit action: `user.admin.bootstrapped`.**

Mirrors Phase 11's `user.role.changed` shape. Payload carries:

```python
{
  "target_user_id": "<uuid>",
  "is_superuser_was": false,
  "is_superuser_is": true,
  "role_was": "solicitor",
  "role_is": "workspace_admin",  # or unchanged
  "forced": false,                # true if --force path
}
```

`actor_id` is NULL (the system bootstrapped the row, not a user). Reconstruction reads this naturally.

**Decision #5 — Role flag is optional; if supplied, vocabulary locked.**

`--role` accepts `qualified_solicitor` or `workspace_admin` only. `solicitor` is the default and a no-op via the flag — but the CLI accepts it for symmetry (i.e. an explicit `--role solicitor` is allowed but doesn't change anything). Unknown values exit with code 5 + `invalid_role`.

---

## Critical path

```
Step 1: backend/app/tools/__init__.py + bootstrap_admin.py
   ↓
Step 2: 6 tests in test_phase12_bootstrap_admin.py
   ↓
Step 3: Full sweep green
   ↓
Step 4: HANDOVER_PHASE_12_BOOTSTRAP_ADMIN_DONE.md
```

~1 day. Smallest phase since Phase 11.

---

## Step 1 — `app/tools/bootstrap_admin.py`

**Files (new):**
- `backend/app/tools/__init__.py` — empty package marker
- `backend/app/tools/bootstrap_admin.py` — argparse-based CLI

CLI shape:

```bash
python -m app.tools.bootstrap_admin --email <email> [--role <role>] [--force]
```

Exit codes:
- `0` — success
- `1` — generic argument-parse error (argparse default)
- `2` — `user_not_found`
- `3` — `superuser_already_exists` (no `--force`)
- `4` — `force_requires_env` (`--force` without env var)
- `5` — `invalid_role`

The CLI opens an async session via the same engine FastAPI uses (`app.core.db`), performs the mutation, commits, and exits. ~150 LOC.

---

## Step 2 — Tests

**File:** `backend/tests/test_phase12_bootstrap_admin.py` (new)

Six tests per the Reviewer spec:

1. **Missing user → exit 2.** Run CLI with an unknown email; assert exit code + structured stderr message.
2. **First bootstrap success → exit 0 + DB reflects + audit row.** User exists, no superuser yet; CLI promotes; `is_superuser=True` in DB; audit row landed.
3. **Second bootstrap refused → exit 3.** A superuser already exists; `--force` missing; CLI exits with `superuser_already_exists`; second target user unchanged.
4. **`--force` without env → exit 4.** A superuser already exists; `--force` supplied; env var unset; CLI exits with `force_requires_env`; DB unchanged.
5. **`--force` with env → exit 0.** A superuser already exists; `--force` supplied; `LEGALISE_BOOTSTRAP_ADMIN_ALLOWED=true` set; CLI promotes the second user; audit row notes `forced=True`.
6. **Invalid role → exit 5.** `--role banana`; CLI exits with `invalid_role` + the allowed list; DB unchanged.

Tests run the CLI as a subprocess so the exit-code path is real. Pytest's `monkeypatch.setenv` controls the env var.

~250 LOC.

---

## Step 3 — Full sweep

- Phase 12 only: 6 tests
- Phases 1–12 combined: ~672 tests
- Entire backend stays green.

---

## Step 4 — Handover

`HANDOVER_PHASE_12_BOOTSTRAP_ADMIN_DONE.md` covers:
- Five architectural decisions for Reviewer ratification
- Operator runbook: clean-deploy first-admin path; fresh-fork first-admin path; legitimate-second-admin (env-gated) path
- Note that Phase 11 + Phase 12 together close the entire admin lifecycle: bootstrap (Phase 12) → promotion/demotion (Phase 11)
- Hand-off line for Reviewer

---

## Out of scope at end of Phase 12

- HTTP endpoint variant of bootstrap — CLI only
- User registration via the CLI
- Bulk bootstrap
- Superuser demotion via CLI — that's Phase 11's role endpoint shape if needed
- Web admin console — Phase 13+
- Reading config from a YAML file
- Audit-log surface for past bootstraps — reconstruction view covers it

---

*End of Phase 12 build plan. Builder commits this, then starts Step 1.*
