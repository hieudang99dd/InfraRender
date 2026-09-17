"""Create consistent visualization prompts from the API's validated settings."""

import os
import json
import logging
import asyncio
import httpx
from schemas import PromptRequest

logger = logging.getLogger(__name__)

SCENE_FIELDS = (
    ("infrastructure", "Hạ tầng"),
    ("roads", "Xử lý mặt đường"),
    ("buildings", "Công trình và kiến trúc"),
    ("buildings_density", "Mật độ công trình"),
    ("vehicles", "Phương tiện và giao thông"),
    ("vehicles_density", "Mật độ phương tiện"),
    ("vegetation", "Cây xanh và cảnh quan"),
    ("vegetation_density", "Mật độ cây xanh"),
    ("weather", "Thời tiết và không khí"),
    ("lighting", "Ánh sáng"),
    ("materials", "Vật liệu và xử lý bề mặt"),
    ("style", "Phong cách hình ảnh"),
    ("camera", "Góc nhìn và bố cục"),
)

DENSITY_VALUES = {
    "none": "không có",
    "sparse": "thưa",
    "moderate": "vừa phải",
    "dense": "dày đặc",
}

PRESET_VALUES = {
    "weather": {
        "sunny weather": "trời nắng",
        "overcast weather": "trời nhiều mây",
        "rainy weather": "trời mưa",
        "sunset": "hoàng hôn",
        "nighttime": "ban đêm",
        "light mist": "sương nhẹ",
    },
    "lighting": {
        "natural daylight": "ánh sáng tự nhiên ban ngày",
        "warm golden-hour sunlight": "nắng ấm trong giờ vàng",
        "soft diffused lighting with gentle shadows": "ánh sáng khuếch tán dịu nhẹ với bóng đổ mềm",
        "cinematic lighting with controlled contrast": "ánh sáng điện ảnh với độ tương phản được kiểm soát",
        "urban street lighting": "ánh sáng đèn đường đô thị",
    },
    "vegetation": {
        "tropical vegetation": "cây xanh nhiệt đới",
        "urban landscape planting": "cây xanh cảnh quan đô thị",
        "grass and ground-cover plants": "thảm cỏ và cây phủ đất",
        "flowering plants and shrubs": "cây hoa và cây bụi",
    },
    "vehicles": {
        "cars": "ô tô",
        "motorcycles": "xe máy",
        "mixed vehicle types": "nhiều loại phương tiện kết hợp",
        "trucks": "xe tải",
    },
    "buildings": {
        "modern architecture": "kiến trúc hiện đại",
        "commercial buildings": "công trình thương mại",
        "residential buildings": "công trình nhà ở",
        "industrial buildings": "công trình công nghiệp",
    },
    "style": {
        "photorealistic visualization": "phối cảnh chân thực như ảnh chụp",
        "clean professional architectural presentation": "trình bày kiến trúc rõ ràng, chuyên nghiệp",
        "cinematic visualization with atmospheric color grading": "phối cảnh điện ảnh với màu sắc thể hiện không khí của cảnh",
        "refined architectural illustration with clear forms": "minh họa kiến trúc tinh tế với hình khối rõ ràng",
    },
    "camera": {
        "preserve the original camera perspective": "giữ nguyên góc nhìn của ảnh gốc",
        "aerial drone perspective showing the complete site": "góc nhìn từ trên cao bao quát toàn bộ khu vực",
        "wide architectural perspective with straight verticals": "góc rộng kiến trúc với các đường đứng thẳng",
        "human eye-level perspective with a natural focal length": "góc nhìn ngang tầm mắt với tiêu cự tự nhiên",
    },
    "buildings_density": DENSITY_VALUES,
    "vehicles_density": DENSITY_VALUES,
    "vegetation_density": DENSITY_VALUES,
}


def sentence(text: str) -> str:
    text = text.strip()
    return text if text.endswith((".", "!", "?")) else f"{text}."


