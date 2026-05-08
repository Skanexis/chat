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

if grep -R "Encrypted-only mode is enabled. Plain text/media messages are not allowed" apps/api/src >/dev/null 2>&1; then
  echo "Refusing to deploy: old encrypted-only 403 guard is still present in apps/api/src."
  exit 1
fi

if ! grep -q "createMessageWithEncryptionFallback" apps/web/src/components/chat/runtime-context.tsx; then
  echo "Refusing to deploy: web encrypted-message fallback is missing."
  exit 1
fi

if ! grep -q "encrypted_payload" apps/web/src/lib/api-client.ts; then
  echo "Refusing to deploy: web API client does not send encrypted_payload."
  exit 1
fi

SOURCE_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
export SOURCE_COMMIT

docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" pull postgres redis
docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" build --pull --no-cache api web
docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" ps

docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" exec -T api sh -lc \
  'if grep -R "Encrypted-only mode is enabled. Plain text/media messages are not allowed" -n /app/apps/api/dist 2>/dev/null; then exit 1; fi'

docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" exec -T web sh -lc \
  'grep -R "encrypted_payload" -n /app/apps/web/.next/server /app/apps/web/.next/static 2>/dev/null | head -1 >/dev/null'

if command -v curl >/dev/null 2>&1; then
  HEALTH_URL="${NEXT_PUBLIC_API_BASE_URL%/}/health"
  HEALTH_JSON="$(curl -fsS "$HEALTH_URL")"
  echo "$HEALTH_JSON"
  if ! printf '%s' "$HEALTH_JSON" | grep -q "\"sourceCommit\":\"$SOURCE_COMMIT\""; then
    echo "Public API $HEALTH_URL is not serving source commit $SOURCE_COMMIT."
    echo "Check nginx upstream/ports: the domain is likely pointing at an old API process."
    exit 1
  fi

  WEB_ORIGIN="${NEXT_PUBLIC_API_BASE_URL%%/v1*}"
  if [[ "$WEB_ORIGIN" == http* ]]; then
    WEB_CHECK_URL="$WEB_ORIGIN/chat/${NEXT_PUBLIC_CHAT_ID:-main}"
    WEB_HEADERS="$(curl -fsSI "$WEB_CHECK_URL" || true)"
    echo "$WEB_HEADERS"
    if ! printf '%s' "$WEB_HEADERS" | grep -qi "x-source-commit: $SOURCE_COMMIT"; then
      echo "Warning: public web $WEB_CHECK_URL did not return x-source-commit: $SOURCE_COMMIT."
      echo "If Telegram still shows old UI, clear WebView cache or verify nginx points at this web container."
    fi
  fi
else
  echo "curl not found; skipped public API/web commit verification."
fi
