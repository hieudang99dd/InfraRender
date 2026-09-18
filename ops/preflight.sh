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
  INFRARENDER_BASIC_AUTH_USER
  INFRARENDER_BASIC_AUTH_HASH
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

case "${INFRARENDER_BASIC_AUTH_HASH}" in
  '$2a
  *)
    echo "ERROR: INFRARENDER_BASIC_AUTH_HASH must be a Caddy-compatible bcrypt hash." >&2
    exit 2
    ;;
esac

if [ "$(stat -c '%a' secrets/openai_api_key.txt 2>/dev/null || true)" != "600" ]; then
  echo "WARNING: secrets/openai_api_key.txt should have mode 600." >&2
fi

INFRARENDER_DOMAIN="${INFRARENDER_DOMAIN}" \
INFRARENDER_BASIC_AUTH_USER="${INFRARENDER_BASIC_AUTH_USER}" \
INFRARENDER_BASIC_AUTH_HASH="${INFRARENDER_BASIC_AUTH_HASH}" \
docker compose -f compose.deploy.yaml config >/dev/null

echo "Production preflight passed."
*|'$2b
  *)
    echo "ERROR: INFRARENDER_BASIC_AUTH_HASH must be a Caddy-compatible bcrypt hash." >&2
    exit 2
    ;;
esac

if [ "$(stat -c '%a' secrets/openai_api_key.txt 2>/dev/null || true)" != "600" ]; then
  echo "WARNING: secrets/openai_api_key.txt should have mode 600." >&2
fi

INFRARENDER_DOMAIN="${INFRARENDER_DOMAIN}" \
INFRARENDER_BASIC_AUTH_USER="${INFRARENDER_BASIC_AUTH_USER}" \
INFRARENDER_BASIC_AUTH_HASH="${INFRARENDER_BASIC_AUTH_HASH}" \
docker compose -f compose.deploy.yaml config >/dev/null

echo "Production preflight passed."
*|'$2y
  *)
    echo "ERROR: INFRARENDER_BASIC_AUTH_HASH must be a Caddy-compatible bcrypt hash." >&2
    exit 2
    ;;
esac

if [ "$(stat -c '%a' secrets/openai_api_key.txt 2>/dev/null || true)" != "600" ]; then
  echo "WARNING: secrets/openai_api_key.txt should have mode 600." >&2
fi

INFRARENDER_DOMAIN="${INFRARENDER_DOMAIN}" \
INFRARENDER_BASIC_AUTH_USER="${INFRARENDER_BASIC_AUTH_USER}" \
INFRARENDER_BASIC_AUTH_HASH="${INFRARENDER_BASIC_AUTH_HASH}" \
docker compose -f compose.deploy.yaml config >/dev/null

echo "Production preflight passed."
*) ;;
  *)
    echo "ERROR: INFRARENDER_BASIC_AUTH_HASH must be a Caddy-compatible bcrypt hash." >&2
    exit 2
    ;;
esac

if [ "$(stat -c '%a' secrets/openai_api_key.txt 2>/dev/null || true)" != "600" ]; then
  echo "WARNING: secrets/openai_api_key.txt should have mode 600." >&2
fi

INFRARENDER_DOMAIN="${INFRARENDER_DOMAIN}" \
INFRARENDER_BASIC_AUTH_USER="${INFRARENDER_BASIC_AUTH_USER}" \
INFRARENDER_BASIC_AUTH_HASH="${INFRARENDER_BASIC_AUTH_HASH}" \
docker compose -f compose.deploy.yaml config >/dev/null

echo "Production preflight passed."
