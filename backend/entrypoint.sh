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

echo "[entrypoint] exec uvicorn"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
