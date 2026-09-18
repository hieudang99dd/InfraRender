# InfraRender Production Operations

This directory contains production-only operational tooling. GitHub remains the
source of truth; do not edit application code inside running containers.

## Standard server location

The provided systemd units assume the repository is checked out at:

```text
/opt/infrarender
```

The production `.env` and `secrets/openai_api_key.txt` stay on the server and
are not committed to Git.

## Deploy

Deploy the image tag configured in `.env`:

```bash
bash ops/deploy.sh
```

Deploy an immutable CI-published Git SHA:

```bash
bash ops/deploy.sh <full-40-character-git-sha>
```

The script pulls images, recreates services, checks the public HTTPS health endpoint,
and records the successful tag in `.deploy-current`.

## Rollback

```bash
bash ops/rollback.sh
```

Rollback uses the previously recorded successful image tag and runs the same health
verification as a normal deploy.

## Backup

```bash
bash ops/backup.sh /var/backups/infrarender
```

Each backup contains:

- `infrarender_uploads.tar.gz`
- `infrarender_outputs.tar.gz`
- SHA-256 checksums
- timestamp, host and Git revision metadata

Backups older than `INFRARENDER_BACKUP_RETENTION_DAYS` are pruned after a
successful backup. Default: 14 days.

Backups must also be copied off the VPS or covered by a provider snapshot policy.
A backup stored only on the same VPS is not disaster recovery.

## Restore

Stop the production stack before restoring:

```bash
docker compose -f compose.deploy.yaml down
CONFIRM_RESTORE=yes bash ops/restore.sh /var/backups/infrarender/<timestamp>
docker compose -f compose.deploy.yaml up -d
bash ops/production-check.sh
```

The restore script verifies `SHA256SUMS` when present and refuses to overwrite a
volume that is still attached to a running container.

## Health and disk check

```bash
bash ops/production-check.sh
```

It verifies:

- public HTTPS `/api/health`;
- backend container health;
- frontend container health;
- maintenance worker running;
- Caddy running;
- Docker filesystem usage below `INFRARENDER_DISK_WARN_PERCENT`.

It exits non-zero on failure, so it can be connected to systemd, cron, an external
monitor or an alerting service.

## systemd timers

Copy the units:

```bash
sudo cp ops/systemd/infrarender-* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now infrarender-backup.timer
sudo systemctl enable --now infrarender-monitor.timer
```

Inspect schedules:

```bash
systemctl list-timers 'infrarender-*'
```

Inspect monitoring failures:

```bash
journalctl -u infrarender-monitor.service
journalctl -u infrarender-backup.service
```

For production alert notifications, connect systemd failures or the public
`/api/health` endpoint to the VPS/provider monitoring system or an external uptime
monitor.

## GitHub production deployment

The `Production Deploy` workflow is intentionally manual until a VPS exists.
Configure the GitHub environment named `production` with these secrets:

```text
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_SSH_KEY
PRODUCTION_KNOWN_HOSTS
PRODUCTION_PATH
```

Use a restricted deployment account and a read-only repository deploy credential on
the VPS. Protect the GitHub `production` environment with required reviewers when
available.
