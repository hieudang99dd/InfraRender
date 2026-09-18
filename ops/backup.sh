#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${1:-./backups}"
RETENTION_DAYS="${INFRARENDER_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_ROOT%/}/${STAMP}"
mkdir -p "$DEST"
DEST_ABS="$(cd "$DEST" && pwd)"

backup_volume() {
  local volume="$1"
  docker volume inspect "$volume" >/dev/null
  docker run --rm     -v "$volume:/source:ro"     -v "$DEST_ABS:/backup"     alpine:3.22     sh -c "cd /source && tar -czf /backup/${volume}.tar.gz ."
}

backup_volume infrarender_uploads
backup_volume infrarender_outputs

(
  cd "$DEST_ABS"
  sha256sum infrarender_uploads.tar.gz infrarender_outputs.tar.gz > SHA256SUMS
  {
    echo "created_at_utc=$STAMP"
    echo "git_revision=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "host=$(hostname)"
  } > metadata.txt
)

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [ "$RETENTION_DAYS" -gt 0 ]; then
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
fi

echo "Backup created: $DEST_ABS"
