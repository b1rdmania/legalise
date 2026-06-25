#!/bin/sh
# Backend container entrypoint.
#
# Migration policy (Unit 3 — migration discipline):
#
#   Development environments (ENVIRONMENT in {development, dev, local}):
#     `alembic upgrade head` runs at boot so `docker compose up` works
#     without any extra steps.
#
#   Production environments (everything else):
#     Boot does NOT run migrations. Migrations are a deploy-time release
#     step (see fly.toml [deploy] release_command and docs/ARCHITECTURE.md).
#     To override for a one-off run, set MIGRATIONS_ON_BOOT=true.
#
# `exec` matters: it lets uvicorn replace this shell as PID 1 so SIGTERM
# from the container runtime reaches the app cleanly.

set -e

_env="${ENVIRONMENT:-production}"

_is_dev() {
    [ "$_env" = "development" ] || [ "$_env" = "dev" ] || [ "$_env" = "local" ]
}

# Fly's release_command (and `fly ssh console -C ...` / ad-hoc one-shots)
# pass a command to the container. ENTRYPOINT swallows them unless we
# honour positional args explicitly. Exec the supplied command and exit
# without running boot-time migrations or uvicorn — release_command runs
# alembic against the release machine and then must terminate cleanly so
# Fly can promote the new app machines.
if [ "$#" -gt 0 ]; then
    echo "[entrypoint] exec one-shot: $*"
    exec "$@"
fi

if _is_dev || [ "${MIGRATIONS_ON_BOOT:-false}" = "true" ]; then
    echo "[entrypoint] running alembic upgrade head (env=${_env} MIGRATIONS_ON_BOOT=${MIGRATIONS_ON_BOOT:-false})"
    alembic upgrade head
else
    echo "[entrypoint] skipping migrations at boot (env=${_env}) — release step handles this"
fi

# `--reload` is a dev-only setting — it spawns a file-watching parent
# process and a child worker, which breaks Fly's SIGTERM forwarding to
# the actual app. Gate it on ENVIRONMENT so prod deploys (Fly, anywhere
# else) run a single uvicorn process with clean signal handling. Dev
# compose sets ENVIRONMENT=development.
if _is_dev; then
    echo "[entrypoint] exec uvicorn (dev mode — --reload on)"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "[entrypoint] exec uvicorn (production)"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
