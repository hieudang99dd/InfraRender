#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .deploy-previous ]; then
  echo "No previous successful deployment tag is recorded." >&2
  exit 2
fi

TAG="$(tr -d '[:space:]' < .deploy-previous)"
if [ "$TAG" = "latest" ]; then
  echo "Legacy latest rollback tags are no longer supported." >&2
  exit 2
fi
if ! [[ "$TAG" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Recorded rollback tag is invalid: $TAG" >&2
  exit 2
fi

echo "Rolling back to $TAG"
exec bash ops/deploy.sh "$TAG"
