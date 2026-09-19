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
archive="infrarender_data.tar.gz"
if [ ! -f "$SOURCE/$archive" ]; then
  echo "Missing archive: $SOURCE/$archive" >&2
  exit 2
fi

if [ ! -f "$SOURCE/SHA256SUMS" ]; then
  echo "Missing checksum manifest: $SOURCE/SHA256SUMS" >&2
  exit 2
fi
(cd "$SOURCE" && sha256sum -c SHA256SUMS)

# Validate that the archive has the expected unified-volume layout before any
# destructive step runs. Files are archived from the volume root, so entries
# are prefixed with "./".
validate_archive_layout() {
  local archive="$1"
  local listing
  listing="$(tar -tzf "$archive")"
  local missing=""
  for entry in "./projects.sqlite3" "./uploads/" "./outputs/"; do
    if ! printf '%s\n' "$listing" | grep -qx "$entry"; then
      missing="$missing $entry"
    fi
  done
  if [ -n "$missing" ]; then
    echo "Archive is missing expected entries:$missing" >&2
    echo "Expected unified volume layout: projects.sqlite3 + uploads/ + outputs/" >&2
    return 1
  fi
}

restore_volume() {
  local volume="$1"
  local archive="infrarender_data.tar.gz"

  if [ -n "$(docker ps --filter "volume=$volume" --format '{{.ID}}')" ]; then
    echo "Volume $volume is in use. Stop production containers before restore." >&2
    exit 3
  fi

  validate_archive_layout "$SOURCE/$archive"

  docker volume create "$volume" >/dev/null
  docker run --rm -v "$volume:/target" -v "$SOURCE:/backup:ro" alpine:3.22 sh -c "find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /backup/$archive -C /target"
}

restore_volume "${INFRARENDER_DATA_VOLUME:-infrarender_data}"

echo "Restore completed from: $SOURCE"
