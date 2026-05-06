#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.prod.yml"
WEB_ENV_FILE="$ROOT_DIR/deploy/env/web.env"

if [[ ! -f "$WEB_ENV_FILE" ]]; then
  echo "Missing $WEB_ENV_FILE"
  echo "Copy deploy/env/web.env.example -> deploy/env/web.env and fill values."
  exit 1
fi

# NEXT_PUBLIC_* vars must exist at web build time.
set -a
# shellcheck disable=SC1090
source "$WEB_ENV_FILE"
set +a

cd "$ROOT_DIR"

docker compose -f "$COMPOSE_FILE" pull postgres redis
docker compose -f "$COMPOSE_FILE" build --pull api web
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose -f "$COMPOSE_FILE" ps
