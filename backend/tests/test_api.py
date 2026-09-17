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
        self.assertEqual(response.json()["capabilities"], {
            "upload": True, "prompt_generation": True, "image_generation": False
        })

    def test_all_supported_formats_have_verified_metadata_and_request_based_urls(self):
        for image_format, extension, content_type in (
            ("JPEG", ".jpeg", "image/jpeg"),
            ("PNG", ".png", "image/png"),
            ("WEBP", ".webp", "image/webp"),
        ):
            with self.subTest(image_format=image_format):
                content = image_bytes(image_format)
                response = self.upload(content, f"reference{extension}", content_type)
                self.assertEqual(response.status_code, 200, response.text)
                data = response.json()
                self.assertEqual((data["width"], data["height"]), (8, 6))
                self.assertEqual(data["content_type"], content_type)
                self.assertEqual(data["size_bytes"], len(content))
                self.assertEqual(data["original_name"], f"reference{extension}")
                self.assertEqual((self.upload_dir / data["saved_name"]).read_bytes(), content)
                self.assertEqual(
                    data["url"], f"https://images.example.test/uploads/{data['saved_name']}"
                )

    def test_public_base_url_overrides_request_host(self):
        with patch.object(main, "PUBLIC_BASE_URL", "https://cdn.example.test/infra"):
            response = self.upload(image_bytes())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["url"].startswith("https://cdn.example.test/infra/uploads/"))

    def test_original_filename_cannot_control_saved_path(self):
        response = self.upload(image_bytes(), "../../reference.png")
        self.assertEqual(response.status_code, 200)
        self.assertRegex(response.json()["saved_name"], r"^[a-f0-9]{32}\.png$")
        self.assertEqual(len(list(self.upload_dir.iterdir())), 1)

    def test_invalid_empty_and_disguised_files_are_not_stored(self):
        cases = (
            (b"", "empty.png", "image/png"),
            (b"not an image", "fake.png", "image/png"),
            (image_bytes(), "wrong.jpg", "image/jpeg"),
            (image_bytes(), "wrong.png", "image/jpeg"),
            (image_bytes(), "wrong.svg", "image/svg+xml"),
            (image_bytes("GIF"), "fake.png", "image/png"),
            (image_bytes("JPEG")[:-15], "truncated.jpg", "image/jpeg"),
        )
        for content, filename, content_type in cases:
            with self.subTest(filename=filename):
                response = self.upload(content, filename, content_type)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertIn("detail", response.json())
        self.assertEqual(list(self.upload_dir.iterdir()), [])

    def test_oversized_upload_returns_413_and_saves_nothing(self):
        with patch.object(image_upload, "MAX_IMAGE_BYTES", 32):
            response = self.upload(b"a" * 128)
        self.assertEqual(response.status_code, 413)
        self.assertEqual(list(self.upload_dir.iterdir()), [])

    def test_excessive_pixel_count_is_rejected(self):
        with patch.object(image_upload, "MAX_IMAGE_PIXELS", 40):
            response = self.upload(image_bytes())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(list(self.upload_dir.iterdir()), [])

    def test_unset_prompt_settings_add_no_automatic_context(self):
        for payload in ({}, {
            "preserve_geometry": None,
            "preserve_road_markings": None,
            "creativity": None,
            "quality": None,
            "aspect_ratio": None,
        }, {
            "camera": "  ", "lighting": "", "quality": "", "aspect_ratio": "  ",
            "buildings_density": None, "vehicles_density": "", "vegetation_density": "  ",
        }, {
            "custom_keywords": [],
        }, {
            "custom_keywords": ["", "  ", "\n\t"],
        }):
            with self.subTest(payload=payload):
                response = self.client.post("/api/generate-prompt", json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(
                    response.json()["prompt"],
                    "Táº¡o áº£nh phá»‘i cáº£nh dá»±a trÃªn áº£nh tham chiáº¿u Ä‘Æ°á»£c cung cáº¥p.",
                )

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
            "Háº¡ táº§ng: urban interchange.", "Xá»­ lÃ½ máº·t Ä‘Æ°á»ng: asphalt roads.",
            "modern offices", "light traffic", "tropical trees", "clear skies",
            "golden hour", "concrete and steel", "architectural photography",
            "Keep the pedestrian bridge.",
        ):
            self.assertIn(fragment, prompt)
        self.assertNotIn("bridge..", prompt)
        for omitted in (
            "Giá»¯ nguyÃªn", "Má»©c sÃ¡ng táº¡o", "Äá»™ phÃ¢n giáº£i Ä‘áº§u ra",
            "Tá»· lá»‡ khung hÃ¬nh", "GÃ³c nhÃ¬n vÃ  bá»‘ cá»¥c", "chÃ¢n thá»±c nhÆ° áº£nh chá»¥p",
        ):
            self.assertNotIn(omitted, prompt)

    def test_a_single_scene_choice_does_not_add_unselected_settings(self):
        response = self.client.post("/api/generate-prompt", json={"weather": "night sky"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prompt"],
            "Táº¡o áº£nh phá»‘i cáº£nh dá»±a trÃªn áº£nh tham chiáº¿u Ä‘Æ°á»£c cung cáº¥p. "
            "Thá»i tiáº¿t vÃ  khÃ´ng khÃ­: night sky.")

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
            "custom_keywords": ["phá»‘ ven sÃ´ng", "Ä‘Ã¨n lá»“ng"],
            "notes": "Giá»¯ nguyÃªn cÃ¢y cáº§u.",
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["prompt"], " ".join([
            "Táº¡o áº£nh phá»‘i cáº£nh dá»±a trÃªn áº£nh tham chiáº¿u Ä‘Æ°á»£c cung cáº¥p.",
            "Giá»¯ nguyÃªn hÃ¬nh dáº¡ng Ä‘Æ°á»ng, cÃ¡c nÃºt giao, bá»‘ trÃ­ Ä‘á»‹a hÃ¬nh vÃ  tÆ°Æ¡ng quan khÃ´ng gian chÃ­nh cá»§a áº£nh gá»‘c.",
            "Cho phÃ©p thiáº¿t káº¿ láº¡i váº¡ch káº» Ä‘Æ°á»ng Ä‘á»ƒ phÃ¹ há»£p vá»›i bá»‘ trÃ­ Ä‘Æ°á»ng Ä‘á» xuáº¥t.",
            "CÃ´ng trÃ¬nh vÃ  kiáº¿n trÃºc: kiáº¿n trÃºc hiá»‡n Ä‘áº¡i.",
            "Máº­t Ä‘á»™ cÃ´ng trÃ¬nh: vá»«a pháº£i.",
            "PhÆ°Æ¡ng tiá»‡n vÃ  giao thÃ´ng: nhiá»u loáº¡i phÆ°Æ¡ng tiá»‡n káº¿t há»£p.",
            "Máº­t Ä‘á»™ phÆ°Æ¡ng tiá»‡n: khÃ´ng cÃ³.",
            "CÃ¢y xanh vÃ  cáº£nh quan: tháº£m cá» vÃ  cÃ¢y phá»§ Ä‘áº¥t.",
            "Máº­t Ä‘á»™ cÃ¢y xanh: dÃ y Ä‘áº·c.",
            "Thá»i tiáº¿t vÃ  khÃ´ng khÃ­: trá»i náº¯ng.",
            "Ãnh sÃ¡ng: náº¯ng áº¥m trong giá» vÃ ng.",
            "Phong cÃ¡ch hÃ¬nh áº£nh: phá»‘i cáº£nh chÃ¢n thá»±c nhÆ° áº£nh chá»¥p.",
            "GÃ³c nhÃ¬n vÃ  bá»‘ cá»¥c: gÃ³c nhÃ¬n tá»« trÃªn cao bao quÃ¡t toÃ n bá»™ khu vá»±c.",
            "Bá»‘i cáº£nh tÃ¹y chá»‰nh: phá»‘ ven sÃ´ng; Ä‘Ã¨n lá»“ng.",
            "Má»©c sÃ¡ng táº¡o: 25/100.",
            "Äá»™ phÃ¢n giáº£i Ä‘áº§u ra: giá»¯ nguyÃªn Ä‘á»™ phÃ¢n giáº£i cá»§a áº£nh tham chiáº¿u.",
            "Tá»· lá»‡ khung hÃ¬nh mong muá»‘n: 16:9.",
            "YÃªu cáº§u bá»• sung: Giá»¯ nguyÃªn cÃ¢y cáº§u.",
        ]))

    def test_user_text_keeps_its_language_and_is_not_partially_translated(self):
        response = self.client.post("/api/generate-prompt", json={
            "weather": "sunny weather beside golden dunes",
            "materials": "tropical vegetation",
            "custom_keywords": ["sunny weather", "Original", "Keep signage: bus lane"],
            "notes": "Use warm golden-hour sunlight. Keep the label 'Original'.",
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["prompt"], " ".join([
            "Táº¡o áº£nh phá»‘i cáº£nh dá»±a trÃªn áº£nh tham chiáº¿u Ä‘Æ°á»£c cung cáº¥p.",
            "Thá»i tiáº¿t vÃ  khÃ´ng khÃ­: sunny weather beside golden dunes.",
            "Váº­t liá»‡u vÃ  xá»­ lÃ½ bá» máº·t: tropical vegetation.",
            "Bá»‘i cáº£nh tÃ¹y chá»‰nh: sunny weather; Original; Keep signage: bus lane.",
            "YÃªu cáº§u bá»• sung: Use warm golden-hour sunlight. Keep the label 'Original'.",
        ]))

    def test_custom_context_supports_arbitrary_phrases_and_normalizes_vietnamese(self):
        response = self.client.post("/api/generate-prompt", json={
            "custom_keywords": [
                "  phá»‘ cá»•   Há»™i An  ", "Ä‘Ã¨n lá»“ng, cáº§u gá»—", "  ",
                normalize("NFD", "PHá» Cá»” Há»˜I AN"), "ðŸŒ³ vÆ°á»n trÃªn mÃ¡i",
            ],
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["prompt"],
            "Táº¡o áº£nh phá»‘i cáº£nh dá»±a trÃªn áº£nh tham chiáº¿u Ä‘Æ°á»£c cung cáº¥p. "
            "Bá»‘i cáº£nh tÃ¹y chá»‰nh: phá»‘ cá»• Há»™i An; Ä‘Ã¨n lá»“ng, cáº§u gá»—; ðŸŒ³ vÆ°á»n trÃªn mÃ¡i.")

    def test_custom_context_and_existing_choices_are_independent(self):
        response = self.client.post("/api/generate-prompt", json={
            "weather": "light mist",
            "custom_keywords": ["chá»£ ná»•i miá»n TÃ¢y"],
            "notes": "Giá»¯ lá»‘i Ä‘i bá»™.",
            "preserve_geometry": False,
            "creativity": 0,
        })
        self.assertEqual(response.status_code, 200, response.text)
        prompt = response.json()["prompt"]
        for fragment in (
            "Thá»i tiáº¿t vÃ  khÃ´ng khÃ­: sÆ°Æ¡ng nháº¹.", "Bá»‘i cáº£nh tÃ¹y chá»‰nh: chá»£ ná»•i miá»n TÃ¢y.",
            "YÃªu cáº§u bá»• sung: Giá»¯ lá»‘i Ä‘i bá»™.", "Cho phÃ©p Ä‘iá»u chá»‰nh cÃ³ chá»§ Ä‘Ã­ch",
            "Má»©c sÃ¡ng táº¡o: 0/100.",
        ):
            self.assertIn(fragment, prompt)
        self.assertNotIn("Ãnh sÃ¡ng:", prompt)

    def test_custom_context_accepts_keyword_count_and_unicode_length_boundaries(self):
        for keywords in (
            [f"Ã½ tÆ°á»Ÿng {index}" for index in range(20)],
            ["ðŸŒ³" * 120],
            [normalize("NFD", "áº¿" * 120)],
        ):
            with self.subTest(keywords=keywords):
                response = self.client.post("/api/generate-prompt", json={
                    "custom_keywords": keywords,
                })
                self.assertEqual(response.status_code, 200, response.text)

    def test_invalid_custom_context_is_rejected_with_validation_errors(self):
        for keywords in (
            "phá»‘ cá»•", None, {"keyword": "phá»‘ cá»•"}, [42], [True], [None], [["phá»‘ cá»•"]],
            ["x" * 121], ["ðŸŒ³" * 121], [f"Ã½ tÆ°á»Ÿng {index}" for index in range(21)],
        ):
            with self.subTest(keywords=str(keywords)[:80]):
                response = self.client.post("/api/generate-prompt", json={
                    "custom_keywords": keywords,
                })
                self.assertEqual(response.status_code, 422, response.text)

    def test_density_can_be_selected_without_an_object_type(self):
        for field, label in (
            ("buildings_density", "Máº­t Ä‘á»™ cÃ´ng trÃ¬nh"),
            ("vehicles_density", "Máº­t Ä‘á»™ phÆ°Æ¡ng tiá»‡n"),
            ("vegetation_density", "Máº­t Ä‘á»™ cÃ¢y xanh"),
        ):
            with self.subTest(field=field):
                response = self.client.post("/api/generate-prompt", json={field: "  sparse  "})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["prompt"],
                    "Táº¡o áº£nh phá»‘i cáº£nh dá»±a trÃªn áº£nh tham chiáº¿u Ä‘Æ°á»£c cung cáº¥p. "
                    f"{label}: thÆ°a.")

    def test_density_and_object_type_are_independent_explicit_choices(self):
        response = self.client.post("/api/generate-prompt", json={
            "buildings": "modern offices", "buildings_density": "low",
            "vehicles": "buses", "vehicles_density": "none",
            "vegetation": "tropical trees", "vegetation_density": "dense",
        })
        self.assertEqual(response.status_code, 200)
        prompt = response.json()["prompt"]
        for fragment in (
            "CÃ´ng trÃ¬nh vÃ  kiáº¿n trÃºc: modern offices.", "Máº­t Ä‘á»™ cÃ´ng trÃ¬nh: low.",
            "PhÆ°Æ¡ng tiá»‡n vÃ  giao thÃ´ng: buses.", "Máº­t Ä‘á»™ phÆ°Æ¡ng tiá»‡n: khÃ´ng cÃ³.",
            "CÃ¢y xanh vÃ  cáº£nh quan: tropical trees.", "Máº­t Ä‘á»™ cÃ¢y xanh: dÃ y Ä‘áº·c.",
        ):
            self.assertIn(fragment, prompt)

    def test_explicit_preservation_and_zero_creativity_are_not_treated_as_unset(self):
        response = self.client.post("/api/generate-prompt", json={
            "preserve_geometry": True, "preserve_road_markings": True, "creativity": 0,
        })
        self.assertEqual(response.status_code, 200)
        prompt = response.json()["prompt"]
        self.assertIn("Giá»¯ nguyÃªn hÃ¬nh dáº¡ng Ä‘Æ°á»ng", prompt)
        self.assertIn("Giá»¯ nguyÃªn há»‡ thá»‘ng váº¡ch káº» lÃ n Ä‘Æ°á»ng", prompt)
        self.assertIn("Má»©c sÃ¡ng táº¡o: 0/100.", prompt)
        self.assertNotIn("GÃ³c nhÃ¬n", prompt)
        self.assertNotIn("Äá»™ phÃ¢n giáº£i Ä‘áº§u ra", prompt)

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
        self.assertIn("Cho phÃ©p Ä‘iá»u chá»‰nh cÃ³ chá»§ Ä‘Ã­ch", prompt)
        self.assertIn("Cho phÃ©p thiáº¿t káº¿ láº¡i váº¡ch káº» Ä‘Æ°á»ng", prompt)
        self.assertIn("Má»©c sÃ¡ng táº¡o: 90/100", prompt)
        self.assertIn("GÃ³c nhÃ¬n vÃ  bá»‘ cá»¥c: street-level wide-angle view.", prompt)
        self.assertIn("Äá»™ phÃ¢n giáº£i Ä‘áº§u ra mong muá»‘n: 4K.", prompt)
        self.assertIn("Tá»· lá»‡ khung hÃ¬nh mong muá»‘n: 4:3.", prompt)
        self.assertNotIn("Giá»¯ nguyÃªn hÃ¬nh dáº¡ng Ä‘Æ°á»ng", prompt)
        self.assertNotIn("giá»¯ nguyÃªn gÃ³c nhÃ¬n", prompt)

    def test_original_output_settings_retain_reference_properties(self):
        response = self.client.post("/api/generate-prompt", json={
            "quality": "Original", "aspect_ratio": "Original"
        })
        prompt = response.json()["prompt"]
        self.assertIn("giá»¯ nguyÃªn Ä‘á»™ phÃ¢n giáº£i cá»§a áº£nh tham chiáº¿u", prompt)
        self.assertIn("giá»¯ nguyÃªn tá»· lá»‡ khung hÃ¬nh cá»§a áº£nh tham chiáº¿u", prompt)

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

