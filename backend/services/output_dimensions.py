"""Plan supported provider dimensions and report any local output resampling.

GPT Image size constraints are documented at:
https://developers.openai.com/api/reference/resources/images/methods/edit
The user's resolution denotes the output's long edge, independent of provider quality.
"""

from dataclasses import dataclass
from io import BytesIO
from math import floor, log, sqrt
import re

from fastapi import HTTPException
from PIL import Image, ImageOps

from services.image_upload import ImageMetadata, MAX_IMAGE_PIXELS

QUALITY_EDGES = {"1K": 1024, "2K": 2560, "4K": 3840, "8K": 7680}
MIN_PROVIDER_PIXELS = 655_360
MAX_PROVIDER_PIXELS = 8_294_400
MAX_PROVIDER_EDGE = 3840


@dataclass(frozen=True)
class OutputPlan:
    width: int
    height: int
    provider_size: str
    experimental: bool = False


def _dimensions_are_valid(width: int, height: int) -> bool:
    return (
        isinstance(width, int) and not isinstance(width, bool)
        and isinstance(height, int) and not isinstance(height, bool)
        and width > 0 and height > 0 and width * height <= MAX_IMAGE_PIXELS
    )


def _flexible_provider_size(width: int, height: int) -> tuple[int, int]:
    """Choose the closest supported grid size while prioritizing the scene's ratio."""
    ratio = width / height
    scale = min(1.0, MAX_PROVIDER_EDGE / max(width, height), sqrt(MAX_PROVIDER_PIXELS / (width * height)))
    scale = max(scale, sqrt(MIN_PROVIDER_PIXELS / (width * height)))
    desired_width, desired_height = width * scale, height * scale
    candidates: list[tuple[float, int, int]] = []
    for provider_width in range(16, MAX_PROVIDER_EDGE + 1, 16):
        height_units = floor(provider_width / ratio / 16)
        for provider_height in (height_units * 16, (height_units + 1) * 16):
            if not 16 <= provider_height <= MAX_PROVIDER_EDGE:
                continue
            if not MIN_PROVIDER_PIXELS <= provider_width * provider_height <= MAX_PROVIDER_PIXELS:
                continue
            if max(provider_width, provider_height) > min(provider_width, provider_height) * 3:
                continue
            distance = abs(log(provider_width / desired_width)) + abs(log(provider_height / desired_height))
            aspect_error = abs(log((provider_width / provider_height) / ratio))
            candidates.append((distance + 5 * aspect_error, provider_width, provider_height))
    # There are always valid grid sizes for the accepted 1:3..3:1 ratios.
    _, provider_width, provider_height = min(candidates)
    return provider_width, provider_height


def plan_output(
    metadata: ImageMetadata,
    quality: str | None = "Original",
    aspect_ratio: str | None = "Original",
    model: str = "gpt-image-2",
) -> OutputPlan:
    """Validate settings before any paid request, then plan final and API sizes."""
    if not _dimensions_are_valid(metadata.width, metadata.height):
        raise HTTPException(422, "Kích thước ảnh gốc không hợp lệ hoặc vượt quá 40 triệu điểm ảnh.")
    quality = quality or "Original"
    aspect_ratio = aspect_ratio or "Original"
    if quality != "Original" and quality not in QUALITY_EDGES:
        raise HTTPException(422, "Độ phân giải phải là Original, 1K, 2K, 4K hoặc 8K.")
    if aspect_ratio == "Original":
        ratio_width, ratio_height = metadata.width, metadata.height
    elif isinstance(aspect_ratio, str) and re.fullmatch(r"[1-9][0-9]{0,3}:[1-9][0-9]{0,3}", aspect_ratio):
        ratio_width, ratio_height = map(int, aspect_ratio.split(":"))
    else:
        raise HTTPException(422, "Tỷ lệ ảnh phải có dạng chiều rộng:chiều cao, ví dụ 16:9.")
    if max(ratio_width, ratio_height) > min(ratio_width, ratio_height) * 3:
        raise HTTPException(422, "Tỷ lệ ảnh hỗ trợ từ 1:3 đến 3:1. Hãy chọn tỷ lệ khác.")

    long_edge = max(metadata.width, metadata.height) if quality == "Original" else QUALITY_EDGES[quality]
    if ratio_width >= ratio_height:
        width, height = long_edge, max(1, round(long_edge * ratio_height / ratio_width))
    else:
        width, height = max(1, round(long_edge * ratio_width / ratio_height)), long_edge
    if not _dimensions_are_valid(width, height):
        raise HTTPException(422, "Ảnh đầu ra vượt quá 40 triệu điểm ảnh. Giảm độ phân giải hoặc đổi tỷ lệ ảnh.")

    flexible = model == "gpt-image-2" or model.startswith(("gpt-image-2-", "gpt-image-2.5-"))
    if flexible:
        provider_width, provider_height = _flexible_provider_size(width, height)
    elif width == height:
        provider_width, provider_height = 1024, 1024
    elif width > height:
        provider_width, provider_height = 1536, 1024
    else:
        provider_width, provider_height = 1024, 1536
    return OutputPlan(
        width=width, height=height,
        provider_size=f"{provider_width}x{provider_height}",
        experimental=flexible and provider_width * provider_height > 2560 * 1440,
    )


def process_output(
    content: bytes,
    metadata: ImageMetadata,
    plan: OutputPlan,
) -> tuple[bytes, ImageMetadata, dict]:
    """Center-crop and resample only when needed; never claim resampling is native."""
    if not _dimensions_are_valid(plan.width, plan.height) or not _dimensions_are_valid(metadata.width, metadata.height):
        raise HTTPException(422, "Kích thước ảnh đầu ra không hợp lệ hoặc vượt quá 40 triệu điểm ảnh.")
    scale = max(plan.width / metadata.width, plan.height / metadata.height)
    cropped = metadata.width * plan.height != metadata.height * plan.width
    resized = abs(scale - 1) > 1e-9
    processing = "cropped_and_resized" if cropped and resized else "cropped" if cropped else "resized" if resized else "native"
    details = {
        "requested_size": f"{plan.width}x{plan.height}",
        "provider_size": plan.provider_size,
        "native_size": f"{metadata.width}x{metadata.height}",
        "final_size": f"{plan.width}x{plan.height}",
        "upscaled": scale > 1 + 1e-9,
        "cropped": cropped,
        "processing": processing,
        "experimental": plan.experimental,
    }
    if processing == "native":
        return content, metadata, details
    with Image.open(BytesIO(content)) as source:
        # ImageOps.fit keeps proportions and center-crops, avoiding geometric stretch.
        output = ImageOps.fit(source, (plan.width, plan.height), method=Image.Resampling.LANCZOS)
        try:
            buffer = BytesIO()
            output.save(buffer, format="PNG")
            result = buffer.getvalue()
        finally:
            output.close()
    return result, ImageMetadata(plan.width, plan.height, "image/png", ".png"), details
