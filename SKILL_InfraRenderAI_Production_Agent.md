---
name: infrarenderai-production-agent
version: 1.0.0
description: Use when working on the InfraRenderAI repository, changing frontend/backend behavior, modifying API contracts, preparing GitHub Pages deployment, deploying FastAPI, handling environment variables or API keys, debugging cross-layer render flows, or preparing production-safe Git changes.
---

# InfraRenderAI Production & Agent Skill

## 1. Purpose

This skill is the technical operating guide for **InfraRenderAI**.

Use it to keep development, debugging, deployment, and future Agent-driven changes consistent, reviewable, secure, and reversible.

The product goal is:

```text
A user opens one public website URL
        ↓
uploads a reference image
        ↓
chooses rendering/environment options
        ↓
InfraRenderAI builds a structured prompt
        ↓
frontend calls FastAPI
        ↓
FastAPI calls the configured AI image provider
        ↓
generated image is returned
        ↓
preview / history / download
```

The user-facing experience should be similar to a browser-hosted utility such as BPDF: the user opens a URL and starts using the product without cloning the repository or running PowerShell on that client machine.

---

# 2. Project identity

Keep these names distinct:

```text
Product name:      InfraRenderAI
GitHub repository: InfraRender
GitHub owner:      hieudang99dd
Repository URL:    https://github.com/hieudang99dd/InfraRender
Target Pages path: /InfraRender
Target web URL:    https://hieudang99dd.github.io/InfraRender/
```

The target web URL is a deployment target, not proof that production deployment is already complete.

The repository may be private. Before enabling GitHub Pages, verify whether the current GitHub account/plan supports Pages for that repository visibility. Never make a private repository public automatically just to enable Pages. Ask the project owner first.

---

# 3. Current technology direction

The intended stack is:

```text
Frontend
- React
- TypeScript
- Next.js

Backend
- Python
- FastAPI

AI provider layer
- Provider abstraction
- Current provider can include OpenAI image APIs

Source control
- Git
- GitHub

Primary local platform
- Windows
- PowerShell
```

Do not replace the technology stack during unrelated work.

---

# 4. Target production architecture

Preferred architecture:

```text
┌──────────────────────────────────────────────────────┐
│                    GitHub Repository                 │
│                hieudang99dd/InfraRender             │
└──────────────────────────┬───────────────────────────┘
                           │ push
                           ▼
                    GitHub Actions
                           │
               ┌───────────┴───────────┐
               │                       │
               ▼                       ▼
       Frontend build             CI / checks
               │
               ▼
        GitHub Pages
https://hieudang99dd.github.io/InfraRender/
               │
               │ HTTPS API requests
               ▼
     Production FastAPI backend
      hosted on a cloud service
               │
               ▼
       AI provider service
               │
               ▼
       Generated image result
```

## Critical architecture rule

**GitHub Pages hosts the frontend only.**

FastAPI/Python server code must run on a backend hosting service or server that supports Python processes.

The browser must never call OpenAI using a secret key embedded in frontend code.

---

# 5. Non-negotiable security rules

These rules override convenience.

1. Never commit `.env` files containing real secrets.
2. Never expose `OPENAI_API_KEY` or any provider secret to browser code.
3. Never create variables such as `NEXT_PUBLIC_OPENAI_API_KEY`.
4. Never hard-code API keys in TypeScript, JavaScript, Python, tests, examples, logs, screenshots, or documentation.
5. `.env.example` files may contain variable names and placeholders only.
6. The backend owns provider credentials.
7. The frontend talks only to InfraRenderAI backend APIs.
8. Production secrets must be stored in the backend hosting provider's secret/environment configuration.
9. Do not log secret values.
10. Before every push that changes configuration, verify the staged diff for secrets.

Secret preflight examples:

```powershell
git diff --cached --name-only | Select-String '(^|/)\.env($|\.)'
```

`.env.example` is allowed. Real `.env`, `.env.local`, secret files, credentials, or key dumps are not.

---

# 6. Repository structure target

Agents should preserve or gradually converge on this structure without unrelated refactoring:

