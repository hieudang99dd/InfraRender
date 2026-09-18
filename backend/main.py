"""HTTP API for reference images and infrastructure visualization prompts."""

import logging
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from schemas import PromptRequest, PromptResponse, RenderRequest, RenderResponse, UploadResponse
from services.image_render import check_render_connection, render_image, render_prompt, render_status
from services.image_upload import read_image, validate_image
from services.prompt_builder import build_render_prompt

VERSION = "0.5.0"
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
PUBLIC_BASE_URL = os.getenv("INFRARENDER_PUBLIC_BASE_URL", "").rstrip("/")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "INFRARENDER_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

logger = logging.getLogger(__name__)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="InfraRender AI Backend",
    description="Prepare prompts and render reference images with a configured image provider.",
    version=VERSION,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")


@app.get("/")
def root() -> dict:
    return {
        "status": "ok",
        "message": "InfraRender AI Backend is running",
        "version": VERSION,
    }


@app.get("/api/health")
def health() -> dict:
    renderer = render_status()
    return {
        "status": "ok",
        "service": "InfraRender AI Backend",
        "version": VERSION,
        "capabilities": {
            "upload": True,
            "prompt_generation": True,
            "image_generation": renderer["configured"],
        },
        "renderer": renderer,
    }


@app.get("/api/render-status")
def get_render_status() -> dict:
    """Report local configuration without sending an API request or exposing secrets."""
    return render_status()


@app.post("/api/render-status/check")
async def verify_render_connection() -> dict:
    """Check model access without generating a billable image or returning secrets."""
    return await check_render_connection()


@app.post("/api/upload-image", response_model=UploadResponse)
async def upload_image(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    """Store a verified JPG, PNG or WEBP reference image, up to 20 MiB."""
    try:
        content = await read_image(file)
        metadata = await run_in_threadpool(
            validate_image, content, file.filename, file.content_type
        )
        saved_name = f"{uuid4().hex}{metadata.extension}"
        save_path = UPLOAD_DIR / saved_name
        try:
            await run_in_threadpool(save_path.write_bytes, content)
        except OSError as exc:
            logger.exception("Failed to save uploaded reference image")
            try:
                save_path.unlink(missing_ok=True)
            except OSError:
                logger.exception("Failed to remove incomplete image upload")
            raise HTTPException(
                status_code=500, detail="Không thể lưu ảnh lên máy chủ."
            ) from exc

        url = (
            f"{PUBLIC_BASE_URL}/uploads/{saved_name}"
            if PUBLIC_BASE_URL
            else str(request.url_for("uploads", path=saved_name))
        )
        return UploadResponse(
            original_name=file.filename or "image",
            saved_name=saved_name,
            size_bytes=len(content),
            size_mb=round(len(content) / (1024 * 1024), 2),
            width=metadata.width,
            height=metadata.height,
            content_type=metadata.content_type,
            url=url,
        )
    finally:
        await file.close()


@app.post("/api/generate-prompt", response_model=PromptResponse)
async def generate_prompt(data: PromptRequest) -> PromptResponse:
    """Build a prompt from the selected settings using Vision AI if an image is provided."""
    image_base64 = None
    mime_type = "image/jpeg"
    if data.reference_image_name:
        image_path = UPLOAD_DIR / data.reference_image_name
        if image_path.is_file():
            try:
                import base64
                content = await run_in_threadpool(image_path.read_bytes)
                image_base64 = base64.b64encode(content).decode("utf-8")
                ext = image_path.suffix.lower()
                if ext == ".png":
                    mime_type = "image/png"
                elif ext == ".webp":
                    mime_type = "image/webp"
            except Exception as e:
                logger.warning(f"Could not read reference image for prompt generation: {e}")
                
    prompt = await build_render_prompt(data, image_base64, mime_type)
    return PromptResponse(prompt=prompt)


@app.post("/api/render-image", response_model=RenderResponse)
async def create_render(
    request: Request,
    data: RenderRequest,
) -> RenderResponse:
    """Render the actual source image using the standardized RenderRequest contract."""
    render_prompt(data.prompt, data.negative_prompt)
        status = render_status()
        if not status["configured"]:
            raise HTTPException(503, status["message"])
            
        image_path = UPLOAD_DIR / data.reference_image_name
        if not image_path.is_file():
            raise HTTPException(404, "Không tìm thấy ảnh tham chiếu trên máy chủ. Vui lòng tải lại ảnh.")
            
        content = await run_in_threadpool(image_path.read_bytes)
        
        # The saved extension is authoritative here; let validate_image detect the MIME type.
        metadata = await run_in_threadpool(
            validate_image, content, data.reference_image_name, None
        )
        result, result_metadata = await render_image(content, metadata, data.prompt, data.negative_prompt)
        name = f"{uuid4().hex}.png"
        save_path = OUTPUT_DIR / name
        try:
            await run_in_threadpool(save_path.write_bytes, result)
        except OSError as exc:
            logger.exception("Failed to save generated image")
            try:
                save_path.unlink(missing_ok=True)
            except OSError:
                logger.exception("Failed to remove incomplete generated image")
            raise HTTPException(500, "Không thể lưu ảnh kết quả trên máy chủ.") from exc
        url = (
            f"{PUBLIC_BASE_URL}/outputs/{name}"
            if PUBLIC_BASE_URL
            else str(request.url_for("outputs", path=name))
        )
        return RenderResponse(
            url=url,
            name=name,
            width=result_metadata.width,
            height=result_metadata.height,
            provider=result_metadata.provider,
            model=result_metadata.model,
        )

@app.delete("/api/files/{directory}/{filename}")
async def delete_file(directory: str, filename: str) -> dict:
    if directory not in {"uploads", "outputs"}:
        raise HTTPException(400, "Thư mục không hợp lệ.")
    
    target_dir = UPLOAD_DIR if directory == "uploads" else OUTPUT_DIR
    file_path = target_dir / filename
    
    try:
        file_path = file_path.resolve()
        if not str(file_path).startswith(str(target_dir.resolve())):
            raise ValueError()
    except (RuntimeError, ValueError):
        raise HTTPException(400, "Đường dẫn file không hợp lệ.")
        
    if not file_path.exists():
        return {"status": "success"}
        
    try:
        file_path.unlink()
        return {"status": "success"}
    except OSError as exc:
        logger.exception(f"Failed to delete file {file_path}")
        raise HTTPException(500, "Không thể xóa file trên máy chủ.") from exc
