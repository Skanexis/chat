#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${PHANTOM_LAB_ROOT:-/opt/phantom-lab-chat}"
COMPOSE_FILE="${PHANTOM_LAB_COMPOSE_FILE:-$ROOT_DIR/deploy/docker-compose.prod.yml}"
SERVICES="${PHANTOM_LAB_WATCHDOG_SERVICES:-api web}"
LOCK_DIR="${PHANTOM_LAB_WATCHDOG_LOCK_DIR:-/tmp/phantom-lab-health-watchdog.lock}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "another watchdog run is still active; skipping"
  exit 0
fi
trap 'rmdir "$LOCK_DIR"' EXIT

cd "$ROOT_DIR"

for service in $SERVICES; do
  container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$service" 2>/dev/null || true)"

  if [[ -z "$container_id" ]]; then
    log "$service has no container; starting service"
    docker compose -f "$COMPOSE_FILE" up -d "$service"
    continue
  fi

  state="$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || echo unknown)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || echo unknown)"

  case "$state:$health" in
    running:healthy|running:none|running:starting)
      log "$service ok state=$state health=$health"
      ;;
    *)
      log "$service bad state=$state health=$health; restarting"
      docker compose -f "$COMPOSE_FILE" restart "$service"
      ;;
  esac
done
