#!/usr/bin/env bash
# InfraRenderAI backup script
# Backs up the single infrarender_data Docker volume (projects.sqlite3 + uploads/ + outputs/)
# while the writer containers are briefly stopped, so the SQLite database, WAL state and
# media files all belong to the same point in time.
# Usage: ./ops/backup.sh [backup_root_dir]
set -euo pipefail

BACKUP_ROOT="${1:-./backups}"
RETENTION_DAYS="${INFRARENDER_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_ROOT%/}/${STAMP}"
mkdir -p "$DEST"
DEST_ABS="$(cd "$DEST" && pwd)"
VOLUME="${INFRARENDER_DATA_VOLUME:-infrarender_data}"
STOPPED_CONTAINERS=()

# Containers that mount the data volume could mutate SQLite or media. Stop them
# for the duration of the archive so the database and the uploads/outputs
# directories are captured at one consistent point in time.
stop_writers() {
  local names
  names="$(docker ps --filter "volume=$VOLUME" --format '{{.Names}}')"
  if [ -n "$names" ]; then
    mapfile -t STOPPED_CONTAINERS <<< "$names"
    for name in "${STOPPED_CONTAINERS[@]}"; do
      [ -z "$name" ] && continue
      echo "Stopping $name for a consistent backup..."
      docker stop --time 30 "$name" >/dev/null
    done
  fi
}

# Always restart anything we stopped, even when the backup or checksums fail.
restart_writers() {
  for name in "${STOPPED_CONTAINERS[@]}"; do
    [ -z "$name" ] && continue
    if docker start "$name" >/dev/null 2>&1; then
      echo "  Restarted $name"
    else
      echo "WARNING: could not restart $name — start the stack manually." >&2
    fi
  done
  STOPPED_CONTAINERS=()
}

# After a restart, wait for healthy containers to become healthy again and fail
# loudly if the stack does not recover.
verify_restarted_health() {
  for name in "$@"; do
    [ -z "$name" ] && continue
    has_health="$(docker inspect --format '{{if .State.Health}}yes{{else}}no{{end}}' "$name" 2>/dev/null || echo no)"
    if [ "$has_health" != "yes" ]; then
      echo "  NOTE: $name has no healthcheck; skipping health verification." >&2
      continue
    fi
    attempt=0
    while [ "$attempt" -lt 60 ]; do
      status="$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo unknown)"
      case "$status" in
        healthy) echo "  $name is healthy"; break ;;
        unhealthy)
          echo "ERROR: $name became unhealthy after the backup restart." >&2
          if ! docker logs --tail 50 "$name" >&2; then
            echo "  (no recent logs available for $name)" >&2
          fi
          return 1
          ;;
      esac
      sleep 2
      attempt=$((attempt + 1))
    done
    if [ "$attempt" -ge 60 ]; then
      echo "ERROR: $name did not become healthy within 120s after the backup restart." >&2
      return 1
    fi
  done
}

# If anything fails before the explicit restart, the EXIT trap still brings the
# stack back up so production writers are never left stopped by a script error.
trap restart_writers EXIT

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

stop_writers
if [ "${#STOPPED_CONTAINERS[@]}" -gt 0 ]; then
  writers_stopped="yes"
else
  writers_stopped="no"
fi

# Back up the unified data volume (SQLite database + uploads + outputs).
# Writers are stopped at this point, so the archive is a consistent snapshot.
backup_volume "$VOLUME" infrarender_data.tar.gz

(
  cd "$DEST_ABS"
  sha256sum infrarender_data.tar.gz > SHA256SUMS
  {
    echo "created_at_utc=$STAMP"
    echo "git_revision=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "host=$(hostname)"
    echo "volumes=$VOLUME"
    echo "writers_stopped_for_backup=$writers_stopped"
  } > metadata.txt
)

# Bring writers back up while the main script is still running so a restart
# failure is reported here, not silently in a trap.
RESTARTED_CONTAINERS=("${STOPPED_CONTAINERS[@]}")
restart_writers
verify_restarted_health "${RESTARTED_CONTAINERS[@]}"

echo "Backup created: $DEST_ABS"
echo "Contents:"
ls -lh "$DEST_ABS"

# Purge old backups beyond the retention window
if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [ "$RETENTION_DAYS" -gt 0 ]; then
  pruned=0
  while IFS= read -r -d '' backup; do
    rm -rf -- "$backup"
    pruned=$((pruned + 1))
  done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -print0)
  if [ "$pruned" -gt 0 ]; then
    echo "Pruned $pruned old backup(s) older than ${RETENTION_DAYS} days."
  fi
fi