```text
InfraRender/
│
├── AGENTS.md
├── README.md
├── .gitignore
│
├── docs/
│   ├── architecture.md
│   ├── api-contract.md
│   ├── development.md
│   ├── deployment.md
│   └── change-log.md
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.*
│   ├── .env.example
│   └── README.md
│
├── backend/
│   ├── main.py
│   ├── schemas.py
│   ├── services/
│   │   ├── prompt_builder.py
│   │   ├── image_render.py
│   │   ├── image_upload.py
│   │   └── providers/
│   │       ├── base.py
│   │       └── openai_provider.py
│   ├── tests/
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md
│
├── .github/
│   └── workflows/
│       ├── frontend-pages.yml
│       └── backend-checks.yml
│
├── start.cmd
└── start.ps1
```

Do not create files just to match this tree if equivalent documentation/configuration already exists. Audit first.

---

# 7. Files every Agent must read before implementation

Before changing production code, read these in order when they exist:

```text
1. SKILL_InfraRenderAI_Production_Agent.md / this skill
2. AGENTS.md
3. README.md
4. docs/architecture.md
5. docs/api-contract.md
6. docs/development.md
7. docs/deployment.md
8. frontend/.env.example
9. backend/.env.example
10. tests related to the requested change
```

Then inspect the exact files in the affected flow.

If required documentation is missing, do not invent hidden assumptions. Record the discovered current behavior and create/update documentation as part of the appropriate documentation phase.

---

# 8. Agent startup protocol

Every code task begins with this sequence:

```text
USER REQUEST
     ↓
Read project instructions
     ↓
Inspect repository state
     ↓
Identify affected subsystem(s)
     ↓
Trace current data flow
     ↓
Inspect tests / build commands
     ↓
State intended change
     ↓
Implement smallest coherent change
     ↓
Test
     ↓
Build
     ↓
Inspect git diff
     ↓
Report evidence
```

Do not start by editing the first file whose name looks relevant.

---

# 9. System boundaries

## 9.1 Frontend responsibilities

Frontend owns:

- UI rendering
- image selection and browser preview
- render setting controls
- workspace state (including persistence via `useProjectPersistence` & SQLite backend)
- **Project Export (ZIP):** fetching assets (reference & renders) from backend URLs and packaging them entirely in the browser (via `jszip`) with JSON metadata.
- prompt preview/editing UX
- API request construction
- loading/progress/error presentation
- output preview/history/download UX

Frontend must not own:

- provider API secrets
- direct OpenAI authorization
- provider-specific secret handling
- server-side render orchestration

## 9.2 Backend responsibilities

Backend owns:

- request validation
- file handling rules
- structured prompt generation/orchestration when server-authoritative
- AI provider communication
- provider authentication
- error normalization
- CORS policy
- health/status endpoints
- production logging without secrets

## 9.3 Provider layer responsibilities

Provider modules own provider-specific details:

```text
OpenAI request format
model configuration
provider endpoint
response parsing
provider errors
```

Do not scatter OpenAI-specific code through React components or generic backend services.

---

# 10. Known project flow

The intended end-to-end flow is:

```text
Reference image
    ↓
ImageCanvas / workspace
    ↓
Rendering options
    ↓
PromptDock / settings state
    ↓
useRenderService / equivalent orchestration hook
    ↓
API client
    ↓
FastAPI request schema
    ↓
PromptBuilder
    ↓
ImageRenderService
    ↓
Provider abstraction
    ↓
OpenAI provider
    ↓
Generated result
    ↓
FastAPI response
    ↓
Frontend render result
    ↓
Preview / history / download
```

Existing files observed in the project include concepts such as:

```text
frontend/src/components/workspace/ImageCanvas.tsx
frontend/src/components/prompt/PromptDock.tsx
frontend/src/components/output/RenderResult.tsx
frontend/src/hooks/useRenderService.ts
frontend/src/hooks/useWorkspace.ts
frontend/src/lib/api.ts
frontend/src/lib/backend-proxy.ts
frontend/src/lib/render-settings.ts
frontend/src/lib/workspace.ts
backend/main.py
backend/schemas.py
backend/services/prompt_builder.py
backend/services/image_render.py
backend/services/image_upload.py
backend/services/providers/base.py
backend/services/providers/openai_provider.py
```

An Agent must verify actual current paths before editing.

