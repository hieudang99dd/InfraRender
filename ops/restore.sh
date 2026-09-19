#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: CONFIRM_RESTORE=yes $0 <backup-directory>" >&2
  exit 2
fi

if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
  echo "Restore is destructive. Re-run with CONFIRM_RESTORE=yes." >&2
  exit 2
fi

SOURCE="$(cd "$1" && pwd)"
for archive in infrarender_data.tar.gz; do
  if [ ! -f "$SOURCE/$archive" ]; then
    echo "Missing archive: $SOURCE/$archive" >&2
    exit 2
  fi
done

if [ -f "$SOURCE/SHA256SUMS" ]; then
  (cd "$SOURCE" && sha256sum -c SHA256SUMS)
fi

restore_volume() {
  local volume="$1"
  local archive="${volume}.tar.gz"

  if [ -n "$(docker ps --filter "volume=$volume" --format '{{.ID}}')" ]; then
    echo "Volume $volume is in use. Stop production containers before restore." >&2
    exit 3
  fi

  docker volume create "$volume" >/dev/null
  docker run --rm -v "$volume:/target" -v "$SOURCE:/backup:ro" alpine:3.22 sh -c "find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /backup/$archive -C /target"
}

restore_volume infrarender_data

echo "Restore completed from: $SOURCE"
