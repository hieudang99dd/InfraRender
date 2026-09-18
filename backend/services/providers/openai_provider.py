import asyncio
import base64
import binascii
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from time import monotonic
from urllib.parse import quote, urlsplit

import httpx
from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

from services.image_upload import ImageMetadata, validate_image
from services.config import env_or_file
from services.providers.base import ImageProvider

RENDER_TIMEOUT_SECONDS = 180
MAX_RENDER_BYTES = 32 * 1024 * 1024
MAX_PROVIDER_RESPONSE_BYTES = ((MAX_RENDER_BYTES + 2) // 3) * 4 + 1024 * 1024
PROVIDER_NAME = "OpenAI Images"
CONNECTION_TIMEOUT_SECONDS = 15
CONNECTION_STATUS_TTL_SECONDS = 300
MAX_MODEL_RESPONSE_BYTES = 64 * 1024


@dataclass(frozen=True)
class RenderConfig:
    api_key: str = field(repr=False)
    model: str = "gpt-image-2"
    base_url: str = "https://api.openai.com/v1"

    @property
    def configured(self) -> bool:
        return self.configuration_issue is None

    @property
    def configuration_issue(self) -> tuple[str, str] | None:
        if not self.api_key or self.api_key.lower() in {
            "your_api_key", "your_api_key_here", "your_openai_api_key",
            "your_openai_api_key_here", "your-api-key", "your-api-key-here",
            "sk-your-api-key", "sk-your-api-key-here", "replace-me", "changeme",
        }:
            return (
                "missing_key",
                "Hệ thống đã kết nối. Chưa có API key tạo ảnh. Điền OPENAI_API_KEY trong backend/.env rồi khởi động lại backend.",
            )
        if not self.api_key.isascii() or any(char.isspace() or ord(char) < 33 or ord(char) == 127 for char in self.api_key):
            return "invalid_config", "OPENAI_API_KEY không hợp lệ."
        if (
            not self.model or len(self.model) > 256 or not self.model.isascii()
            or any(char.isspace() or ord(char) < 33 or ord(char) == 127 for char in self.model)
            or self.model in {".", ".."}
        ):
            return "invalid_config", "OPENAI_IMAGE_MODEL chưa hợp lệ."
        try:
            parsed = urlsplit(self.base_url)
            valid_url = bool(
                parsed.hostname
                and parsed.scheme in {"http", "https"}
                and not (parsed.username or parsed.password or parsed.query or parsed.fragment)
                and not any(char.isspace() or ord(char) < 33 for char in self.base_url)
            )
            valid_url = valid_url and (parsed.port is None or 0 < parsed.port <= 65535)
            if valid_url:
                httpx.URL(self.base_url)
        except ValueError:
            valid_url = False
        except httpx.InvalidURL:
            valid_url = False
        if not valid_url:
            return "invalid_config", "OPENAI_BASE_URL chưa hợp lệ."
        return None

def _provider_connection_issue(status_code: int) -> tuple[str, str]:
    if status_code in {401, 403}:
        return "unauthorized", "Dịch vụ từ chối quyền truy cập."
    if status_code == 404:
        return "model_unavailable", "Không tìm thấy model hoặc đường dẫn kiểm tra model."
    if status_code == 429:
        return "rate_limited", "Dịch vụ đang giới hạn yêu cầu."
    return "provider_error", "Dịch vụ chưa phản hồi hợp lệ."

def provider_error(status_code: int) -> HTTPException:
    if status_code in {401, 403}:
        return HTTPException(502, "Dịch vụ tạo ảnh từ chối quyền truy cập.")
    if status_code == 429:
        return HTTPException(429, "Dịch vụ tạo ảnh đang giới hạn yêu cầu.")
    if status_code == 404:
        return HTTPException(502, "Không tìm thấy model hoặc API tạo ảnh.")
    if status_code in {400, 422}:
        return HTTPException(400, "Dịch vụ tạo ảnh không chấp nhận yêu cầu. Kiểm tra ảnh, nội dung prompt.")
    return HTTPException(502, "Dịch vụ tạo ảnh chưa trả về kết quả.")

def decode_render(body: bytes) -> tuple[bytes, ImageMetadata]:
    try:
        payload = json.loads(body)
        encoded = payload["data"][0]["b64_json"]
        if not isinstance(encoded, str) or not encoded:
            raise ValueError("Missing image data")
        if len(encoded) > ((MAX_RENDER_BYTES + 2) // 3) * 4:
            raise ValueError("Image exceeds size limit")
        content = base64.b64decode(encoded, validate=True)
        if not content or len(content) > MAX_RENDER_BYTES:
            raise ValueError("Invalid image size")
        metadata = validate_image(content, "render.png", "image/png")
    except (ValueError, TypeError, KeyError, IndexError, binascii.Error, HTTPException) as exc:
        raise HTTPException(502, "Dịch vụ trả về ảnh không hợp lệ hoặc vượt quá giới hạn cho phép.") from exc
    return content, metadata

class OpenAIImageProvider(ImageProvider):
    def __init__(self):
        self._last_connection_status = None

    def _get_config(self) -> RenderConfig:
        return RenderConfig(
            api_key=env_or_file("OPENAI_API_KEY"),
            model=os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2").strip(),
            base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/"),
        )
        
    def _status(self, config: RenderConfig, state: str, message: str, checked_at: str | None = None) -> dict:
        return {
            "configured": config.configured,
            "provider": PROVIDER_NAME,
            "model": config.model,
            "ready": state == "rendered",
            "verification_kind": "render" if state == "rendered" else "model" if state == "connected" else None,
            "state": state,
            "message": message,
            "checked_at": checked_at,
        }

    def _record_status(self, config: RenderConfig, state: str, message: str) -> dict:
        status = self._status(config, state, message, datetime.now(timezone.utc).isoformat())
        self._last_connection_status = (config, monotonic(), status)
        return dict(status)

    def get_status(self) -> dict:
        config = self._get_config()
        if issue := config.configuration_issue:
            return self._status(config, *issue)
        snapshot = self._last_connection_status
        if snapshot and snapshot[0] == config and monotonic() - snapshot[1] < CONNECTION_STATUS_TTL_SECONDS:
            return dict(snapshot[2])
        return self._status(config, "unverified", "Chưa xác minh kết nối.")

    async def check_connection(self) -> dict:
        config = self._get_config()
        if issue := config.configuration_issue:
            return self._status(config, *issue)
        try:
            async with asyncio.timeout(CONNECTION_TIMEOUT_SECONDS):
                async with httpx.AsyncClient(timeout=httpx.Timeout(CONNECTION_TIMEOUT_SECONDS, connect=5)) as client:
                    async with client.stream(
                        "GET", f"{config.base_url}/models/{quote(config.model, safe='')}",
                        headers={"Authorization": f"Bearer {config.api_key}"},
                    ) as response:
                        if not response.is_success:
                            return self._record_status(config, *_provider_connection_issue(response.status_code))
                        body = bytearray()
                        async for chunk in response.aiter_bytes(chunk_size=16 * 1024):
                            body.extend(chunk)
                            if len(body) > MAX_MODEL_RESPONSE_BYTES:
                                raise ValueError("Oversized response")
                        payload = json.loads(body)
                        if not isinstance(payload, dict) or payload.get("id") != config.model:
                            raise ValueError("Invalid model")
            return self._record_status(config, "connected", "Đã xác minh quyền truy cập model. Chưa kiểm chứng bằng một lần render.")
        except (TimeoutError, httpx.TimeoutException):
            return self._record_status(config, "timeout", "Kiểm tra model quá thời gian. Hãy thử lại.")
        except (httpx.RequestError, ValueError, TypeError):
            return self._record_status(config, "provider_error", "Không thể xác minh model với dịch vụ.")

    async def render_image(self, image_content: bytes, metadata: ImageMetadata, prompt: str, negative_prompt: str, size: str = "auto"):
        config = self._get_config()
        if not config.configured:
            raise HTTPException(503, self.get_status()["message"])
            
        combined_prompt = f"{prompt}\n\nAvoid: {negative_prompt}" if negative_prompt.strip() else prompt
            
        try:
            async with asyncio.timeout(RENDER_TIMEOUT_SECONDS):
                async with httpx.AsyncClient(timeout=httpx.Timeout(RENDER_TIMEOUT_SECONDS, connect=15)) as client:
                    async with client.stream(
                        "POST", f"{config.base_url}/images/edits",
                        headers={"Authorization": f"Bearer {config.api_key}"},
                        data={"model": config.model, "prompt": combined_prompt, "n": "1", "output_format": "png", "size": size},
                        files={"image[]": (f"reference{metadata.extension}", image_content, metadata.content_type)},
                    ) as response:
                        if not response.is_success:
                            if response.status_code not in {400, 422}:
                                self._record_status(config, *_provider_connection_issue(response.status_code))
                            raise provider_error(response.status_code)
                        body = bytearray()
                        async for chunk in response.aiter_bytes(chunk_size=64 * 1024):
                            body.extend(chunk)
                            if len(body) > MAX_PROVIDER_RESPONSE_BYTES:
                                raise HTTPException(502, "Kết quả vượt quá giới hạn.")
            content, result_meta = await run_in_threadpool(decode_render, bytes(body))
            self._record_status(config, "rendered", "Render engine đã tạo ảnh thành công.")
            return content, result_meta, PROVIDER_NAME, config.model
        except (asyncio.TimeoutError, httpx.TimeoutException):
            self._record_status(config, "timeout", "Dựng ảnh quá thời gian. Kiểm tra trước khi gửi lại để tránh phát sinh phí trùng.")
            raise HTTPException(504, "Quá thời gian.")
        except httpx.RequestError:
            self._record_status(config, "provider_error", "Không thể kết nối dịch vụ tạo ảnh.")
            raise HTTPException(502, "Lỗi kết nối.")
