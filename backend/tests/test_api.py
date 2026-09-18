"""API contract tests using real image bytes and an isolated upload directory."""

import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unicodedata import normalize
from unittest.mock import patch

from fastapi import HTTPException, Request, UploadFile
from fastapi.testclient import TestClient
from PIL import Image
from starlette.datastructures import Headers

import main
from services import image_upload


def image_bytes(image_format: str = "PNG") -> bytes:
    with BytesIO() as buffer:
        with Image.new("RGB", (8, 6), color=(55, 99, 140)) as image:
            image.save(buffer, format=image_format)
        return buffer.getvalue()


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        configuration_patch = patch.dict(os.environ, {"OPENAI_API_KEY": ""})
        configuration_patch.start()
        self.addCleanup(configuration_patch.stop)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.upload_dir = Path(temporary.name)
        upload_patch = patch.object(main, "UPLOAD_DIR", self.upload_dir)
        upload_patch.start()
        self.addCleanup(upload_patch.stop)
        public_url_patch = patch.object(main, "PUBLIC_BASE_URL", "")
        public_url_patch.start()
        self.addCleanup(public_url_patch.stop)
        self.client = TestClient(main.app, base_url="https://images.example.test")
        self.addCleanup(self.client.close)

    def upload(self, content: bytes, filename: str = "reference.png", content_type: str = "image/png"):
        return self.client.post(
            "/api/upload-image", files={"file": (filename, content, content_type)}
        )

    def test_health_reports_only_available_capabilities(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["capabilities"]["upload"])
        self.assertTrue(result["capabilities"]["prompt_generation"])
        self.assertFalse(result["capabilities"]["image_generation"])
        self.assertFalse(result["renderer"]["configured"])
        self.assertFalse(result["renderer"]["ready"])

    def test_legacy_prompt_fields_only_add_the_explicit_context(self):
        response = self.client.post("/api/generate-prompt", json={
            "infrastructure": "  urban interchange  ",
            "roads": "asphalt roads",
            "buildings": "modern offices",
            "vehicles": "light traffic",
            "vegetation": "tropical trees",
            "weather": "clear skies",
            "lighting": "golden hour",
            "materials": "concrete and steel",
            "style": "architectural photography",
            "notes": "Keep the pedestrian bridge.",
        })
        self.assertEqual(response.status_code, 200)
        prompt = response.json()["prompt"]
        for fragment in (
            "urban interchange", "asphalt roads",
            "modern offices", "light traffic", "tropical trees", "clear skies",
            "golden hour", "concrete and steel", "architectural photography",
            "Keep the pedestrian bridge.",
        ):
            self.assertIn(fragment, prompt)
        self.assertNotIn("bridge..", prompt)
        for omitted in (
            "Bắt buộc giữ nguyên", "Mức độ bảo toàn và sáng tạo", "Độ phân giải hướng tới",
            "Tỷ lệ khung hình", "góc nhìn từ trên cao", "chân thực như ảnh chụp",
        ):
            self.assertNotIn(omitted, prompt)

    def test_a_single_scene_choice_does_not_add_unselected_settings(self):
        response = self.client.post("/api/generate-prompt", json={"weather": "night sky"})
        self.assertEqual(response.status_code, 200)
        prompt = response.json()["prompt"]
        self.assertIn("night sky", prompt)
        for omitted in ("Kiến trúc và Vật liệu:", "Giao thông và Mặt đường:", "Cảnh quan và Cây xanh:", "Mức độ bảo toàn", "Yêu cầu đầu ra:"):
            self.assertNotIn(omitted, prompt)

    def test_combined_known_presets_generate_a_complete_vietnamese_prompt(self):
        response = self.client.post("/api/generate-prompt", json={
            "weather": "sunny weather",
            "lighting": "warm golden-hour sunlight",
            "buildings": "modern architecture",
            "buildings_density": "moderate",
            "vehicles": "mixed vehicle types",
            "vehicles_density": "none",
            "vegetation": "grass and ground-cover plants",
            "vegetation_density": "dense",
            "style": "photorealistic visualization",
            "camera": "aerial drone perspective showing the complete site",
            "preserve_geometry": True,
            "preserve_road_markings": False,
            "creativity": 25,
            "quality": "Original",
            "aspect_ratio": "16:9",
            "custom_keywords": ["phố ven sông", "đèn lồng"],
            "notes": "Giữ nguyên cây cầu.",
        })
        self.assertEqual(response.status_code, 200, response.text)
        prompt = response.json()["prompt"]
        for fragment in (
            "trời nắng", "nắng ấm trong giờ vàng", "kiến trúc hiện đại", "Mật độ công trình: vừa phải",
            "nhiều loại phương tiện kết hợp", "Mật độ phương tiện: không có", "thảm cỏ và cây phủ đất",
            "Mật độ cây xanh: dày đặc", "phối cảnh chân thực như ảnh chụp", "góc nhìn từ trên cao bao quát toàn bộ khu vực",
            "giữ nguyên bố trí địa hình và các nút giao", "thiết kế lại vạch kẻ đường", "Tỷ lệ khung hình: 16:9",
            "phố ven sông", "đèn lồng", "Giữ nguyên cây cầu.",
        ):
            self.assertIn(fragment, prompt)
        for untranslated in ("sunny weather", "modern architecture", "golden-hour", "photorealistic", "grass and ground-cover"):
            self.assertNotIn(untranslated, prompt)
        self.assertEqual(response.json()["mode"], "template")
        self.assertIsNone(response.json()["model"])

    def test_user_text_keeps_its_language_and_is_not_partially_translated(self):
        response = self.client.post("/api/generate-prompt", json={
            "weather": "sunny weather beside golden dunes",
            "materials": "tropical vegetation",
            "custom_keywords": ["sunny weather", "Original", "Keep signage: bus lane"],
            "notes": "Use warm golden-hour sunlight. Keep the label 'Original'.",
        })
        self.assertEqual(response.status_code, 200, response.text)
        prompt = response.json()["prompt"]
        for fragment in ("sunny weather beside golden dunes", "tropical vegetation", "sunny weather, Original, Keep signage: bus lane", "Use warm golden-hour sunlight. Keep the label 'Original'."):
            self.assertIn(fragment, prompt)
        self.assertNotIn("cây xanh nhiệt đới", prompt)

    def test_custom_context_supports_arbitrary_phrases_and_normalizes_vietnamese(self):
        response = self.client.post("/api/generate-prompt", json={
            "custom_keywords": [
                "  phố cổ   Hội An  ", "đèn lồng, cầu gỗ", "  ",
                normalize("NFD", "PHỐ CỔ HỘI AN"), "🌳 vườn trên mái",
            ],
        })
        self.assertEqual(response.status_code, 200, response.text)
        prompt = response.json()["prompt"]
        self.assertIn("phố cổ Hội An", prompt)
        self.assertIn("đèn lồng, cầu gỗ", prompt)
        self.assertIn("🌳 vườn trên mái", prompt)
        self.assertEqual(prompt.lower().count("phố cổ hội an"), 1)
        self.assertEqual(normalize("NFC", prompt), prompt)

    def test_custom_context_and_existing_choices_are_independent(self):
        response = self.client.post("/api/generate-prompt", json={
            "weather": "light mist",
            "custom_keywords": ["chợ nổi miền Tây"],
            "notes": "Giữ lối đi bộ.",
            "preserve_geometry": False,
            "creativity": 0,
        })
        self.assertEqual(response.status_code, 200, response.text)
        prompt = response.json()["prompt"]
        for fragment in (
            "sương nhẹ", "chợ nổi miền Tây", "Giữ lối đi bộ.",
        ):
            self.assertIn(fragment, prompt)
        self.assertNotIn("ánh sáng tự nhiên", prompt)
        self.assertNotIn("Bắt buộc giữ nguyên bố trí địa hình", prompt)
        self.assertIn("Cho phép điều chỉnh có chủ đích hình học", prompt)
        self.assertIn("Mức sáng tạo: 0/100", prompt)
        self.assertNotIn("Bảo toàn tuyệt đối", prompt)

    def test_custom_context_accepts_keyword_count_and_unicode_length_boundaries(self):
        for keywords in (
            [f"ý tưởng {index}" for index in range(20)],
            ["🌳" * 120],
            [normalize("NFD", "ế" * 120)],
        ):
            with self.subTest(keywords=keywords):
                response = self.client.post("/api/generate-prompt", json={
                    "custom_keywords": keywords,
                })
                self.assertEqual(response.status_code, 200, response.text)
                for keyword in keywords:
                    self.assertIn(normalize("NFC", keyword), response.json()["prompt"])

    def test_invalid_custom_context_is_rejected_with_validation_errors(self):
        for keywords in (
            "phố cổ", None, {"keyword": "phố cổ"}, [42], [True], [None], [["phố cổ"]],
            ["x" * 121], ["🌳" * 121], [f"ý tưởng {index}" for index in range(21)],
        ):
            with self.subTest(keywords=str(keywords)[:80]):
                response = self.client.post("/api/generate-prompt", json={
                    "custom_keywords": keywords,
                })
                self.assertEqual(response.status_code, 422, response.text)

    def test_density_can_be_selected_without_an_object_type(self):
        for field, label in (
            ("buildings_density", "Mật độ công trình"),
            ("vehicles_density", "Mật độ phương tiện"),
            ("vegetation_density", "Mật độ cây xanh"),
        ):
            with self.subTest(field=field):
                response = self.client.post("/api/generate-prompt", json={field: "  sparse  "})
                self.assertEqual(response.status_code, 200)
                prompt = response.json()["prompt"]
                self.assertIn(f"{label}: thưa", prompt)
                for unselected in ("kiến trúc hiện đại", "ô tô", "cây xanh nhiệt đới"):
                    self.assertNotIn(unselected, prompt)

    def test_density_and_object_type_are_independent_explicit_choices(self):
        response = self.client.post("/api/generate-prompt", json={
            "buildings": "modern offices", "buildings_density": "low",
            "vehicles": "buses", "vehicles_density": "none",
            "vegetation": "tropical trees", "vegetation_density": "dense",
        })
        self.assertEqual(response.status_code, 200)
        prompt = response.json()["prompt"]
        for fragment in (
            "modern offices", "Mật độ công trình: low",
            "buses", "Mật độ phương tiện: không có",
            "tropical trees", "Mật độ cây xanh: dày đặc",
        ):
            self.assertIn(fragment, prompt)

    def test_explicit_preservation_and_zero_creativity_are_not_treated_as_unset(self):
        response = self.client.post("/api/generate-prompt", json={
            "preserve_geometry": True, "preserve_road_markings": True, "creativity": 0,
        })
        self.assertEqual(response.status_code, 200)
        prompt = response.json()["prompt"]
        self.assertIn("Bắt buộc giữ nguyên bố trí địa hình và các nút giao", prompt)
        self.assertIn("Bắt buộc giữ nguyên hệ thống vạch kẻ đường", prompt)
        self.assertIn("Ưu tiên bám sát hình học", prompt)
        self.assertIn("Mức sáng tạo: 0/100", prompt)
        self.assertNotIn("Bảo toàn tuyệt đối", prompt)
        self.assertNotIn("Góc nhìn", prompt)
        self.assertNotIn("Độ phân giải đầu ra", prompt)

    def test_disabled_preservation_and_custom_camera_are_respected(self):
        response = self.client.post("/api/generate-prompt", json={
            "preserve_geometry": False,
            "preserve_road_markings": False,
            "creativity": 90,
            "camera": "street-level wide-angle view",
            "quality": "4K",
            "aspect_ratio": "4:3",
        })
        self.assertEqual(response.status_code, 200)
        prompt = response.json()["prompt"]
        self.assertIn("Tái diễn giải mạnh mẽ", prompt)
        self.assertIn("thiết kế lại vạch kẻ đường", prompt)
        self.assertIn("street-level wide-angle view", prompt)
        self.assertIn("Độ phân giải hướng tới: 4K", prompt)
        self.assertIn("Tỷ lệ khung hình: 4:3", prompt)
        self.assertNotIn("Bắt buộc giữ nguyên", prompt)
        self.assertNotIn("Giữ nguyên hình dạng đường", prompt)
        self.assertNotIn("giữ nguyên góc nhìn", prompt)

    def test_original_output_settings_retain_reference_properties(self):
        response = self.client.post("/api/generate-prompt", json={
            "quality": "Original", "aspect_ratio": "Original"
        })
        self.assertEqual(response.status_code, 200)
        prompt = response.json()["prompt"]
        self.assertIn("ảnh tham chiếu", prompt)
        self.assertNotIn("Độ phân giải hướng tới:", prompt)
        self.assertNotIn("Tỷ lệ khung hình:", prompt)

    def test_invalid_prompt_settings_return_validation_errors(self):
        for payload in (
            {"creativity": -1}, {"creativity": 101}, {"creativity": 1.5},
            {"creativity": True}, {"quality": "16K"}, {"aspect_ratio": "0:9"},
            {"aspect_ratio": "invalid"}, {"notes": "x" * 5001},
        ):
            with self.subTest(payload=str(payload)[:80]):
                response = self.client.post("/api/generate-prompt", json=payload)
                self.assertEqual(response.status_code, 422)


class UploadLifecycleTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def request() -> Request:
        return Request({
            "type": "http", "method": "POST", "path": "/api/upload-image",
            "headers": [], "scheme": "http", "server": ("testserver", 80),
            "root_path": "", "query_string": b"", "router": main.app.router,
        })

    @staticmethod
    def upload(content: bytes, filename: str = "reference.png") -> UploadFile:
        return UploadFile(
            file=BytesIO(content), filename=filename,
            headers=Headers({"content-type": "image/png"}),
        )

    async def test_file_is_closed_on_header_and_image_validation_errors(self):
        for filename, content in (("invalid.svg", b"invalid"), ("invalid.png", b"invalid")):
            with self.subTest(filename=filename):
                upload = self.upload(content, filename)
                with self.assertRaises(HTTPException):
                    await main.upload_image(self.request(), upload)
                self.assertTrue(upload.file.closed)

    async def test_file_is_closed_on_success_and_storage_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(main, "UPLOAD_DIR", Path(directory)):
                upload = self.upload(image_bytes())
                await main.upload_image(self.request(), upload)
                self.assertTrue(upload.file.closed)
                upload = self.upload(image_bytes())
                with patch.object(Path, "write_bytes", side_effect=OSError("Disk unavailable")):
                    with self.assertLogs("main", level="ERROR"):
                        with self.assertRaises(HTTPException) as caught:
                            await main.upload_image(self.request(), upload)
                self.assertEqual(caught.exception.status_code, 500)
                self.assertTrue(upload.file.closed)

    async def test_size_limit_stops_reading_at_limit_plus_one_and_closes_file(self):
        upload = self.upload(b"a" * 128)
        read_sizes = []
        bytes_read = 0
        original_read = upload.read

        async def tracked_read(size: int = -1) -> bytes:
            nonlocal bytes_read
            read_sizes.append(size)
            chunk = await original_read(size)
            bytes_read += len(chunk)
            return chunk

        upload.read = tracked_read
        with patch.object(image_upload, "MAX_IMAGE_BYTES", 32):
            with self.assertRaises(HTTPException) as caught:
                await main.upload_image(self.request(), upload)
        self.assertEqual(caught.exception.status_code, 413)
        self.assertEqual(bytes_read, 33)
        self.assertTrue(all(0 < size <= image_upload.READ_CHUNK_BYTES for size in read_sizes))
        self.assertTrue(upload.file.closed)


if __name__ == "__main__":
    unittest.main()

