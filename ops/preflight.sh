#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "ERROR: missing .env in repository root." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

required_vars=(
  INFRARENDER_DOMAIN
)

for name in "${required_vars[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "ERROR: required production setting is empty: $name" >&2
    exit 2
  fi
done

if [ ! -s secrets/openai_api_key.txt ]; then
  echo "ERROR: secrets/openai_api_key.txt is missing or empty." >&2
  exit 2
fi

if [ ! -s secrets/infrarender_auth_pass.txt ]; then
  echo "ERROR: secrets/infrarender_auth_pass.txt is missing or empty." >&2
  exit 2
fi
auth_pass="$(tr -d '\r\n ' < secrets/infrarender_auth_pass.txt)"
if [ "${#auth_pass}" -lt 12 ]; then
  echo "ERROR: secrets/infrarender_auth_pass.txt must be at least 12 characters." >&2
  exit 2
fi

for command in docker curl git; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $command" >&2
    exit 2
  fi
done

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not available to the current user." >&2
  exit 2
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin is unavailable." >&2
  exit 2
fi

if ! [[ "${INFRARENDER_DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]] || [[ "${INFRARENDER_DOMAIN}" == *..* ]]; then
  echo "ERROR: INFRARENDER_DOMAIN is not a valid hostname." >&2
  exit 2
fi


secret_mode="$(stat -c '%a' secrets/openai_api_key.txt 2>/dev/null || true)"
if [ "$secret_mode" != "600" ]; then
  echo "WARNING: secrets/openai_api_key.txt should have mode 600." >&2
fi

INFRARENDER_DOMAIN="${INFRARENDER_DOMAIN}" \
docker compose -f compose.deploy.yaml config >/dev/null

echo "Production preflight passed."
