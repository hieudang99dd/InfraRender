# InfraRender Production Readiness

This document records repository readiness separately from live infrastructure
readiness.

## Repository status

| Area | Status | Evidence |
|---|---|---|
| Frontend typecheck | PASS | CI `npm run typecheck` |
| Frontend lint | PASS | CI `npm run lint` |
| Frontend tests | PASS | CI `npm test` |
| Next.js production build | PASS | CI `npm run build` |
| Backend compile | PASS | CI `python -m compileall` |
| Backend tests | PASS | CI unittest suite |
| Docker frontend image | PASS | Docker integration CI |
| Docker backend image | PASS | Docker integration CI |
| Docker Compose local | PASS | CI config + smoke test |
| Docker Compose production | PASS when CI green | CI config validation |
| Next.js -> FastAPI proxy | PASS | Docker smoke test |
| Persistent volumes | READY | stable named volumes |
| Docker secret support | READY | `OPENAI_API_KEY_FILE` |
| HTTPS reverse proxy | READY | pinned Caddy + validated Caddyfile |
| Request size protection | READY | Next.js proxy + Caddy |
| API rate limiting | READY | Next.js server proxy |
| Request tracing | READY | `X-Request-ID` + backend metadata logs |
| Log rotation | READY | Docker json-file limits |
| Resource limits | READY | Compose environment controls |
| File retention | READY | maintenance worker |
| Vulnerability/secret scan | READY | Trivy CI gate |
| Dependency updates | READY | Dependabot |
| Container SBOM/provenance | READY | GHCR publish workflow |
| Immutable deployment tags | READY | full Git SHA tags |
| Deploy health verification | READY | `ops/deploy.sh` |
| Rollback | READY | `ops/rollback.sh` |
| Volume backup | READY | `ops/backup.sh` |
| Backup integrity | READY | SHA-256 manifest |
| Volume restore | READY | `ops/restore.sh` |
| Scheduled backup config | READY | systemd service/timer |
| Health/disk monitoring config | READY | systemd service/timer |
| Production deployment workflow | READY | guarded manual GitHub Action |

## External infrastructure still required

These items cannot be completed only by changing the repository:

- provision a Linux VPS;
- configure its firewall;
- create production DNS records;
- provide the final domain;
- install Docker Engine + Compose on the VPS;
- configure a read-only repository/deployment credential;
- configure GHCR read access if packages remain private;
- create `/opt/infrarender/.env`;
- create `secrets/openai_api_key.txt`;
- configure GitHub `production` environment secrets;
- install/enable the provided systemd timers;
- configure off-server backup/snapshot storage;
- connect monitoring failures to a notification channel;
- run the first paid end-to-end render against the production OpenAI account.

## Production acceptance test

After external infrastructure exists, release acceptance is:

```text
HTTPS
  -> frontend loads
  -> /api/health returns 200
  -> upload JPG/PNG/WEBP
  -> prompt generation
  -> Vision prompt when configured
  -> image render
  -> output download
  -> delete API
  -> restart containers
  -> persistent data survives
  -> backup
  -> restore in a controlled test
  -> rollback to previous Git SHA
```

Only after this sequence passes should the deployment be called live production.

## Scale-up items intentionally deferred

The following are not v1 production blockers and should be introduced only when
product requirements justify them:

- PostgreSQL;
- authentication;
- multi-user project storage;
- S3/R2 object storage;
- Redis;
- distributed render queue;
- billing and quotas;
- admin dashboard;
- Kubernetes.
