#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker-compose.yml"
PREBUILT_COMPOSE_FILE="$ROOT/infra/docker-compose.prebuilt.yml"
PLUGIN_DIR="$(cd "$ROOT/.." && pwd)/claude-for-uk-legal"
COMPOSE_ARGS=(-f "$COMPOSE_FILE")

cd "$ROOT"

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "[quickstart] wrote .env from .env.example"
fi

if [ ! -d "$PLUGIN_DIR/.git" ]; then
  echo "[quickstart] cloning claude-for-uk-legal skills catalogue"
  git clone --depth 1 https://github.com/b1rdmania/claude-for-uk-legal "$PLUGIN_DIR"
else
  echo "[quickstart] skills catalogue present: $PLUGIN_DIR"
fi

echo "[quickstart] starting Legalise"
if [ "${LEGALISE_USE_PREBUILT_IMAGES:-false}" = "true" ]; then
  COMPOSE_ARGS+=(-f "$PREBUILT_COMPOSE_FILE")
  echo "[quickstart] using prebuilt images"
fi

docker compose "${COMPOSE_ARGS[@]}" up -d

cat <<EOF

Legalise is starting.

Open: http://localhost:3000

Create the first account in the browser. In local dev it is verified,
seeded with Khan v Acme, and promoted to workspace admin automatically.

Optional health check:
  docker compose -f infra/docker-compose.yml exec backend python -m app.tools.doctor

To skip local backend/frontend image builds next time:
  LEGALISE_USE_PREBUILT_IMAGES=true ./scripts/quickstart.sh

EOF
