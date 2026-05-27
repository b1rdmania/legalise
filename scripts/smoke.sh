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

# Pre-flight: doctor catches substrate failures (DB / Redis / S3 /
# plugins / manifests) before we drive Playwright. The first-run spec
# wipes the DB before running, so a doctor `khan.demo_present` fail
# is reset-repairable and not a smoke blocker — we tolerate that one
# specifically and bail on everything else. Any other fail must be
# fixed by the operator first (see docs/TROUBLESHOOTING.md).
echo "→ Pre-flight: legalise doctor"
doctor_out=$(docker compose -f "$COMPOSE_FILE" exec -T backend \
  python -m app.tools.doctor 2>&1) && doctor_status=$? || doctor_status=$?
echo "$doctor_out"

if [[ $doctor_status -ne 0 ]]; then
  # Extract every "[fail] <name>:" line; if the only failing check is
  # khan.demo_present, continue. Anything else blocks.
  # Parse `[fail] <name>: ...` lines. awk's `-F '[][:]'` is BSD-awk
  # unfriendly, so use sed.
  failing_names=$(printf '%s\n' "$doctor_out" \
    | grep '^\[fail\] ' \
    | sed 's/^\[fail\] //; s/:.*//' \
    | sort -u)
  if [[ "$failing_names" == "khan.demo_present" ]]; then
    echo
    echo "  note: doctor only failed on khan.demo_present. first-run.spec.ts"
    echo "        truncates the DB before signup, so this is reset-repairable."
    echo "        Continuing."
  else
    cat <<EOF

✗ doctor failed on checks smoke cannot repair:
$(printf '  - %s\n' $failing_names)

  Fix these before re-running smoke. See docs/TROUBLESHOOTING.md.
EOF
    exit 1
  fi
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
