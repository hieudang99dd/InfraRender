"""Backend API smoke tests for the current v0.5 contract."""

import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

import main


def image_bytes(fmt: str = "PNG") -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (8, 6), (120, 140, 160)).save(buffer, format=fmt)
    return buffer.getvalue()


class BackendApiTests(unittest.TestCase):
    def setUp(self):
        self.uploads = tempfile.TemporaryDirectory()
        self.outputs = tempfile.TemporaryDirectory()
        self.addCleanup(self.uploads.cleanup)
        self.addCleanup(self.outputs.cleanup)

        self.upload_patch = patch.object(main, "UPLOAD_DIR", Path(self.uploads.name))
        self.output_patch = patch.object(main, "OUTPUT_DIR", Path(self.outputs.name))
        self.public_patch = patch.object(main, "PUBLIC_BASE_URL", "")
        self.upload_patch.start()
        self.output_patch.start()
        self.public_patch.start()
        self.addCleanup(self.upload_patch.stop)
        self.addCleanup(self.output_patch.stop)
        self.addCleanup(self.public_patch.stop)

        self.client = TestClient(main.app, base_url="http://testserver")
        self.addCleanup(self.client.close)

    def test_health_is_available_without_render_key(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False):
            response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertTrue(payload["capabilities"]["upload"])
        self.assertTrue(payload["capabilities"]["prompt_generation"])
        self.assertFalse(payload["capabilities"]["image_generation"])

    def test_upload_accepts_valid_png_and_uses_server_generated_name(self):
        response = self.client.post(
            "/api/upload-image",
            files={"file": ("reference.png", image_bytes(), "image/png")},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["width"], 8)
        self.assertEqual(payload["height"], 6)
        self.assertRegex(payload["saved_name"], r"^[a-f0-9]{32}\.png$")
        self.assertTrue((Path(self.uploads.name) / payload["saved_name"]).is_file())

    def test_upload_rejects_disguised_or_corrupt_image(self):
        response = self.client.post(
            "/api/upload-image",
            files={"file": ("fake.png", b"not-an-image", "image/png")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(list(Path(self.uploads.name).iterdir()), [])

    def test_prompt_generation_falls_back_to_rule_based_without_api_key(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False):
            response = self.client.post(
                "/api/generate-prompt",
                json={
                    "buildings": "residential buildings",
                    "buildings_density": "sparse",
                    "vehicles": "cars",
                    "vehicles_density": "sparse",
                    "vegetation": "flowering plants and shrubs",
                    "weather": "sunny weather",
                    "lighting": "soft diffused lighting with gentle shadows",
                    "style": "cinematic visualization with atmospheric color grading",
                },
            )
        self.assertEqual(response.status_code, 200, response.text)
        prompt = response.json()["prompt"]
        for expected in (
            "Nhiệm vụ:",
            "công trình nhà ở",
            "Mật độ công trình: thưa",
            "ô tô",
            "trời nắng",
            "ánh sáng khuếch tán dịu nhẹ",
            "phối cảnh điện ảnh",
        ):
            self.assertIn(expected, prompt)

    def test_invalid_prompt_settings_return_validation_error(self):
        response = self.client.post(
            "/api/generate-prompt",
            json={"creativity": 101, "quality": "16K"},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
