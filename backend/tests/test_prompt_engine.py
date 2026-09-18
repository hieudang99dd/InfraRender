"""Exercise real prompt assembly/parsing with only external HTTP mocked."""

import base64
import json
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from schemas import PromptRequest
from services import prompt_engine

REAL_ASYNC_CLIENT = httpx.AsyncClient
TEST_ENV = {
    "OPENAI_API_KEY": "test-key-not-real",
    "OPENAI_PROMPT_MODEL": "gpt-4o-mini",
    "OPENAI_BASE_URL": "https://provider.example.test/v1",
}


def completion(content=None, finish_reason="stop", refusal=None):
    return httpx.Response(200, json={
        "model": "gpt-4o-mini-2024-07-18",
        "choices": [{"finish_reason": finish_reason, "message": {
            "role": "assistant", "refusal": refusal,
            "content": json.dumps({"prompt": "Phối cảnh công nghiệp với ánh sáng dịu.", "analysis": ["Vật liệu chưa xác định chắc chắn."]}, ensure_ascii=False) if content is None else content,
        }}],
    })


class PromptEngineTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.requests = []
        self.response = completion()
        self.environment = patch.dict(os.environ, TEST_ENV)
        self.environment.start()
        self.addCleanup(self.environment.stop)

        def handle(request):
            self.requests.append(request)
            if isinstance(self.response, Exception):
                raise self.response
            return self.response

        transport = httpx.MockTransport(handle)
        mocked = patch.object(prompt_engine.httpx, "AsyncClient", side_effect=lambda **kwargs: REAL_ASYNC_CLIENT(transport=transport, **kwargs))
        mocked.start()
        self.addCleanup(mocked.stop)

    async def test_template_is_available_without_key_and_never_claims_ai(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            response = await prompt_engine.generate_prompt(PromptRequest(notes="Giữ mái ngói đỏ."))
        self.assertEqual(response.mode, "template")
        self.assertIsNone(response.model)
        self.assertEqual(response.analysis, [])
        self.assertIn("Giữ mái ngói đỏ.", response.prompt)
        self.assertEqual(self.requests, [])

    async def test_refinement_sends_user_settings_and_returns_ai_provenance(self):
        response = await prompt_engine.generate_prompt(PromptRequest(mode="refine", custom_keywords=["sân chơi"], preserve_geometry=True))
        self.assertEqual(response.mode, "refine")
        self.assertEqual(response.model, "gpt-4o-mini-2024-07-18")
        self.assertEqual(response.prompt, "Phối cảnh công nghiệp với ánh sáng dịu.")
        request = self.requests[0]
        self.assertEqual(str(request.url), "https://provider.example.test/v1/chat/completions")
        payload = json.loads(request.content)
        self.assertEqual(payload["model"], "gpt-4o-mini")
        self.assertTrue(payload["response_format"]["json_schema"]["strict"])
        self.assertFalse(payload["store"])
        self.assertIn("sân chơi", payload["messages"][1]["content"][0]["text"])
        self.assertEqual(len(payload["messages"][1]["content"]), 1)

    async def test_vision_sends_image_only_in_explicit_vision_mode(self):
        image = b"validated-image-bytes"
        response = await prompt_engine.generate_prompt(PromptRequest(mode="vision"), image, "image/webp")
        self.assertEqual(response.mode, "vision")
        self.assertEqual(response.analysis, ["Vật liệu chưa xác định chắc chắn."])
        content = json.loads(self.requests[0].content)["messages"][1]["content"]
        self.assertEqual(content[1]["image_url"]["url"], "data:image/webp;base64," + base64.b64encode(image).decode())
        await prompt_engine.generate_prompt(PromptRequest(mode="refine"), image)
        self.assertEqual(len(json.loads(self.requests[1].content)["messages"][1]["content"]), 1)

    async def test_missing_image_and_oversized_image_fail_before_http(self):
        for image, mime in ((None, "image/png"), (b"", "image/png"), (b"image", "text/html")):
            with self.subTest(image=image, mime=mime), self.assertRaises(HTTPException) as raised:
                await prompt_engine.generate_prompt(PromptRequest(mode="vision"), image, mime)
            self.assertEqual(raised.exception.status_code, 422)
        with patch.object(prompt_engine, "MAX_IMAGE_BYTES", 3), self.assertRaises(HTTPException) as raised:
            await prompt_engine.generate_prompt(PromptRequest(mode="vision"), b"four")
        self.assertEqual(raised.exception.status_code, 413)
        self.assertEqual(self.requests, [])

    async def test_missing_or_invalid_configuration_has_no_template_fallback(self):
        for env in ({"OPENAI_API_KEY": ""}, {"OPENAI_API_KEY": "your_api_key_here"}, {"OPENAI_API_KEY": "bad\nkey"}, {"OPENAI_BASE_URL": "broken-url"}, {"OPENAI_PROMPT_MODEL": "bad model"}):
            with self.subTest(env=env), patch.dict(os.environ, env), self.assertRaises(HTTPException) as raised:
                await prompt_engine.generate_prompt(PromptRequest(mode="refine"))
            self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(self.requests, [])

    async def test_legacy_vision_model_environment_is_a_supported_fallback(self):
        with patch.dict(os.environ, {"OPENAI_PROMPT_MODEL": "", "OPENAI_VISION_MODEL": "gpt-4o-mini-2024-07-18"}):
            await prompt_engine.generate_prompt(PromptRequest(mode="refine"))
        self.assertEqual(json.loads(self.requests[0].content)["model"], "gpt-4o-mini-2024-07-18")

    async def test_provider_errors_are_sanitized_and_not_retried(self):
        for upstream, expected in ((400, 400), (401, 502), (403, 502), (404, 502), (429, 429), (500, 502), (302, 502)):
            self.requests.clear()
            self.response = httpx.Response(upstream, json={"error": "secret account detail"})
            with self.subTest(upstream=upstream), self.assertRaises(HTTPException) as raised:
                await prompt_engine.generate_prompt(PromptRequest(mode="refine"))
            self.assertEqual(raised.exception.status_code, expected)
            self.assertNotIn("secret", raised.exception.detail)
            self.assertEqual(len(self.requests), 1)

    async def test_malformed_or_incomplete_structured_outputs_are_rejected(self):
        for content in ("not json", "[]", "null", '{}', '{"prompt":" ","analysis":[]}', '{"prompt":"x","analysis":[12]}', '{"prompt":"x","analysis":[],"extra":true}', json.dumps({"prompt": "x" * 28001, "analysis": []})):
            self.response = completion(content=content)
            with self.subTest(content=content[:80]), self.assertRaises(HTTPException) as raised:
                await prompt_engine.generate_prompt(PromptRequest(mode="refine"))
            self.assertEqual(raised.exception.status_code, 502)
        self.response = completion(finish_reason="length")
        with self.assertRaises(HTTPException) as raised:
            await prompt_engine.generate_prompt(PromptRequest(mode="refine"))
        self.assertEqual(raised.exception.status_code, 502)

    async def test_refusal_is_distinct_and_does_not_expose_provider_text(self):
        self.response = completion(refusal="secret refusal text")
        with self.assertRaises(HTTPException) as raised:
            await prompt_engine.generate_prompt(PromptRequest(mode="refine"))
        self.assertEqual(raised.exception.status_code, 400)
        self.assertNotIn("secret", raised.exception.detail)

    async def test_timeouts_network_errors_and_response_limits_are_bounded(self):
        for response, expected in ((httpx.ReadTimeout("secret transport"), 504), (httpx.ConnectError("secret network"), 502), (httpx.Response(200, content=b"x" * 131073), 502)):
            self.requests.clear()
            self.response = response
            with self.subTest(expected=expected), self.assertRaises(HTTPException) as raised:
                await prompt_engine.generate_prompt(PromptRequest(mode="refine"))
            self.assertEqual(raised.exception.status_code, expected)
            self.assertNotIn("secret", raised.exception.detail)
            self.assertEqual(len(self.requests), 1)


if __name__ == "__main__":
    unittest.main()
