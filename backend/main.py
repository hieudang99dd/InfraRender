"""InfraRender API with durable project storage and a separate static frontend."""
import asyncio
import hmac
import logging
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from schemas import CleanupRequest, ProjectRequest, PromptRequest, PromptResponse, RenderRequest, RenderResponse, UploadResponse
from services.image_render import check_render_connection, render_image, render_prompt, render_status
from services.image_upload import read_image, validate_image
from services.project_store import ProjectStore, safe_media_path
from services.prompt_engine import generate_prompt as create_prompt

VERSION = "0.6.0"
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
# Preserve existing local images; production sets a mounted persistent volume.
DATA_DIR = Path(os.getenv("INFRARENDER_DATA_DIR", str(BASE_DIR))).resolve()
UPLOAD_DIR, OUTPUT_DIR = DATA_DIR / "uploads", DATA_DIR / "outputs"
PUBLIC_BASE_URL = os.getenv("INFRARENDER_PUBLIC_BASE_URL", "").rstrip("/")
CORS_ORIGINS = [v.strip() for v in os.getenv("INFRARENDER_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if v.strip()]
logger = logging.getLogger(__name__)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
store = ProjectStore(DATA_DIR / "projects.sqlite3", UPLOAD_DIR, OUTPUT_DIR, retention_days=int(os.getenv("INFRARENDER_RETENTION_DAYS", "30")))
store.initialize()
provider_slots = asyncio.Semaphore(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("INFRARENDER_ENV") == "production":
        if len(os.getenv("INFRARENDER_ACCESS_TOKEN", "")) < 32:
            raise RuntimeError("Production requires INFRARENDER_ACCESS_TOKEN with at least 32 characters.")
        if not PUBLIC_BASE_URL.startswith("https://") or not CORS_ORIGINS or "*" in CORS_ORIGINS:
            raise RuntimeError("Production requires an HTTPS public backend URL and explicit CORS origins.")
    async def retain_files():
        while True:
            await asyncio.sleep(86400)
            try:
                await run_in_threadpool(store.cleanup, False)
            except Exception:
                logger.exception("Retention sweep failed")
    task = asyncio.create_task(retain_files())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="InfraRender AI Backend", version=VERSION, lifespan=lifespan)


@app.middleware("http")
async def api_access(request: Request, call_next):
    public = {"/", "/health", "/api/health", "/api/render-status"}
    if request.url.path.startswith("/api/") and request.url.path not in public and request.method != "OPTIONS":
        token = os.getenv("INFRARENDER_ACCESS_TOKEN", "")
        supplied = request.headers.get("Authorization", "")
        if token and not hmac.compare_digest(supplied.encode(), f"Bearer {token}".encode()):
            return JSONResponse({"detail": "Cần mã truy cập ứng dụng hợp lệ."}, status_code=401)
    if request.headers.get("content-type", "").startswith("application/json"):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 4 * 1024 * 1024:
                return JSONResponse({"detail": "Dữ liệu dự án vượt quá 4 MiB."}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "Authorization"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")


@app.get("/")
def root():
    return {"status": "ok", "service": "InfraRender AI Backend", "version": VERSION}


@app.get("/health")
@app.get("/api/health")
def health():
    renderer = render_status()
    return {"status": "ok", "service": "InfraRender AI Backend", "version": VERSION,
            "authentication_required": bool(os.getenv("INFRARENDER_ACCESS_TOKEN")),
            "capabilities": {"upload": True, "prompt_generation": True, "projects": True,
                             "image_generation": renderer.get("state") == "rendered"}, "renderer": renderer}


@app.get("/api/render-status")
def get_render_status():
    return render_status()


@app.post("/api/render-status/check")
async def verify_render_connection():
    return await check_render_connection()


def media_url(request: Request, directory: str, name: str):
    return f"{PUBLIC_BASE_URL}/{directory}/{name}" if PUBLIC_BASE_URL else str(request.url_for(directory, path=name))


async def write_media(path: Path, content: bytes):
    try:
        await run_in_threadpool(path.write_bytes, content)
    except OSError as exc:
        with suppress(OSError):
            path.unlink(missing_ok=True)
        logger.error("Media write failed")
        raise HTTPException(500, "Không thể lưu ảnh trên máy chủ.") from exc


@app.post("/api/upload-image", response_model=UploadResponse)
async def upload_image(request: Request, file: UploadFile = File(...)):
    try:
        content = await read_image(file)
        metadata = await run_in_threadpool(validate_image, content, file.filename, file.content_type)
        name = f"{uuid4().hex}{metadata.extension}"
        await write_media(UPLOAD_DIR / name, content)
        return UploadResponse(original_name=file.filename or "image", saved_name=name, size_bytes=len(content),
                              size_mb=round(len(content) / 1048576, 2), width=metadata.width, height=metadata.height,
                              content_type=metadata.content_type, url=media_url(request, "uploads", name))
    finally:
        await file.close()


async def read_reference(name: str):
    path = safe_media_path(UPLOAD_DIR, name)
    if not path.is_file():
        raise HTTPException(404, "Không tìm thấy ảnh gốc. Vui lòng tải lại ảnh.")
    if path.stat().st_size > 20 * 1024 * 1024:
        raise HTTPException(413, "Ảnh gốc vượt quá 20 MiB.")
    content = await run_in_threadpool(path.read_bytes)
    metadata = await run_in_threadpool(validate_image, content, name, None)
    return content, metadata


@app.post("/api/generate-prompt", response_model=PromptResponse)
async def generate_prompt(data: PromptRequest):
    content, mime_type = None, "image/png"
    if data.mode == "vision":
        if not data.reference_image_name:
            raise HTTPException(422, "Chọn ảnh gốc trước khi phân tích ảnh bằng AI.")
        content, metadata = await read_reference(data.reference_image_name)
        mime_type = metadata.content_type
    if data.mode == "template":
        return await create_prompt(data)
    if provider_slots.locked():
        raise HTTPException(429, "Máy chủ đang xử lý yêu cầu AI. Hãy thử lại sau.")
    async with provider_slots:
        return await create_prompt(data, content, mime_type)


@app.post("/api/render-image", response_model=RenderResponse)
async def create_render(request: Request, data: RenderRequest):
    render_prompt(data.prompt, data.negative_prompt)
    if not render_status()["configured"]:
        raise HTTPException(503, render_status()["message"])
    if provider_slots.locked():
        raise HTTPException(429, "Máy chủ đang dựng ảnh. Hãy thử lại sau.")
    async with provider_slots:
        content, metadata = await read_reference(data.reference_image_name)
        result, result_metadata, provider_name, model_name, details = await render_image(content, metadata, data.prompt, data.negative_prompt, data.settings)
        name = f"{uuid4().hex}.png"
        await write_media(OUTPUT_DIR / name, result)
    return RenderResponse(url=media_url(request, "outputs", name), name=name, width=result_metadata.width,
                          height=result_metadata.height, provider=provider_name, model=model_name, details=details)


@app.get("/api/projects")
def list_projects():
    return {"projects": store.list()}


@app.post("/api/projects", status_code=201)
def create_project(data: ProjectRequest):
    return store.create(data.name, data.workspace)


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    return store.get(project_id)


@app.put("/api/projects/{project_id}")
def update_project(project_id: str, data: ProjectRequest):
    if data.revision is None:
        raise HTTPException(422, "Thiếu phiên bản dự án để kiểm tra xung đột.")
    return store.update(project_id, data.name, data.workspace, data.revision)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    return store.delete(project_id)


@app.delete("/api/files/{directory}/{filename}")
def delete_file(directory: str, filename: str):
    return store.delete_file(directory, filename)


@app.get("/api/storage")
def storage_status():
    return store.stats()


@app.post("/api/storage/cleanup")
def cleanup_storage(data: CleanupRequest):
    return store.cleanup(data.dry_run)
