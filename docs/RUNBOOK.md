# Legalise — Operations Runbook

---

## 1. Migration discipline

### How it works

Production app boot does **not** run `alembic upgrade head`. Migrations run
as a deploy-time release step, once, on a single machine, before new app
instances start.

This prevents the schema-mutation race that happens when multiple Fly machines
boot concurrently and each tries to run the same migration.

### Normal deploy path (Fly)

`fly.toml` declares:

```toml
[deploy]
  release_command = "alembic upgrade head"
```

When you run `fly deploy`, Fly:

1. Builds the new image.
2. Starts one release machine and runs `alembic upgrade head`.
3. Only if that exits 0 does Fly replace live machines with the new image.

No manual step needed — the release command runs automatically on every
`fly deploy`.

### Manual migration (one-off / recovery)

If you need to run a migration outside a full deploy (e.g. to repair a failed
release or apply a hotfix):

```sh
fly ssh console --app legalise-backend -C "cd /app && alembic upgrade head"
```

Run this against a single machine. Do not run it concurrently from two
terminals — Alembic uses a per-migration advisory lock in Postgres, so
concurrent runs are serialised rather than corrupted, but you will see lock-wait
noise in logs. The constraint: **one operator runs migrations at a time**.

### Rollback

Alembic downgrade one step:

```sh
fly ssh console --app legalise-backend -C "cd /app && alembic downgrade -1"
```

Check current revision:

```sh
fly ssh console --app legalise-backend -C "cd /app && alembic current"
```

Show pending migrations:

```sh
fly ssh console --app legalise-backend -C "cd /app && alembic heads && alembic current"
```

### Local development

`docker compose up` boots the `backend` container with `ENVIRONMENT=development`.
`entrypoint.sh` detects this and runs `alembic upgrade head` automatically
before starting uvicorn. No extra step needed.

To skip auto-migration in dev (e.g. to test a schema-behind scenario), unset
`ENVIRONMENT` or set it to `production` in your local `.env`.

### MIGRATIONS_ON_BOOT override

If you need to force boot-time migration in a non-dev environment (not
recommended in production), set:

```sh
MIGRATIONS_ON_BOOT=true
```

This is an escape hatch for staging environments or local containers that
don't carry a dev `ENVIRONMENT` value. Do not set this in production.

---

## 2. Schema-behind fast-fail

At startup, the app checks whether the Postgres schema revision matches the
code's Alembic head. Behaviour differs by environment:

| Environment | Schema behind | Action |
|---|---|---|
| `development`, `dev`, `local` | Logged as warning | Boot continues |
| All other (production, demo…) | Fatal error | Boot aborts, process exits non-zero |

The fatal message is:

```
DB schema is behind code — run `alembic upgrade head` via deploy release step before serving traffic.
```

If you see this in a production deploy, the release command either failed or
was skipped. Check `fly releases` output and re-run the deploy.

---

## 3. Multi-machine concurrent migration constraint

Fly's `release_command` runs on exactly one machine per deploy. That machine
completes the migration before any new app machines start. This prevents
concurrent migration runs under normal operations.

If you manually trigger `alembic upgrade head` on two machines simultaneously,
Alembic's per-migration advisory lock in Postgres serialises the execution —
the second runner blocks until the first finishes, then finds no pending
migrations and exits 0. No data corruption results. However, running concurrent
migrations manually is still disallowed by convention: it causes log noise and
makes rollback harder to reason about.

**Rule:** one operator, one terminal, one `alembic upgrade head` at a time.

---

## 4. Key rotation (Unit 7 — not yet implemented)

Placeholder. When `app.tools.rotate_encryption_key` ships, the runbook will
document the dry-run + live rotation procedure here.

---

## 5. Useful Fly commands

```sh
# Check current app status
fly status --app legalise-backend

# View recent releases (includes release command output)
fly releases --app legalise-backend

# Open a console on a running machine
fly ssh console --app legalise-backend

# View live logs
fly logs --app legalise-backend

# Deploy to production
fly deploy --app legalise-backend --config backend/fly.toml
```
