"""Exercise rendering with mocked provider HTTP; no paid API requests are made."""

import base64
import os
import tempfile
import unittest
from email.parser import BytesParser
from email.policy import default
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from PIL import Image

import main
from services.image_render import provider
from services.providers import openai_provider
from test_api import image_bytes

REAL_ASYNC_CLIENT = httpx.AsyncClient

TEST_ENV = {
    "OPENAI_API_KEY": "sk-valid-key-for-testing",
    "OPENAI_IMAGE_MODEL": "gpt-image-2",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
}


def mock_provider(handler):
    transport = httpx.MockTransport(handler)
    return patch.object(
        openai_provider.httpx, "AsyncClient",
        side_effect=lambda **kwargs: REAL_ASYNC_CLIENT(
            transport=transport, **kwargs),
    )


def success_response():
    data = base64.b64encode(image_bytes()).decode("ascii")
    return httpx.Response(200, json={"data": [{"b64_json": data}]})


class RenderApiTests(unittest.TestCase):
    def setUp(self):
        upload_directory = tempfile.TemporaryDirectory()
        self.addCleanup(upload_directory.cleanup)
        self.upload_dir = Path(upload_directory.name)
        self.upload_patch = patch.object(main, 'UPLOAD_DIR', self.upload_dir)
        self.upload_patch.start()
        self.addCleanup(self.upload_patch.stop)
        status_cache = patch.object(provider, "_last_connection_status", None)
        status_cache.start()
        self.addCleanup(status_cache.stop)
        configuration = patch.dict(os.environ, TEST_ENV)
        configuration.start()
        self.addCleanup(configuration.stop)
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.output_dir = Path(directory.name)
        output_patch = patch.object(main, "OUTPUT_DIR", self.output_dir)
        output_patch.start()
        self.addCleanup(output_patch.stop)
        public_url = patch.object(main, "PUBLIC_BASE_URL", "")
        public_url.start()
        self.addCleanup(public_url.stop)
        self.requests = []
        self.provider_response = success_response()

        def handle(request: httpx.Request):
            self.requests.append(request)
            if isinstance(self.provider_response, Exception):
                raise self.provider_response
            return self.provider_response

        mocked_provider = mock_provider(handle)
        mocked_provider.start()
        self.addCleanup(mocked_provider.stop)
        self.client = TestClient(
            main.app, base_url="https://studio.example.test")
        self.addCleanup(self.client.close)

    def render(self, prompt="Use my current design.", negative_prompt="", content=None, **extra):
        upload_resp = self.client.post(
            "/api/upload-image",
            files={"file": ("source.png", image_bytes()
                            if content is None else content, "image/png")}
        )
        if upload_resp.status_code != 200:
            # Fake a response object that looks like the expected failure for render
            return upload_resp

        return self.client.post(
            "/api/render-image",
            json={
                "reference_image_name": upload_resp.json()["saved_name"],
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "settings": extra
            }
        )
    def test_success_forwards_source_and_current_prompt_with_real_size_setting(self):
        prompt = "  User-edited design.\nKeep this wording exactly.  "
        response = self.render(prompt=prompt)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(self.requests), 1)
        request = self.requests[0]
        self.assertTrue(str(request.url).endswith("/v1/images/edits"))
        self.assertEqual(
            request.headers["authorization"], f"Bearer {TEST_ENV['OPENAI_API_KEY']}")
        message = BytesParser(policy=default).parsebytes(
            f"Content-Type: {request.headers['content-type']}\r\nMIME-Version: 1.0\r\n\r\n".encode()
            + request.content
        )
        fields = {
            part.get_param("name", header="content-disposition"): part
            for part in message.iter_parts()
        }
        self.assertEqual(
            set(fields), {"model", "prompt", "n", "output_format", "size", "image[]"})
        width, height = map(int, fields["size"].get_payload(decode=True).decode().split("x"))
        self.assertEqual(width % 16, 0)
        self.assertEqual(height % 16, 0)
        self.assertGreaterEqual(width * height, 655360)
        self.assertEqual(fields["prompt"].get_payload(
            decode=True).decode(), prompt.strip())
        self.assertEqual(fields["model"].get_payload(
            decode=True), b"gpt-image-2")
        self.assertEqual(fields["n"].get_payload(decode=True), b"1")
        self.assertEqual(
            fields["output_format"].get_payload(decode=True), b"png")
        self.assertEqual(fields["image[]"].get_payload(
            decode=True), image_bytes())
        self.assertEqual(fields["image[]"].get_content_type(), "image/png")
        result = response.json()
        self.assertEqual(result["status"], "success")
        self.assertEqual((result["width"], result["height"]), (8, 6))
        self.assertRegex(result["name"], r"^[a-f0-9]{32}\.png$")
        self.assertEqual(
            (self.output_dir / result["name"]).read_bytes(), image_bytes())
        self.assertEqual(
            result["url"], f"https://studio.example.test/outputs/{result['name']}")
        status = self.client.get("/api/render-status").json()
        self.assertEqual(status["state"], "rendered")
        self.assertTrue(status["ready"])
        self.assertEqual(status["verification_kind"], "render")
        self.assertTrue(self.client.get("/api/health").json()["capabilities"]["image_generation"])
        self.assertEqual(result["details"]["native_size"], "8x6")
        self.assertEqual(result["details"]["processing"], "native")
        self.assertFalse(result["details"]["upscaled"])

    def test_4k_ratio_is_sent_to_provider_and_applied_to_saved_image(self):
        response = self.render(quality="4K", aspect_ratio="16:9", creativity=70)
        self.assertEqual(response.status_code, 200, response.text)
        request = self.requests[0]
        message = BytesParser(policy=default).parsebytes(
            f"Content-Type: {request.headers['content-type']}\r\nMIME-Version: 1.0\r\n\r\n".encode() + request.content
        )
        fields = {part.get_param("name", header="content-disposition"): part.get_payload(decode=True) for part in message.iter_parts()}
        self.assertEqual(fields["size"], b"3840x2160")
        self.assertNotIn("strength", fields)
        self.assertNotIn("creativity", fields)
        result = response.json()
        self.assertEqual((result["width"], result["height"]), (3840, 2160))
        with Image.open(self.output_dir / result["name"]) as saved:
            self.assertEqual(saved.size, (3840, 2160))
        self.assertEqual(result["details"]["requested_size"], "3840x2160")
        self.assertEqual(result["details"]["provider_size"], "3840x2160")
        self.assertEqual(result["details"]["native_size"], "8x6")
        self.assertEqual(result["details"]["final_size"], "3840x2160")
        self.assertTrue(result["details"]["cropped"])
        self.assertTrue(result["details"]["upscaled"])
        self.assertEqual(result["details"]["processing"], "cropped_and_resized")

    def test_invalid_output_settings_are_rejected_without_provider_calls(self):
        for settings in ({"quality": "8K", "aspect_ratio": "1:1"}, {"aspect_ratio": "5:1"}, {"quality": "16K"}):
            with self.subTest(settings=settings):
                self.assertEqual(self.render(**settings).status_code, 422)
        self.assertEqual(self.requests, [])

    def test_only_explicit_negative_prompt_is_appended(self):
        response = self.render(prompt="An unchanged prompt.",
                               negative_prompt="extra roads")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"An unchanged prompt.\n\nAvoid: extra roads",
                      self.requests[0].content)
        self.assertNotIn(b"photorealistic", self.requests[0].content)

    def test_configured_status_never_exposes_key_or_provider_url(self):
        for endpoint in ("/api/health", "/api/render-status"):
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, 200)
            self.assertNotIn(TEST_ENV["OPENAI_API_KEY"], response.text)
            self.assertNotIn(TEST_ENV["OPENAI_BASE_URL"], response.text)
            status = response.json().get("renderer", response.json())
            self.assertTrue(status["configured"])
            self.assertEqual(status["provider"], "OpenAI Images")
            self.assertEqual(status["state"], "unverified")
            self.assertFalse(status["ready"])
            self.assertIsNone(status["verification_kind"])
            self.assertIsNone(status["checked_at"])
        self.assertFalse(self.client.get("/api/health").json()
                        ["capabilities"]["image_generation"])
        self.assertEqual(self.requests, [])

    def test_missing_or_invalid_configuration_returns_503_without_provider_calls(self):
        for settings, expected_state, variable in (
            ({"OPENAI_API_KEY": ""}, "missing_key", "OPENAI_API_KEY"),
            ({"OPENAI_API_KEY": "your_api_key_here"},
             "missing_key", "OPENAI_API_KEY"),
            ({"OPENAI_API_KEY": "malformed\nkey"},
             "invalid_config", "OPENAI_API_KEY"),
            ({"OPENAI_API_KEY": "khóa-không-hợp-lệ"},
             "invalid_config", "OPENAI_API_KEY"),
            ({"OPENAI_IMAGE_MODEL": ""}, "invalid_config", "OPENAI_IMAGE_MODEL"),
            ({"OPENAI_IMAGE_MODEL": "bad model"},
             "invalid_config", "OPENAI_IMAGE_MODEL"),
            ({"OPENAI_BASE_URL": "not-a-url"},
             "invalid_config", "OPENAI_BASE_URL"),
            ({"OPENAI_BASE_URL": "https://example.test:not-a-port/v1"},
             "invalid_config", "OPENAI_BASE_URL"),
            ({"OPENAI_BASE_URL": "https://example.test:99999/v1"},
             "invalid_config", "OPENAI_BASE_URL"),
            ({"OPENAI_BASE_URL": "https://secret@example.test/v1"},
             "invalid_config", "OPENAI_BASE_URL"),
            ({"OPENAI_BASE_URL": "https://example.test/v1?key=secret"},
             "invalid_config", "OPENAI_BASE_URL"),
        ):
            with self.subTest(settings=settings), patch.dict(os.environ, settings):
                status = self.client.get("/api/render-status")
                self.assertFalse(status.json()["configured"])
                self.assertEqual(status.json()["state"], expected_state)
                self.assertEqual(self.client.post(
                    "/api/render-status/check").json(), status.json())
                health = self.client.get("/api/health")
                self.assertFalse(
                    health.json()["capabilities"]["image_generation"])
                response = self.render()
                self.assertEqual(response.status_code, 503)
                self.assertIn(variable, response.json()["detail"])
        self.assertEqual(self.requests, [])
        self.assertEqual(list(self.output_dir.iterdir()), [])

    def test_connection_check_only_retrieves_model_and_caches_sanitized_status(self):
        self.provider_response = httpx.Response(200, json={
            "id": TEST_ENV["OPENAI_IMAGE_MODEL"], "object": "model", "owned_by": "secret account",
        })
        response = self.client.post("/api/render-status/check")
        self.assertEqual(response.status_code, 200)
        status = response.json()
        self.assertTrue(status["configured"])
        self.assertEqual(status["state"], "connected")
        self.assertFalse(status["ready"])
        self.assertEqual(status["verification_kind"], "model")
        self.assertFalse(self.client.get("/api/health").json()["capabilities"]["image_generation"])
        self.assertIsNotNone(status["checked_at"])
        self.assertNotIn("secret account", response.text)
        self.assertNotIn(TEST_ENV["OPENAI_API_KEY"], response.text)
        self.assertNotIn(TEST_ENV["OPENAI_BASE_URL"], response.text)
        self.assertEqual(self.client.get("/api/render-status").json(), status)
        self.assertEqual(self.client.get(
            "/api/health").json()["renderer"], status)
        self.assertEqual(len(self.requests), 1)
        request = self.requests[0]
        self.assertEqual(request.method, "GET")
        self.assertEqual(str(
            request.url), f"{TEST_ENV['OPENAI_BASE_URL']}/models/{TEST_ENV['OPENAI_IMAGE_MODEL']}")
        self.assertEqual(
            request.headers["authorization"], f"Bearer {TEST_ENV['OPENAI_API_KEY']}")
        self.assertEqual(request.content, b"")
        self.assertEqual(list(self.output_dir.iterdir()), [])

    def test_connection_check_rechecks_on_action_and_expires_or_invalidates_cache(self):
        self.provider_response = httpx.Response(
            200, json={"id": "gpt-image-2", "object": "model"})
        with patch.object(openai_provider, "monotonic", return_value=100):
            self.client.post("/api/render-status/check")
            self.assertEqual(self.client.get(
                "/api/render-status").json()["state"], "connected")
            with patch.dict(os.environ, {"OPENAI_API_KEY": "a-different-key"}):
                self.assertEqual(self.client.get(
                    "/api/render-status").json()["state"], "unverified")
            with patch.dict(os.environ, {"OPENAI_IMAGE_MODEL": "a-different-model"}):
                self.assertEqual(self.client.get(
                    "/api/render-status").json()["state"], "unverified")
            with patch.dict(os.environ, {"OPENAI_BASE_URL": "https://different.example.test/v1"}):
                self.assertEqual(self.client.get(
                    "/api/render-status").json()["state"], "unverified")
        with patch.object(openai_provider, "monotonic", return_value=100 + openai_provider.CONNECTION_STATUS_TTL_SECONDS):
            self.assertEqual(self.client.get(
                "/api/render-status").json()["state"], "unverified")
        self.provider_response = httpx.Response(
            401, json={"message": "secret account details"})
        self.assertEqual(self.client.post(
            "/api/render-status/check").json()["state"], "unauthorized")
        self.assertEqual(len(self.requests), 2)

    def test_connection_errors_are_actionable_sanitized_and_not_retried(self):
        for upstream_status, expected_state in (
            (401, "unauthorized"), (403, "unauthorized"), (404, "model_unavailable"),
            (429, "rate_limited"), (500, "provider_error"), (302, "provider_error"),
        ):
            with self.subTest(upstream_status=upstream_status):
                self.requests.clear()
                self.provider_response = httpx.Response(
                    upstream_status, json={
                        "error": "secret provider response"},
                    headers={"Location": "https://redirect.example.test/"},
                )
                response = self.client.post("/api/render-status/check")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["state"], expected_state)
                self.assertTrue(response.json()["configured"])
                self.assertNotIn("secret provider", response.text)
                self.assertEqual(self.client.get(
                    "/api/render-status").json()["state"], expected_state)
                self.assertEqual(len(self.requests), 1)
        for error, state in (
            (httpx.ReadTimeout("secret transport"), "timeout"),
            (httpx.ConnectError("secret transport"), "provider_error"),
        ):
            with self.subTest(error=type(error).__name__):
                self.requests.clear()
                self.provider_response = error
                response = self.client.post("/api/render-status/check")
                self.assertEqual(response.json()["state"], state)
                self.assertNotIn("secret transport", response.text)
                self.assertEqual(len(self.requests), 1)

    def test_connection_check_rejects_html_wrong_model_and_oversized_responses(self):
        for content in (
            b"<html>Proxy login</html>", b"[]", b"null", b"{}",
            b'{"id": "different-model", "object": "model"}',
            b"x" * (openai_provider.MAX_MODEL_RESPONSE_BYTES + 1),
        ):
            with self.subTest(content=content[:60]):
                self.provider_response = httpx.Response(200, content=content)
                response = self.client.post("/api/render-status/check")
                self.assertEqual(response.json()["state"], "provider_error")
                self.assertNotIn("Proxy login", response.text)

    def test_invalid_input_is_rejected_before_provider_request(self):
        for prompt, negative in (("  ", ""), ("x" * 28_001, ""), ("valid", "x" * 4_001), ("x" * 28_000, "x" * 4_000)):
            with self.subTest(prompt_length=len(prompt), negative_length=len(negative)):
                self.assertEqual(self.render(
                    prompt, negative).status_code, 422)
        self.assertEqual(self.render(content=b"broken-image").status_code, 400)
        self.assertEqual(self.requests, [])

    def test_provider_errors_are_sanitized_and_never_retried(self):
        for upstream_status, expected_status in ((400, 400), (401, 502), (403, 502), (404, 502), (429, 429), (500, 502), (302, 502)):
            with self.subTest(upstream_status=upstream_status):
                self.requests.clear()
                self.provider_response = httpx.Response(
                    upstream_status, json={
                        "error": {"message": "secret upstream account detail"}}
                )
                response = self.render()
                self.assertEqual(response.status_code,
                                 expected_status, response.text)
                self.assertNotIn("secret upstream", response.text)
                self.assertNotIn(TEST_ENV["OPENAI_API_KEY"], response.text)
                self.assertEqual(len(self.requests), 1)
                self.assertEqual(list(self.output_dir.iterdir()), [])

    def test_provider_timeout_and_connection_errors_are_sanitized(self):
        for error, expected_status in (
            (httpx.ReadTimeout("secret transport details"), 504),
            (httpx.ConnectError("secret transport details"), 502),
        ):
            with self.subTest(error=type(error).__name__):
                self.requests.clear()
                self.provider_response = error
                response = self.render()
                self.assertEqual(response.status_code, expected_status)
                self.assertNotIn("secret transport", response.text)
                self.assertEqual(len(self.requests), 1)

    def test_empty_malformed_and_corrupt_provider_images_are_not_saved(self):
        payloads = (
            {}, {"data": []}, {"data": [{"b64_json": ""}]},
            {"data": [{"b64_json": "not base64!"}]},
            {"data": [{"b64_json": base64.b64encode(
                b"not an image").decode()}]},
            {"data": [{"b64_json": base64.b64encode(
                image_bytes("JPEG")).decode()}]},
        )
        for payload in payloads:
            with self.subTest(payload=str(payload)[:80]):
                self.provider_response = httpx.Response(200, json=payload)
                self.assertEqual(self.render().status_code, 502)
        self.provider_response = httpx.Response(200, content=b"invalid json")
        self.assertEqual(self.render().status_code, 502)
        self.assertEqual(list(self.output_dir.iterdir()), [])

    def test_provider_size_limits_are_enforced(self):
        with patch.object(openai_provider, "MAX_PROVIDER_RESPONSE_BYTES", 16):
            self.assertEqual(self.render().status_code, 502)
        self.provider_response = success_response()
        with patch.object(openai_provider, "MAX_RENDER_BYTES", len(image_bytes()) - 1):
            self.assertEqual(self.render().status_code, 502)
        self.assertEqual(list(self.output_dir.iterdir()), [])

    def test_public_output_url_and_storage_errors(self):
        with patch.object(main, "PUBLIC_BASE_URL", "https://cdn.example.test/infra"):
            response = self.render()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["url"].startswith(
            "https://cdn.example.test/infra/outputs/"))
        self.provider_response = success_response()
        with patch.object(Path, "write_bytes", side_effect=OSError("secret path")):
            with self.assertLogs("main", level="ERROR"):
                response = self.render()
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("secret path", response.text)
        self.assertEqual(len(list(self.output_dir.iterdir())), 1)
