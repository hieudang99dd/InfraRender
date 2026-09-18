import os

filepath = 'SKILL_InfraRenderAI_Production_Agent.md'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

docker_section = """
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
"""

text = text.replace("# 17. Hosting strategy", docker_section + "\n# 17. Hosting strategy")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
