"""Shared, validated API request and response contracts."""

from typing import Annotated, Literal
from unicodedata import normalize

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, field_validator


def normalize_custom_keyword(value: object) -> object:
    return " ".join(normalize("NFC", value).split()) if isinstance(value, str) else value


CustomKeyword = Annotated[
    str,
    StringConstraints(strict=True, max_length=120),
    BeforeValidator(normalize_custom_keyword),
]

PromptText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
AspectRatio = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        pattern=r"^(Original|[1-9][0-9]{0,3}:[1-9][0-9]{0,3})$",
    ),
]


class PromptRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    infrastructure: PromptText = ""
    roads: PromptText = ""
    buildings: PromptText = ""
    buildings_density: PromptText | None = None
    vehicles: PromptText = ""
    vehicles_density: PromptText | None = None
    vegetation: PromptText = ""
    vegetation_density: PromptText | None = None
    weather: PromptText = ""
    lighting: PromptText = ""
    materials: PromptText = ""
    camera: PromptText = ""
    style: PromptText = ""
    notes: Annotated[str, StringConstraints(max_length=5000)] = ""
    custom_keywords: list[CustomKeyword] = Field(default_factory=list, max_length=20)
    reference_image_name: str | None = None
    preserve_geometry: bool | None = None
    preserve_road_markings: bool | None = None
    creativity: int | None = Field(default=None, ge=0, le=100, strict=True)
    quality: Literal["Original", "1K", "2K", "4K", "8K"] | None = None
    aspect_ratio: AspectRatio | None = None

    @field_validator("custom_keywords")
    @classmethod
    def remove_empty_and_duplicate_keywords(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        keywords: list[str] = []
        for keyword in value:
            key = keyword.lower()
            if keyword and key not in seen:
                seen.add(key)
                keywords.append(keyword)
        return keywords

    @field_validator("quality", "aspect_ratio", mode="before")
    @classmethod
    def empty_output_setting_is_unset(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value


class RenderRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    prompt: Annotated[str, StringConstraints(strip_whitespace=True, max_length=28000, min_length=1)]
    negative_prompt: Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)] = ""
    reference_image_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    settings: PromptRequest
    project_name: Annotated[str, StringConstraints(max_length=200)] = "Dự án hạ tầng mới"


class PromptResponse(BaseModel):
    status: Literal["success"] = "success"
    prompt: str


class RenderResponse(BaseModel):
    status: Literal["success"] = "success"
    url: str
    name: str
    width: int
    height: int
    provider: str
    model: str


class UploadResponse(BaseModel):
    status: Literal["success"] = "success"
    message: str = "Tải ảnh lên thành công."
    original_name: str
    saved_name: str
    size_bytes: int
    size_mb: float
    width: int
    height: int
    content_type: str
    url: str