---

# 11. API contract discipline

Frontend and backend communicate through an explicit contract.

Do not silently change request or response fields.

Maintain `docs/api-contract.md` with the real contract.

Example conceptual contract:

```text
POST /api/render
```

Conceptual request:

```json
{
  "prompt": "...",
  "settings": {
    "buildingType": "residential",
    "buildingDensity": "low",
    "traffic": "cars",
    "trafficDensity": "low",
    "landscape": "flowers-and-shrubs",
    "weather": "sunny",
    "lighting": "soft-diffused",
    "style": "cinematic"
  }
}
```

Image upload transport may be multipart/form-data, a file reference, or another mechanism already implemented. Do not replace it without auditing current code and tests.

Conceptual response:

```json
{
  "success": true,
  "image_url": "...",
  "request_id": "..."
}
```

Conceptual normalized error:

```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "..."
  }
}
```

The examples above are architectural examples, not permission to overwrite the current working schema. The current implementation is authoritative until deliberately migrated.

When the contract changes, update all affected layers in one coherent change:

```text
frontend type
frontend API client
frontend consumer
backend schema
backend route/service
backend tests
frontend tests
docs/api-contract.md
```

---

# 12. Adding a new render setting correctly

Example request: add a new setting such as `rainy weather`.

Do not only add a button.

Trace the full path:

```text
UI option
  ↓
TypeScript option/type
  ↓
workspace state
  ↓
serialization/request payload
  ↓
backend schema
  ↓
prompt builder mapping
  ↓
provider request behavior if relevant
  ↓
response/UI behavior
  ↓
tests
```

Definition of done requires every necessary layer to agree on the value and its meaning.

---

# 13. Prompt generation rules

Prompt generation should be structured and deterministic enough to test.

A professional render prompt should distinguish categories such as:

```text
Reference image / preservation constraints
Architecture / building type
Building density
Vehicles / traffic type
Traffic density
Vegetation / landscape
Weather / atmosphere
Lighting
Visual style / cinematic language
Quality / realism constraints
Negative constraints when supported
```

Avoid uncontrolled duplication such as describing weather or lighting multiple times with contradictory adjectives.

If the UI uses enums or option IDs, map them through a single clear source of truth rather than duplicating string literals across components.

Tests should verify important option → prompt transformations.

---

# 14. Environment model

## 14.1 Local development

Typical local architecture:

```text
Frontend
http://localhost:3000
or the port configured by the project

Backend
http://127.0.0.1:8000
```

Example backend environment template:

```env
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=
OPENAI_BASE_URL=https://api.openai.com/v1
INFRARENDER_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
INFRARENDER_PUBLIC_BASE_URL=
```

Example frontend environment template:

```env
INFRARENDER_API_URL=http://127.0.0.1:8000
```

Use the actual environment variable names already implemented in the repository. Do not rename them without migrating all consumers and docs.

## 14.2 Production

Production concept:

```text
Frontend:
https://hieudang99dd.github.io/InfraRender/

Backend:
https://<production-backend-domain>
```

Production frontend must reference the production backend URL through an appropriate build-time/public configuration.

Production backend secrets are configured on the backend host, not committed to Git.

---

# 15. GitHub Pages frontend requirements

The repository is named `InfraRender`, therefore a GitHub Pages project site normally lives under:

```text
/InfraRender/
```

Before changing Next.js configuration, audit:

```text
Next.js version
App Router vs Pages Router
existing next.config file
use of next/image
API routes/server actions
middleware
runtime server-only dependencies
dynamic routes
client-side absolute paths
asset references
```

## Static-export compatibility gate

GitHub Pages requires a static frontend artifact.

The Agent must verify whether the current Next.js frontend can be statically exported.

Potential blockers include:

```text
server-only route handlers required by the frontend
server actions
runtime SSR requirements
unsupported dynamic behavior
image optimization requiring a Next.js server
server-side secrets
middleware dependencies
```

Do not blindly add `output: 'export'` until this audit is complete.

If static export is viable, production configuration may need concepts such as:

```text
output: export
basePath: /InfraRender
assetPrefix: /InfraRender/
trailingSlash as appropriate
images.unoptimized if Next image optimization cannot run statically
```

