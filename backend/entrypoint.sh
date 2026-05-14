#!/bin/sh
# Backend container entrypoint.
#
# Runs alembic migrations against the configured database, then execs
# uvicorn. `exec` matters: it lets uvicorn replace this shell as PID 1,
# so SIGTERM from the container runtime reaches the app cleanly.
#
# Migrations are deliberately part of the boot sequence in v0.1. Once
# we have multi-replica deployments (v0.2+), migrations move to a
# dedicated job step and this script just runs the app.

set -e

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

# `--reload` is a dev-only setting — it spawns a file-watching parent
# process and a child worker, which breaks Fly's SIGTERM forwarding to
# the actual app. Gate it on ENVIRONMENT so prod deploys (Fly, anywhere
# else) run a single uvicorn process with clean signal handling. Dev
# compose sets ENVIRONMENT=development.
if [ "${ENVIRONMENT:-production}" = "development" ] || [ "${ENVIRONMENT:-production}" = "dev" ] || [ "${ENVIRONMENT:-production}" = "local" ]; then
    echo "[entrypoint] exec uvicorn (dev mode — --reload on)"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "[entrypoint] exec uvicorn (production)"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
