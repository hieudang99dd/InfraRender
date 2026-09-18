"""Render endpoint tests for the current JSON upload-then-render workflow."""

import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from PIL import Image

import main


def image_bytes(fmt: str = "PNG") -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (8, 6), (80, 100, 120)).save(buffer, format=fmt)
    return buffer.getvalue()


class RenderApiTests(unittest.TestCase):
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

        self.reference_name = f"{'a' * 32}.png"
        (Path(self.uploads.name) / self.reference_name).write_bytes(image_bytes())
        self.client = TestClient(main.app, base_url="http://testserver")
        self.addCleanup(self.client.close)

    def payload(self, **overrides):
        payload = {
            "prompt": "Create a refined architectural visualization.",
            "negative_prompt": "No billboards.",
            "reference_image_name": self.reference_name,
            "settings": {},
            "project_name": "Test project",
        }
        payload.update(overrides)
        return payload

    def test_render_uses_saved_reference_and_returns_provider_metadata(self):
        fake_result = image_bytes()
        fake_meta = SimpleNamespace(
            width=8,
            height=6,
            provider="OpenAI Images",
            model="gpt-image-2",
        )
        with (
            patch.object(
                main,
                "render_status",
                return_value={
                    "configured": True,
                    "provider": "OpenAI Images",
                    "state": "connected",
                    "message": "Kết nối thành công.",
                },
            ),
            patch.object(
                main,
                "render_image",
                new=AsyncMock(return_value=(fake_result, fake_meta)),
            ) as renderer,
        ):
            response = self.client.post("/api/render-image", json=self.payload())

        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["provider"], "OpenAI Images")
        self.assertEqual(result["model"], "gpt-image-2")
        self.assertEqual((result["width"], result["height"]), (8, 6))
        self.assertTrue((Path(self.outputs.name) / result["name"]).is_file())

        args = renderer.await_args.args
        self.assertEqual(args[0], image_bytes())
        self.assertEqual(args[2], self.payload()["prompt"])
        self.assertEqual(args[3], self.payload()["negative_prompt"])

    def test_render_accepts_png_reference_without_forcing_jpeg_mime(self):
        fake_meta = SimpleNamespace(
            width=8,
            height=6,
            provider="OpenAI Images",
            model="gpt-image-2",
        )
        renderer = AsyncMock(return_value=(image_bytes(), fake_meta))
        with (
            patch.object(main, "render_status", return_value={"configured": True, "message": "ok"}),
            patch.object(main, "render_image", new=renderer),
        ):
            response = self.client.post("/api/render-image", json=self.payload())
        self.assertEqual(response.status_code, 200, response.text)
        metadata = renderer.await_args.args[1]
        self.assertEqual(metadata.content_type, "image/png")
        self.assertEqual(metadata.extension, ".png")

    def test_render_requires_configured_provider(self):
        with patch.object(
            main,
            "render_status",
            return_value={"configured": False, "message": "Chưa cấu hình dịch vụ render."},
        ):
            response = self.client.post("/api/render-image", json=self.payload())
        self.assertEqual(response.status_code, 503)
        self.assertIn("Chưa cấu hình", response.json()["detail"])

    def test_render_rejects_missing_reference(self):
        with patch.object(
            main,
            "render_status",
            return_value={"configured": True, "message": "ok"},
        ):
            response = self.client.post(
                "/api/render-image",
                json=self.payload(reference_image_name=f"{'b' * 32}.png"),
            )
        self.assertEqual(response.status_code, 404)

    def test_delete_output_file_is_idempotent(self):
        name = f"{'c' * 32}.png"
        path = Path(self.outputs.name) / name
        path.write_bytes(image_bytes())

        first = self.client.delete(f"/api/files/outputs/{name}")
        second = self.client.delete(f"/api/files/outputs/{name}")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