Use the exact configuration appropriate to the installed Next.js version and actual app behavior.

## Asset rule

No frontend code should assume production is hosted at domain root `/` when the site is under `/InfraRender/`.

Verify:

```text
CSS loads
JS chunks load
icons load
images load
fonts load
client navigation works
direct refresh works where supported
```

---

# 16. Backend production requirements

Before deployment, FastAPI should provide production-safe behavior.

Minimum audit:

```text
startup command
requirements.txt completeness
Python version compatibility
health endpoint
CORS
request size limits
image file validation
provider timeout handling
provider error normalization
logging
secret handling
output persistence strategy
```

## Health endpoint

Prefer a lightweight endpoint such as:

```text
GET /health
```

It should verify application availability without making an expensive AI render request.

## CORS

Local origins and production origins must be configuration-driven.

Production should allow the real deployed frontend origin.

Avoid `allow_origins=["*"]` in production unless there is a deliberate documented reason.

## Provider calls

Provider operations need:

```text
timeouts
clear error mapping
safe logs
no secret output
useful user-facing failure message
```

---


# 16.5 Docker Containerization (Backend)

The backend is fully containerized and orchestration is managed via `docker-compose.yml`.
This is the standard and required way to deploy the backend to any cloud provider supporting Docker.

## Running in Production with Docker

```bash
# Provide the OPENAI_API_KEY environment variable when launching
OPENAI_API_KEY=your_real_key_here docker-compose up -d --build
```

## Docker Architecture

- **Dockerfile**: Located in `backend/Dockerfile`. It uses a lightweight Python image, sets up the working directory, installs dependencies without cache to save space, and exposes port `8000`.
- **docker-compose.yml**: Located in the repository root. It maps port `8000:8000`, injects environment variables like `INFRARENDER_CORS_ORIGINS` and `OPENAI_API_KEY`, and mounts a persistent volume `infrarender_data:/data` if persistent storage is needed.

**Security Rule for Docker**: Never hardcode the `OPENAI_API_KEY` inside the `docker-compose.yml` or `Dockerfile`. Always inject it at runtime using environment variables.

# 17. Hosting strategy

Preferred initial deployment architecture:

```text
Frontend → GitHub Pages
Backend  → Python/FastAPI cloud hosting
```

The backend provider is intentionally not hard-coded in this skill because hosting options, pricing, limits, and deployment models change.

When choosing a host, verify:

```text
Python/FastAPI support
HTTPS
custom environment variables/secrets
request upload size
request execution timeout
memory limits
persistent vs ephemeral filesystem
outbound access to AI provider
logs
pricing / sleep behavior
region/latency
custom domain support if needed
```

Do not select a provider solely because its free tier exists.

---

# 18. GitHub Actions goals

## 18.1 Frontend Pages workflow

Intended CI/CD sequence:

```text
push to main
   ↓
checkout
   ↓
setup Node
   ↓
install dependencies
   ↓
frontend tests
   ↓
frontend production build/static export
   ↓
upload Pages artifact
   ↓
deploy GitHub Pages
```

The workflow must fail if tests or build fail.

Do not deploy a knowingly broken build.

## 18.2 Backend checks workflow

Minimum sequence:

```text
push / pull request
   ↓
checkout
   ↓
setup Python
   ↓
install requirements
   ↓
run backend tests
```

Backend deployment may be handled by the hosting provider after GitHub push, but CI must still validate the code.

---

# 19. Implementation phases

Do not ask an Agent to "make everything production-ready" in one unreviewed change.

Use these phases.

## Phase 1 — Repository intelligence

Goal: make the project understandable before behavior changes.

Create or normalize:

```text
AGENTS.md
docs/architecture.md
docs/api-contract.md
docs/development.md
docs/deployment.md
```

Acceptance criteria:

```text
- architecture matches real code
- local run instructions are correct
- current API contract is documented
- environment variables are documented without secrets
- deployment target is documented
```

Recommended commit:

```text
docs: add InfraRenderAI architecture and agent instructions
```

## Phase 2 — Codebase audit

Goal: determine production gaps without changing architecture blindly.

Audit:

