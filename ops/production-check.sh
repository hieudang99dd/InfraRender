#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${INFRARENDER_DOMAIN:-${1:-}}"
WARN_PERCENT="${INFRARENDER_DISK_WARN_PERCENT:-85}"

if [ -z "$DOMAIN" ]; then
  echo "Set INFRARENDER_DOMAIN or pass the domain as the first argument." >&2
  exit 2
fi

fail=0

if ! curl --fail --silent --show-error --max-time 15 "https://$DOMAIN/api/health" >/tmp/infrarender-health.json; then
  echo "ERROR: HTTPS health check failed for $DOMAIN" >&2
  fail=1
elif ! jq -e '.status == "ok" and .service == "InfraRender AI Backend"' /tmp/infrarender-health.json >/dev/null; then
  echo "ERROR: Health endpoint returned non-OK JSON or missing service field" >&2
  fail=1
else
  echo "OK: HTTPS health endpoint"
fi

for service in backend frontend; do
  container="$(docker compose -f compose.deploy.yaml ps -q "$service" 2>/dev/null || true)"
  if [ -z "$container" ]; then
    echo "ERROR: $service container is not present" >&2
    fail=1
    continue
  fi
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
  if [ "$health" != "healthy" ]; then
    echo "ERROR: $service status=$health" >&2
    fail=1
  else
    echo "OK: $service healthy"
  fi
done

service=caddy
container="$(docker compose -f compose.deploy.yaml ps -q "$service" 2>/dev/null || true)"
if [ -z "$container" ]; then
  echo "ERROR: $service container is not present" >&2
  fail=1
else
  state="$(docker inspect --format '{{.State.Status}}' "$container")"
  if [ "$state" != "running" ]; then
    echo "ERROR: $service status=$state" >&2
    fail=1
  else
    echo "OK: $service running"
  fi
fi

disk_percent="$(df -P /var/lib/docker 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [ -z "$disk_percent" ]; then
  disk_percent="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
fi

if [ "$disk_percent" -ge "$WARN_PERCENT" ]; then
  echo "ERROR: disk usage is ${disk_percent}% (threshold ${WARN_PERCENT}%)" >&2
  fail=1
else
  echo "OK: disk usage ${disk_percent}%"
fi

exit "$fail"
