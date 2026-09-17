"""Bounded upload reads and validation of the actual image contents."""

import warnings
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
READ_CHUNK_BYTES = 1024 * 1024
IMAGE_FORMATS = {
    "JPEG": ({".jpg", ".jpeg"}, "image/jpeg", ".jpg"),
    "PNG": ({".png"}, "image/png", ".png"),
    "WEBP": ({".webp"}, "image/webp", ".webp"),
}
ALLOWED_EXTENSIONS = {extension for entry in IMAGE_FORMATS.values() for extension in entry[0]}
ALLOWED_CONTENT_TYPES = {entry[1] for entry in IMAGE_FORMATS.values()}


@dataclass(frozen=True)
class ImageMetadata:
    width: int
    height: int
    content_type: str
    extension: str


async def read_image(file: UploadFile) -> bytes:
    """Read at most the size limit plus one byte, even for unknown-length streams."""
    if Path(file.filename or "").suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh JPG, JPEG, PNG và WEBP.")
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, "Định dạng file không hợp lệ.")

    content = bytearray()
    while chunk := await file.read(min(READ_CHUNK_BYTES, MAX_IMAGE_BYTES - len(content) + 1)):
        content.extend(chunk)
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Ảnh không được lớn hơn 20 MB.")
    if not content:
        raise HTTPException(400, "File ảnh trống.")
    return bytes(content)


def validate_image(content: bytes, filename: str | None, content_type: str | None) -> ImageMetadata:
    """Reject disguised, corrupt and excessively large images before storing them."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                image_format = source.format
                width, height = source.size
                if width * height > MAX_IMAGE_PIXELS:
                    raise HTTPException(400, "Ảnh không được vượt quá 40 triệu điểm ảnh.")
                if image_format not in IMAGE_FORMATS:
                    raise HTTPException(400, "Chỉ hỗ trợ ảnh JPG, JPEG, PNG và WEBP.")
                source.verify()
            # Some decoders only detect truncated data while loading pixel data.
            with Image.open(BytesIO(content)) as source:
                source.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(400, "Kích thước ảnh vượt quá giới hạn cho phép.") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise HTTPException(400, "File ảnh bị hỏng hoặc không phải ảnh hợp lệ.") from exc

    extensions, detected_type, saved_extension = IMAGE_FORMATS[image_format]
    if Path(filename or "").suffix.lower() not in extensions:
        raise HTTPException(400, "Phần mở rộng không khớp với nội dung ảnh.")
    if content_type and content_type != detected_type:
        raise HTTPException(400, "Định dạng khai báo không khớp với nội dung ảnh.")
    return ImageMetadata(width, height, detected_type, saved_extension)