```text
frontend build
frontend tests
Next.js static export compatibility
basePath-sensitive assets
API client configuration
backend tests
FastAPI startup
CORS
health endpoint
provider configuration
secret handling
```

Output should be a concrete gap list with file paths and test evidence.

## Phase 3 — Production-ready frontend

Goal: produce a valid static Pages artifact if compatible.

Work may include:

```text
Next.js static export configuration
/InfraRender base path handling
asset fixes
production API URL configuration
frontend tests
production build
GitHub Pages workflow
```

Recommended commits should be small and descriptive, e.g.:

```text
build: configure frontend static export for InfraRender
ci: add GitHub Pages deployment workflow
```

## Phase 4 — Production-ready backend

Goal: make FastAPI deployable and secure.

Work may include:

```text
health endpoint
config-driven CORS
production startup command
provider timeout/error handling
environment validation
logging cleanup
tests
```

Recommended commit:

```text
backend: prepare FastAPI for production hosting
```

## Phase 5 — Deployment and integration

Goal: connect real deployed frontend to real deployed backend.

Tasks:

```text
deploy backend using Docker / docker-compose
set backend secrets in runtime environment
obtain HTTPS backend URL
configure frontend production API URL
configure production CORS
deploy Pages
verify browser → backend communication
```

## Phase 6 — Production verification

Goal: prove real use works from a browser on another machine.

Test:

```text
open deployed URL
upload image
select options
generate/inspect prompt
submit render
receive output
preview output
download output
repeat after page reload
repeat on another computer/browser
```

---

# 20. TDD and change discipline

For features, bug fixes, and behavior changes:

```text
RED
write or identify a failing test
↓
verify it fails for the intended reason
↓
GREEN
make the smallest implementation change
↓
verify targeted test passes
↓
run relevant broader tests
↓
REFACTOR
clean only while tests remain green
```

Do not change five independent behaviors in one patch.

Configuration-only changes still require direct verification through build/deployment checks even when unit tests are not appropriate.

---

# 21. Debugging discipline

Do not guess from a screenshot and immediately edit multiple files.

Use:

```text
symptom
  ↓
reproduce
  ↓
read exact error
  ↓
identify failing layer
  ↓
trace inputs/outputs across boundary
  ↓
form one hypothesis
  ↓
test minimally
  ↓
fix root cause
  ↓
verify
```

For cross-layer failures, inspect boundaries:

```text
UI → state
state → API client
API client → HTTP request
HTTP request → FastAPI schema
route → service
service → provider
provider → external API
response → frontend
```

---

# 22. Build and test verification

Before claiming a change is complete, run the commands actually defined by the repository.

Typical frontend verification:

```powershell
cd C:\InfraRenderAI\frontend
npm test
npm run build
```

If the project uses a different test script, use `package.json` as the source of truth.

Typical backend verification:

```powershell
cd C:\InfraRenderAI\backend
pytest
```

or the exact documented test command.

Then inspect Git state:

```powershell
cd C:\InfraRenderAI
git status
git diff
```

For staged changes:

```powershell
git diff --cached
```

Evidence is required before saying:

```text
fixed
complete
production-ready
all tests pass
build succeeds
```

---

# 23. Git workflow

Initial repository setup has already been completed for the current project.

Do not rerun `git init` or `git remote add origin` during normal updates.

Normal update workflow:

```powershell
cd C:\InfraRenderAI
git status
git add .
git status
git commit -m "<clear description>"
git push
```

Use meaningful commits.

Good examples:

```text
docs: document frontend backend contract
fix: preserve API base path in production
feat: add rainy weather render option
build: configure Next.js static export
ci: deploy frontend to GitHub Pages
backend: add configurable production CORS
```

Avoid:

```text
update
fix stuff
new code
final
```

---

# 24. Staging safety before commit

Before committing deployment/configuration work, verify staged paths:

```powershell
git --no-pager diff --cached --name-only
```

Check for sensitive or generated material:

```powershell
git --no-pager diff --cached --name-only | Select-String 'node_modules|\.venv|\.log$|outputs/|renders/|generated/'
```

Inspect environment files:

```powershell
git --no-pager diff --cached --name-only | Select-String '(^|/)\.env($|\.)'
```

`.env.example` is expected and allowed if it contains placeholders only.