def build_rule_based_prompt(data: PromptRequest) -> str:
    layers = []
    
    # 1. Nhiệm vụ
    layers.append("Nhiệm vụ: Tạo ảnh phối cảnh kiến trúc và hạ tầng dựa trên ảnh tham chiếu.")
    
    # 2. Preservation / Creativity
    preservation = []
    if data.creativity is not None:
        c = data.creativity
        if c <= 20:
            preservation.append("Bảo toàn tuyệt đối hình học, góc nhìn, tỷ lệ công trình và tương quan không gian hiện trạng.")
        elif c <= 50:
            preservation.append("Bảo toàn cấu trúc chính của không gian, cho phép thay đổi vật liệu và cảnh quan có kiểm soát.")
        elif c <= 80:
            preservation.append("Cho phép diễn giải sáng tạo về kiến trúc và cảnh quan, nhưng giữ nguyên cấu trúc mạng lưới giao thông.")
        else:
            preservation.append("Tái diễn giải mạnh mẽ toàn bộ không gian để đạt hiệu quả thẩm mỹ cao nhất, vẫn nhận diện được bối cảnh gốc.")
            
    if data.preserve_geometry is True:
        preservation.append("Bắt buộc giữ nguyên bố trí địa hình và các nút giao.")
    if data.preserve_road_markings is True:
        preservation.append("Bắt buộc giữ nguyên hệ thống vạch kẻ đường hiện trạng.")
    elif data.preserve_road_markings is False:
        preservation.append("Tự do thiết kế lại vạch kẻ đường cho phù hợp.")
    
    if preservation:
        layers.append(f"Mức độ bảo toàn và sáng tạo: {' '.join(preservation)}")

    def get_val(field: str) -> str:
        val = getattr(data, field)
        return PRESET_VALUES.get(field, {}).get(val, val) if val else ""

    # 3. Architecture
    arch = [get_val("infrastructure"), get_val("buildings"), get_val("materials")]
    if b_dens := get_val("buildings_density"):
        arch.append(f"Mật độ công trình: {b_dens}")
    arch = [x for x in arch if x]
    if arch:
        layers.append(f"Kiến trúc và Vật liệu: {', '.join(arch)}.")

    # 4. Roads / Traffic
    traffic = [get_val("roads"), get_val("vehicles")]
    if v_dens := get_val("vehicles_density"):
        traffic.append(f"Mật độ phương tiện: {v_dens}")
    traffic = [x for x in traffic if x]
    if traffic:
        layers.append(f"Giao thông và Mặt đường: {', '.join(traffic)}.")

    # 5. Landscape
    landscape = [get_val("vegetation")]
    if veg_dens := get_val("vegetation_density"):
        landscape.append(f"Mật độ cây xanh: {veg_dens}")
    landscape = [x for x in landscape if x]
    if landscape:
        layers.append(f"Cảnh quan và Cây xanh: {', '.join(landscape)}.")

    # 6. Weather & Lighting
    env = [get_val("weather"), get_val("lighting")]
    env = [x for x in env if x]
    if env:
        layers.append(f"Môi trường và Ánh sáng: {', '.join(env)}.")

    # 7. Camera & Visual Style
    camera_style = [get_val("camera"), get_val("style")]
    camera_style = [x for x in camera_style if x]
    if camera_style:
        layers.append(f"Góc nhìn và Phong cách: {', '.join(camera_style)}.")

    # 8. Custom Keywords
    if data.custom_keywords:
        layers.append(f"Từ khóa bổ sung: {', '.join(data.custom_keywords)}.")

    # 9. Output Intent
    intent = []
    if data.quality and data.quality != "Original":
        intent.append(f"Độ phân giải hướng tới: {data.quality}")
    if data.aspect_ratio and data.aspect_ratio != "Original":
        intent.append(f"Tỷ lệ khung hình: {data.aspect_ratio}")
    if intent:
        layers.append(f"Yêu cầu đầu ra: {', '.join(intent)}.")

    if data.notes:
        layers.append(f"Ghi chú bổ sung: {data.notes}")

    return "\n".join(layers)


async def build_render_prompt(data: PromptRequest, image_base64: str | None = None, mime_type: str = "image/jpeg") -> str:
    """Build a prompt using Vision AI if an image is provided, fallback to rule-based."""
    rule_based_prompt = build_rule_based_prompt(data)
    
    if not image_base64:
        return rule_based_prompt

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
    vision_model = os.getenv("OPENAI_VISION_MODEL", "gpt-4o-mini").strip()

    if not api_key or not base_url:
        return rule_based_prompt

    system_prompt = (
        "Bạn là một chuyên gia kiến trúc, quy hoạch và thiết kế cảnh quan. "
        "Nhiệm vụ của bạn là phân tích bức ảnh được cung cấp (về hạ tầng, đường sá, không gian, vật liệu hiện tại) "
        "và kết hợp với các yêu cầu cài đặt của người dùng để viết ra một câu lệnh (prompt) duy nhất bằng tiếng Việt "
        "để truyền vào AI sinh ảnh (Image Generation AI). "
        "Prompt của bạn phải thật chuyên nghiệp, mô tả chi tiết vật liệu, ánh sáng, góc nhìn, và không gian bối cảnh. "
        "Bạn không được trò chuyện hay giải thích gì thêm, chỉ xuất ra nội dung prompt."
    )

    user_instructions = f"Dưới đây là các thiết lập người dùng đã chọn:\n\n{rule_based_prompt}\n\nHãy phân tích ảnh và sinh ra prompt mô tả chi tiết bối cảnh mới dựa trên những thiết lập này."

    payload = {
        "model": vision_model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": user_instructions
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        "max_tokens": 1000,
        "temperature": 0.7,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            )
            response.raise_for_status()
            result = response.json()
            ai_prompt = result["choices"][0]["message"]["content"].strip()
            if ai_prompt:
                return ai_prompt
    except Exception as exc:
        logger.warning(f"Vision AI prompt generation failed, falling back to rule-based: {exc}")
    
    return rule_based_prompt
