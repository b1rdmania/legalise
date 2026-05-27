#!/usr/bin/env bash
#
# Phase 16 F — local fork smoke.
#
# Runs the Phase 15 first-run Playwright spec against the local compose
# stack. Exit 0 means the fork is wired correctly end-to-end: register
# via UI, bootstrap CLI, install Contract Review via the trust
# ceremony, grant on Khan v Acme, invoke via stub-echo, read the
# reconstruction. Exit non-zero means something is wrong; `legalise
# doctor` and docs/TROUBLESHOOTING.md should explain why.
#
# The spec resets the local database (truncate users/matters/audit/
# everything) on every run. This is destructive — DO NOT run on a
# fork whose DB holds anything you care about. Re-confirmation
# required via `--yes` or the SMOKE_CONFIRM=1 env var.
#
# Usage:
#   ./scripts/smoke.sh            # interactive prompt
#   ./scripts/smoke.sh --yes      # non-interactive (CI / scripted)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="infra/docker-compose.yml"

cd "$REPO_ROOT"

confirm=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) confirm=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done
if [[ "${SMOKE_CONFIRM:-0}" == "1" ]]; then
  confirm=1
fi

echo "→ Legalise local-fork smoke."
echo "  Compose file: $COMPOSE_FILE"
echo

# Pre-flight: doctor must be reachable. We don't require khan.demo_present
# to be ok here because smoke.sh will wipe the DB anyway; we just want
# the substrate alive (DB, Redis, S3 endpoint, plugins, manifests).
echo "→ Pre-flight: legalise doctor"
if ! docker compose -f "$COMPOSE_FILE" exec -T backend python -m app.tools.doctor; then
  cat <<EOF

✗ doctor failed. Fix the failing checks before re-running smoke.
  See docs/TROUBLESHOOTING.md for common remediations.
EOF
  exit 1
fi

echo
echo "⚠  About to run the first-run Playwright spec."
echo "   This TRUNCATES the local database (users, matters, audit, etc.)."
echo "   Stack: $(docker compose -f $COMPOSE_FILE ps --services | tr '\n' ' ')"

if [[ $confirm -ne 1 ]]; then
  read -r -p "   Continue? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "  aborted."; exit 1 ;;
  esac
fi

echo
echo "→ Running first-run.spec.ts"
echo

# Run the existing Phase 15 spec. No new test file; the smoke is a
# wrapper around the canonical e2e the CI workflow already runs.
cd frontend
# E2E_COMPOSE_CWD is relative to frontend/, so .. lands at repo root,
# matching the auth fixture's compose-exec call.
E2E_COMPOSE_CWD=.. \
E2E_COMPOSE_FILE="$COMPOSE_FILE" \
  npx playwright test e2e/first-run.spec.ts

echo
echo "✓ Smoke passed. Your fork is wired correctly."