---

# 25. Rollback strategy

Every major phase should be independently reviewable and reversible.

Do not combine documentation, frontend architecture changes, backend refactors, and deployment configuration into one giant commit.

Before a high-risk deployment change:

```text
- confirm working tree state
- commit current known-good work
- run tests/build
- make one scoped change
- verify again
```

If a deployment fails, identify whether failure is:

```text
source code
build configuration
Pages path
GitHub Actions
backend host
CORS
frontend API URL
provider/API credentials
provider request
```

Rollback the smallest failing change rather than rewriting the whole stack.

---

# 26. AGENTS.md content requirements

If `AGENTS.md` is missing, create it during Phase 1 with at least:

```markdown
# InfraRenderAI Agent Instructions

## Read first
- README.md
- docs/architecture.md
- docs/api-contract.md
- docs/development.md
- docs/deployment.md

## Security
- Never expose provider API keys in frontend code.
- Never commit real .env files.
- Provider secrets belong to backend runtime environment variables.

## Change protocol
1. Inspect current implementation.
2. Trace the full affected data flow.
3. Identify tests before editing.
4. Make the smallest coherent change.
5. Run targeted tests.
6. Run relevant build/test suite.
7. Inspect git diff.
8. Report changed files and verification evidence.

## Contract rule
Do not change frontend/backend API fields silently. Update code, tests and docs together.
```

Keep `AGENTS.md` concise. Put detailed architecture in `docs/`.

---

# 27. architecture.md content requirements

It must answer:

```text
What are the major modules?
What does each module own?
How does an image render request flow end to end?
Where are provider-specific details isolated?
Where are configuration values read?
Where are output images represented?
What is local vs production behavior?
```

Include an ASCII flow diagram and actual file paths.

---

# 28. api-contract.md content requirements

Document real endpoints and types.

For each endpoint:

```text
method
path
content type
authentication if any
request fields
response fields
error codes
file upload rules
size/format limits
example request
example response
```

The document must reflect current code, not aspirational guesses.

---

# 29. development.md content requirements

Include:

```text
prerequisites
Node version if constrained
Python version if constrained
frontend install
backend virtual environment setup
frontend run command
backend run command
environment setup
test commands
build commands
common local URLs
```

The goal is that a new machine can clone the repository and reproduce local development without undocumented steps.

---

# 30. deployment.md content requirements

Include:

```text
production architecture
frontend deployment process
backend deployment process
required production environment variables
GitHub Actions overview
CORS configuration
Pages base path
backend health check
post-deploy verification
rollback steps
```

Never place real secret values in this file.

---

# 31. UI evolution rules

The current product direction favors a clear render workspace rather than unnecessary navigation chrome.

Known UX direction includes:

```text
reference image area
rendered output area
render settings
prompt controls
reset/new action
render action
preview/download
status/error feedback
```

When modifying UI:

```text
preserve core workflow
avoid adding decorative complexity without function
keep input and output visually distinct
make render state obvious
maintain responsive behavior
keep actions close to their context
```

Do not perform large visual redesigns during backend/deployment tasks unless required for functional correctness.

---

# 32. Error handling model

Errors should be normalized by layer.

Frontend should distinguish at least:

```text
validation error
network/backend unavailable
render rejected
provider failure
timeout
unexpected response
```

Backend should avoid leaking raw provider secrets or full internal stack traces to end users.

Logs may contain a request/correlation ID, error class, safe provider status, and timing information.

---

# 33. File upload rules

Before changing upload behavior, verify current code.

Any production upload flow should explicitly define:

```text
allowed image formats
maximum upload size
validation location
temporary storage behavior
cleanup behavior
whether files persist after request
```

Do not assume the backend filesystem is persistent on cloud hosts.

---

# 34. Render output storage rule

The Agent must identify whether outputs are currently:

```text
base64 responses
remote provider URLs
temporary backend files
persistent files
object storage references
```

Do not design history/download features around a persistent local server filesystem unless the chosen production host guarantees persistence.

If persistence becomes required, treat storage as a separate architectural decision.

---

# 35. Production readiness gates

## Frontend gate

All must be true:

