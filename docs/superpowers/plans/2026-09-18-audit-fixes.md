# Audit fixes implementation plan

> Execute the approved audit fixes using `superpowers:subagent-driven-development`, with independent review and regression tests. Work remains reviewable in the user's shared checkout; no deployment, paid hosting change, push, or data migration runs automatically.

**Goal:** Prevent project data loss and make the documented deployment and recovery paths match the application.

**Architecture:** Retain the static Next.js frontend and FastAPI backend. Pages calls a public HTTPS backend directly. Docker serves the same static export through Caddy with a same-origin API/media proxy. SQLite and media share one durable `/data` volume. Backend retention remains reference-aware.

**Tech stack:** React/TypeScript, Node test runner, Python unittest/FastAPI/SQLite, Docker Compose, Caddy, Bash.

**Spec:** User-approved findings in the preceding overall audit (18 September 2026).

## Global constraints

- Never expose provider keys or application tokens in a frontend build.
- Preserve current API fields; document and test additions or compatibility behavior.
- No real provider calls, destructive production operations, or automatic paid-service changes.
- Preserve existing user data; old named volumes are not removed or silently imported.
- Test failures first for the data-loss and backend behavior fixes.

## Task 1: Preserve frontend workspace data

Files: `frontend/src/hooks/useWorkspace.ts`, `frontend/src/lib/workspace-state.ts`, relevant frontend tests, `ProjectBar.tsx`, `PromptDock.tsx`, `RenderResult.tsx`, `RightPanel.tsx`.

- [ ] Add regression tests that exercise the actual upload hook with rejected uploads, successful replacements and superseded uploads. Keep the old persisted source and active render until success; revoke failed previews; explicit removal still clears the source.
- [ ] Add legacy migration tests using `renderHistory[].result`, mixed old/new history, malformed entries, selected render and source references. Normalize to `renderVersions` without dropping valid media references or duplicating entries.
- [ ] Run tests before implementation, observe failures, implement, rerun.
- [ ] Show the connection controls when authentication is required and no token is present; keep provider keys out of the UI. Align render/prompt terminology and exposed resolution choices with their help text.
- [ ] Run frontend tests, lint and typecheck. Root owns builds and docs.

## Task 2: Backend configuration and storage safety

Files: `backend/main.py`, `backend/services/config.py`, provider and prompt services, `project_store.py`, `cleanup_storage.py`, backend tests.

- [ ] Reproduce mounted-secret failure with temporary files and mocked provider responses. Read `OPENAI_API_KEY_FILE` and `INFRARENDER_ACCESS_TOKEN_FILE` through the existing helper; missing configured secret files fail closed.
- [ ] Replace age-only cleanup entrypoint with `ProjectStore.cleanup`, honoring `INFRARENDER_DATA_DIR` and `INFRARENDER_RETENTION_DAYS`. Tests preserve referenced old media and delete only expired orphans.
- [ ] Add storage readiness probing: database write transaction plus temporary write/delete in each media directory; return 503 when unavailable without exposing filesystem paths. Test healthy and unavailable storage.
- [ ] Keep successful provider readiness after request-specific 400/422 input failures; continue invalidating on auth/server/rate-limit failures. Test both paths.
- [ ] Run targeted and full backend suites.

## Task 3: Deployment and recovery

Files: Dockerfiles/Compose/Caddy, `render.yaml`, `ops/*.sh`, workflows and deployment documentation.

- [ ] Render blueprint: paid service with explicit persistent disk mounted at `/data`; clearly document that applying it incurs hosting costs and requires a coordinated backup/migration.
- [ ] Frontend Docker copies `out/` into a non-root static Caddy container, builds with `NEXT_PUBLIC_INFRARENDER_API_URL=/`, proxies `/api/*`, `/uploads/*`, `/outputs/*` to backend. Pages continues to build with the HTTPS URL.
- [ ] Local Compose explicitly uses development mode; production supplies token secret, HTTPS public URL and exact CORS origin. All paths mount one named `infrarender_data` volume at `/data`; remove duplicate maintenance service.
- [ ] Backup stops the backend briefly, archives the entire volume (SQLite plus media), restarts via trap, and checksums artifacts. Restore requires explicit confirmation and no running volume users, validates checksums and expected content before replacing data.
- [ ] Use immutable 40-character image tags for deploy/rollback; keep HTTP checks consistent with the static proxy. Restrict publication to main.
- [ ] Add an executable isolated Docker smoke/recovery workflow: upload fixture, save project, recreate backend, confirm persistence, backup/restore and verify image/project recovery. Never execute against existing user volumes.
- [ ] Run available shell/config checks and builds; clearly report any Docker runtime limitation.

## Task 4: Integrate, document and review

- [ ] Replace obsolete frontend/backend/operations instructions with the implemented contracts and one clear reference per deployment path.
- [ ] Document legacy migration, atomic upload, storage readiness, secret files and media-sharing limitations.
- [ ] Review all diffs, run both application suites, lint, typecheck, normal and Pages builds.
- [ ] Obtain an independent final code review; resolve material findings and run affected checks again.
- [ ] Report changed files, exact verification evidence and any host-level action still needed.
