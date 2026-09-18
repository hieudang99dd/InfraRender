"""Render a reference image using the configured ImageProvider."""

from fastapi import HTTPException
from services.image_upload import ImageMetadata
from services.providers.openai_provider import OpenAIImageProvider
from schemas import PromptRequest
from services.output_dimensions import plan_output, process_output
from fastapi.concurrency import run_in_threadpool

# Create a singleton instance of the provider
# In the future, this could be resolved based on user config
provider = OpenAIImageProvider()

def render_status() -> dict:
    return provider.get_status()

async def check_render_connection() -> dict:
    return await provider.check_connection()

def render_prompt(prompt: str, negative_prompt: str) -> str:
    """Validate prompt length."""
    if not prompt.strip() or len(prompt) > 28_000:
        raise HTTPException(422, "Prompt cần có nội dung và không vượt quá 28.000 ký tự.")
    if len(negative_prompt) > 4_000:
        raise HTTPException(422, "Yêu cầu loại trừ không được vượt quá 4.000 ký tự.")
    combined = f"{prompt}\n\nAvoid: {negative_prompt}" if negative_prompt.strip() else prompt
    if len(combined) > 32_000:
        raise HTTPException(422, "Tổng prompt và yêu cầu loại trừ không được vượt quá 32.000 ký tự.")
    return combined

async def render_image(
    image: bytes,
    metadata: ImageMetadata,
    prompt: str,
    negative_prompt: str,
    settings: PromptRequest | None = None,
):
    settings = settings or PromptRequest()
    plan = plan_output(metadata, settings.quality, settings.aspect_ratio, provider.get_status()["model"])
    content, native_meta, provider_name, model = await provider.render_image(image, metadata, prompt, negative_prompt, size=plan.provider_size)
    content, final_meta, details = await run_in_threadpool(process_output, content, native_meta, plan)
    if len(content) > 32 * 1024 * 1024:
        raise HTTPException(502, "Ảnh đầu ra vượt quá 32 MiB. Chọn độ phân giải nhỏ hơn.")
    return content, final_meta, provider_name, model, details