```text
[ ] tests pass
[ ] production build succeeds
[ ] static export succeeds if using GitHub Pages
[ ] /InfraRender base path works
[ ] CSS/JS/assets load
[ ] production API URL is correct
[ ] no secret exists in browser bundle
```

## Backend gate

```text
[ ] tests pass
[ ] startup command works
[ ] /health works
[ ] production CORS is correct
[ ] API key comes from runtime environment
[ ] provider error is handled
[ ] render request works
[ ] no secret appears in logs/response
```

## Integration gate

```text
[ ] browser loads production frontend
[ ] frontend reaches backend over HTTPS
[ ] upload works
[ ] settings serialize correctly
[ ] prompt generation works
[ ] render completes
[ ] output displays
[ ] download works
[ ] reload/new session behaves correctly
[ ] second computer/browser can use the site
```

---

# 36. Definition of done for deployment

Deployment is not complete merely because GitHub Pages shows the UI.

Deployment is complete only when a real user on another machine can:

```text
1. open the production URL
2. upload a supported reference image
3. configure render settings
4. generate/inspect the intended prompt
5. submit render
6. receive a generated image
7. preview the result
8. download the result
9. repeat without local development services running
```

and verification evidence confirms the relevant tests/builds passed.

---

# 37. Common mistakes to prevent

## Mistake: putting OpenAI key in frontend env

Wrong:

```env
NEXT_PUBLIC_OPENAI_API_KEY=...
```

Correct concept:

```text
browser → InfraRender backend → OpenAI
```

## Mistake: assuming GitHub Pages runs FastAPI

GitHub Pages serves frontend/static content only. Deploy FastAPI separately.

## Mistake: forgetting `/InfraRender` base path

Symptoms:

```text
blank page
404 JS chunk
missing CSS
missing icons/images
navigation failures
```

Audit base-path-sensitive references.

## Mistake: changing API field names on only one side

Update frontend + backend + tests + docs together.

## Mistake: marking deployment complete after homepage loads

Perform a real render request.

## Mistake: editing many files without root-cause evidence

Trace the failing layer first.

## Mistake: committing generated files

Keep `node_modules`, virtualenvs, logs, render outputs, caches, and real `.env` files ignored.

---

# 38. Agent request template

Use this when handing InfraRenderAI to a coding Agent:

```text
You are working on InfraRenderAI.

Before modifying code, read:
- the InfraRenderAI production skill
- AGENTS.md
- README.md
- docs/architecture.md
- docs/api-contract.md
- frontend/.env.example
- backend/.env.example

Inspect the actual repository before making assumptions.

Long-term production target:
- frontend accessible from https://hieudang99dd.github.io/InfraRender/
- frontend hosted as a static site on GitHub Pages if the current Next.js app is compatible
- FastAPI deployed separately on a secure Python-capable backend host
- provider/API secrets stored only on the backend runtime

For this task:
1. identify the affected end-to-end flow
2. identify current tests
3. state the smallest coherent change
4. implement using test-first behavior when appropriate
5. run targeted tests
6. run relevant full tests/build
7. inspect git diff
8. report changed files and exact verification evidence

Do not silently change the API contract.
Do not expose secrets.
Do not claim completion without fresh test/build evidence.
```

---

# 39. Phase-specific Agent prompts

## Phase 1 prompt

```text
Audit the repository documentation only. Do not change application behavior.
Create/update AGENTS.md, docs/architecture.md, docs/api-contract.md,
docs/development.md, and docs/deployment.md so they accurately describe the
current repository. Verify every file path and command against the codebase.
Do not invent missing endpoints or environment variables.
```

## Phase 2 prompt

```text
Perform a production-readiness audit of frontend and backend without doing a
large refactor. Test frontend build/static export compatibility, API URL
handling, Pages base-path sensitivity, backend tests/startup, CORS, health
endpoint, provider config and secret handling. Return a prioritized gap list
with exact file paths and verification output.
```

## Phase 3 prompt

```text
Prepare only the frontend for GitHub Pages. Preserve application behavior.
Verify static export compatibility first. Add the minimum Next.js and workflow
changes required for repository path /InfraRender. Run tests and production
build/export and report evidence. Do not change backend behavior in this phase.
```

## Phase 4 prompt

