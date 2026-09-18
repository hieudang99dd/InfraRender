#!/usr/bin/env bash
# InfraRenderAI backup script
# Backs up the single infrarender_data Docker volume (projects.sqlite3 + uploads/ + outputs/)
# Usage: ./ops/backup.sh [backup_root_dir]
set -euo pipefail

BACKUP_ROOT="${1:-./backups}"
RETENTION_DAYS="${INFRARENDER_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_ROOT%/}/${STAMP}"
mkdir -p "$DEST"
DEST_ABS="$(cd "$DEST" && pwd)"

backup_volume() {
  local volume="$1"
  local output_file="$2"
  docker volume inspect "$volume" > /dev/null
  docker run --rm \
    -v "$volume:/source:ro" \
    -v "$DEST_ABS:/backup" \
    alpine:3.22 \
    sh -c "cd /source && tar -czf /backup/${output_file} ."
  echo "  ✓ Backed up volume '${volume}' → ${output_file}"
}

# Back up the unified data volume (SQLite database + uploads + outputs)
backup_volume infrarender_data infrarender_data.tar.gz

(
  cd "$DEST_ABS"
  sha256sum infrarender_data.tar.gz > SHA256SUMS
  {
    echo "created_at_utc=$STAMP"
    echo "git_revision=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "host=$(hostname)"
    echo "volumes=infrarender_data"
  } > metadata.txt
)

echo "Backup created: $DEST_ABS"
echo "Contents:"
ls -lh "$DEST_ABS"

# Purge old backups beyond the retention window
if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [ "$RETENTION_DAYS" -gt 0 ]; then
  PRUNED=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -print)
  if [ -n "$PRUNED" ]; then
    echo "$PRUNED" | xargs rm -rf
    echo "Pruned $(echo "$PRUNED" | wc -l) old backup(s) older than ${RETENTION_DAYS} days."
  fi
fi
