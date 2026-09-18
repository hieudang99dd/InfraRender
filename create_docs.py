import os
from pathlib import Path

Path('docs/api-contract.md').write_text("""
# InfraRenderAI API Contract

## Endpoints

### 1. Upload Image
- **Method**: POST
- **Path**: /api/upload-image
- **Content-Type**: multipart/form-data
- **Request Fields**:
  - ile: The image file (JPG, PNG, or WEBP), max 20 MiB.
- **Response**:
`json
{
  "status": "success",
  "message": "...",
  "original_name": "image.jpg",
  "saved_name": "unique_id.jpg",
  "size_bytes": 102400,
  "size_mb": 0.1,
  "width": 1920,
  "height": 1080,
  "content_type": "image/jpeg",
  "url": "/api/files/uploads/unique_id.jpg"
}
`

### 2. Generate Prompt (Optional/Preview)
- **Method**: POST
- **Path**: /api/generate-prompt
- **Content-Type**: pplication/json
- **Request Fields**:
  - PromptRequest schema (includes uildings, weather, creativity, etc.)
- **Response**:
`json
{
  "status": "success",
  "prompt": "Nhiệm vụ: Tạo ảnh phối cảnh..."
}
`

### 3. Render Image
- **Method**: POST
- **Path**: /api/render-image
- **Content-Type**: pplication/json
- **Request Fields**:
`json
{
  "prompt": "...",
  "negative_prompt": "...",
  "reference_image_name": "unique_id.jpg",
  "settings": { },
  "project_name": "Project A"
}
`
- **Response**:
`json
{
  "status": "success",
  "url": "/api/files/outputs/result_id.jpg",
  "name": "result_id.jpg",
  "width": 1920,
  "height": 1080,
  "provider": "OpenAI",
  "model": "gpt-image-2"
}
`

### 4. Delete File
- **Method**: DELETE
- **Path**: /api/files/{directory}/{filename}
- **Response**:
`json
{
  "status": "success",
  "message": "Đã xóa file..."
}
`
""", encoding='utf-8')

Path('docs/development.md').write_text("""
# InfraRenderAI Development

## Prerequisites
- Node.js (latest LTS recommended)
- Python 3.10+
- Git

## Frontend Setup
`ash
cd frontend
npm install
npm run dev
`
Frontend runs on http://localhost:3000

## Backend Setup
`ash
cd backend
python -m venv .venv
# On Windows
.\\.venv\\Scripts\\Activate.ps1
# On Mac/Linux
# source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt # if available
`

Copy .env.example to .env and configure secrets (e.g. OPENAI_API_KEY).
`ash
uvicorn main:app --reload
`
Backend runs on http://127.0.0.1:8000

## Testing
- Backend: pytest backend/tests/ -v
""", encoding='utf-8')

Path('docs/deployment.md').write_text("""
# InfraRenderAI Deployment

## Production Architecture
- **Frontend**: Deployed to GitHub Pages as a static site export under /InfraRender/.
- **Backend**: Deployed to a Python-capable cloud host (e.g. Render, Railway, AWS).

## GitHub Pages Deployment
1. Ensure Next.js is configured for output: export and asePath: '/InfraRender'.
2. Push to main.
3. GitHub Actions rontend-pages.yml workflow will automatically build and deploy the artifact to https://hieudang99dd.github.io/InfraRender/.

## Backend Deployment
1. Deploy the ackend directory to a Python-capable host.
2. Set the following environment variables on the host (DO NOT commit to Git):
   - OPENAI_API_KEY
   - OPENAI_IMAGE_MODEL
   - OPENAI_BASE_URL
   - INFRARENDER_CORS_ORIGINS: Set to https://hieudang99dd.github.io
   - INFRARENDER_PUBLIC_BASE_URL: The URL of the deployed backend.
3. Verify via GET /api/health.

## Rollback
- Frontend: Revert commit and trigger GitHub Pages workflow.
- Backend: Revert to previous deployment on the cloud host.
""", encoding='utf-8')