```text
Prepare only the FastAPI backend for secure production hosting. Ensure runtime
environment configuration, health check, CORS, startup behavior and provider
error handling are production-safe. Include Docker containerization via a 
Dockerfile and docker-compose.yml for easy cloud deployment. Use tests first 
for behavior changes. Do not embed secrets and do not change the frontend API contract silently.
```

## Phase 5 prompt

```text
Integrate the deployed frontend and backend. Configure production API base URL,
backend CORS and hosting environment variables. Perform a real browser-to-
backend health request and a real render request. Do not declare success from a
homepage load alone.
```

---

# 40. Decision tree for new requests

```text
New user request
   │
   ├─ UI-only cosmetic change?
   │     → inspect component + styles + UI tests/build
   │
   ├─ New render option?
   │     → trace UI → state → API → schema → prompt → tests
   │
   ├─ Render/provider bug?
   │     → trace backend service/provider boundary first
   │
   ├─ Upload bug?
   │     → trace browser file → request → validation → storage
   │
   ├─ Deployment bug?
   │     → identify frontend build vs Pages vs backend vs CORS vs API URL
   │
   ├─ API contract change?
   │     → coordinate frontend/backend/docs/tests in one migration
   │
   └─ Secret/config change?
         → audit environment flow and Git safety before editing
```

---

# 41. Local machine migration workflow

For another development machine:

```powershell
git clone https://github.com/hieudang99dd/InfraRender.git
cd InfraRender
```

Then install dependencies according to `docs/development.md`.

Typical frontend recovery:

```powershell
cd frontend
npm install
```

Typical backend recovery:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create real local `.env` files from `.env.example` manually and insert secrets locally.

Never expect GitHub to restore ignored secrets.

---

# 42. Public website vs repository URL

Keep these concepts separate:

Repository/source URL:

```text
https://github.com/hieudang99dd/InfraRender
```

Target user-facing website URL:

```text
https://hieudang99dd.github.io/InfraRender/
```

The repository URL is for source/development.
The website URL is for end users after deployment is configured and verified.

---

# 43. Deployment alternatives

Preferred first choice for the BPDF-like experience:

```text
GitHub Pages frontend + separate FastAPI backend
```

Alternative when Next.js static export is unsuitable:

```text
Vercel/Next-compatible frontend hosting + separate FastAPI backend
```

Alternative for a consolidated production environment:

```text
single cloud deployment / reverse proxy hosting frontend and backend
```

Do not force GitHub Pages if the application genuinely requires server-side Next.js runtime behavior. Present evidence and propose the least disruptive supported alternative.

---

# 44. Architectural escalation rule

If three independent fixes are attempted and new failures continue appearing across unrelated layers, stop patching.

Re-evaluate:

```text
frontend/backend coupling
API contract design
state model
provider abstraction
static hosting assumptions
storage assumptions
```

Discuss architectural correction before a fourth patch.

---

# 45. Final Agent checklist

Before beginning:

```text
[ ] Read project instructions
[ ] Confirm repository root
[ ] Confirm current branch
[ ] Confirm working tree status
[ ] Identify affected modules
[ ] Read related tests
[ ] Trace end-to-end flow
```

Before commit:

```text
[ ] Targeted tests pass
[ ] Relevant full tests pass
[ ] Relevant build passes
[ ] No API key/secret in diff
[ ] No generated/cache files staged
[ ] API docs updated if contract changed
[ ] Deployment docs updated if deploy behavior changed
[ ] git diff reviewed
```

Before declaring production success:

```text
[ ] frontend URL opens
[ ] assets load under /InfraRender
[ ] backend health works
[ ] CORS works
[ ] production API URL is correct
[ ] real upload works
[ ] real render request works
[ ] result is visible
[ ] result can be downloaded
[ ] tested from another machine/browser
[ ] no local dev server is required
```

---

# 46. Core principle

InfraRenderAI should evolve through **small, evidence-based, cross-layer-aware changes**.

The Agent's job is not merely to make a screen look correct or make one request pass. The Agent must preserve the entire render workflow, security boundary, API contract, reproducibility, and deployability of the product.

When uncertain:

```text
inspect first
trace the flow
change the smallest coherent unit
test it
build it
review the diff
then report
```

