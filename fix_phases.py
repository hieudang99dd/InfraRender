import os

filepath = 'SKILL_InfraRenderAI_Production_Agent.md'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

phase_4_old = """## Phase 4 prompt

```text
Prepare only the FastAPI backend for secure production hosting. Ensure runtime
environment configuration, health check, CORS, startup behavior and provider
error handling are production-safe. Use tests first for behavior changes. Do
not embed secrets and do not change the frontend API contract silently.
```"""

phase_4_new = """## Phase 4 prompt

```text
Prepare only the FastAPI backend for secure production hosting. Ensure runtime
environment configuration, health check, CORS, startup behavior and provider
error handling are production-safe. Include Docker containerization via a 
Dockerfile and docker-compose.yml for easy cloud deployment. Use tests first 
for behavior changes. Do not embed secrets and do not change the frontend API contract silently.
```"""

phase_5_old = """deploy backend
set backend secrets
obtain HTTPS backend URL
configure frontend production API URL
configure production CORS
deploy Pages
verify browser → backend communication"""

phase_5_new = """deploy backend using Docker / docker-compose
set backend secrets in runtime environment
obtain HTTPS backend URL
configure frontend production API URL
configure production CORS
deploy Pages
verify browser → backend communication"""

text = text.replace(phase_4_old, phase_4_new)
text = text.replace(phase_5_old, phase_5_new)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
