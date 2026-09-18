#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "Missing .env in repository root." >&2
  exit 2
fi
if [ ! -f secrets/openai_api_key.txt ]; then
  echo "Missing secrets/openai_api_key.txt." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

TAG="${1:-${INFRARENDER_IMAGE_TAG:-latest}}"
if ! [[ "$TAG" =~ ^(latest|[0-9a-fA-F]{40})$ ]]; then
  echo "Image tag must be 'latest' or a full 40-character Git SHA." >&2
  exit 2
fi
if [ -z "${INFRARENDER_DOMAIN:-}" ]; then
  echo "INFRARENDER_DOMAIN is required." >&2
  exit 2
fi

if [ -f .deploy-current ]; then
  cp .deploy-current .deploy-previous
fi

export INFRARENDER_IMAGE_TAG="$TAG"

docker compose -f compose.deploy.yaml pull
docker compose -f compose.deploy.yaml up -d --remove-orphans

healthy=0
for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 15 "https://$INFRARENDER_DOMAIN/api/health" >/tmp/infrarender-deploy-health.json; then
    healthy=1
    break
  fi
  sleep 5
done

if [ "$healthy" -ne 1 ]; then
  echo "Deployment health check failed for tag $TAG." >&2
  docker compose -f compose.deploy.yaml ps >&2 || true
  docker compose -f compose.deploy.yaml logs --tail=200 >&2 || true
  echo "Run: bash ops/rollback.sh" >&2
  exit 1
fi

printf '%s\n' "$TAG" > .deploy-current
echo "Deployment healthy: $TAG"
