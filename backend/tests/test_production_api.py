import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
import main
from services.project_store import ProjectStore


class ProductionApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"OPENAI_API_KEY": "", "INFRARENDER_AUTH_PASS": ""})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_template_identifies_engine_and_does_not_claim_vision(self):
        response = self.client.post("/api/generate-prompt", json={"mode": "template", "weather": "sunny weather"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("mode"), "template")
        self.assertEqual(response.json().get("analysis"), [])

    def test_ai_request_without_key_fails_explicitly(self):
        response = self.client.post("/api/generate-prompt", json={"mode": "refine"})
        self.assertEqual(response.status_code, 503)

    def test_vision_requires_source(self):
        response = self.client.post("/api/generate-prompt", json={"mode": "vision"})
        self.assertEqual(response.status_code, 422)

    def test_prompt_rejects_file_traversal(self):
        for name in ("../.env", "C:/secret.png", "..\\secret.png"):
            response = self.client.post("/api/generate-prompt", json={"reference_image_name": name})
            self.assertEqual(response.status_code, 422)

    def test_configured_team_token_protects_api_but_health_is_public(self):
        with patch.dict(os.environ, {"INFRARENDER_AUTH_PASS": "test-access-token"}):
            import base64
            auth = "Basic " + base64.b64encode(b"hieu.dv:test-access-token").decode()
            self.assertEqual(self.client.get("/api/health").status_code, 200)
            self.assertEqual(self.client.post("/api/generate-prompt", json={}).status_code, 401)
            self.assertEqual(self.client.post("/api/generate-prompt", json={}, headers={"Authorization": auth}).status_code, 200)

    def test_health_does_not_equate_configuration_to_render_success(self):
        with patch.object(main, "render_status", return_value={"configured": True, "state": "unverified", "provider": "OpenAI", "message": "Unverified"}):
            body = self.client.get("/api/health").json()
        self.assertFalse(body["capabilities"]["image_generation"])


class ProjectApiTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.uploads, self.outputs = self.directory / "uploads", self.directory / "outputs"
        self.uploads.mkdir()
        self.outputs.mkdir()
        self.store = ProjectStore(self.directory / "projects.sqlite3", self.uploads, self.outputs)
        for context in [
            patch.dict(os.environ, {"INFRARENDER_AUTH_PASS": "", "INFRARENDER_ENV": "development"}),
            patch.object(main, "store", self.store),
            patch.object(main, "UPLOAD_DIR", self.uploads),
            patch.object(main, "OUTPUT_DIR", self.outputs),
            patch.object(main, "PUBLIC_BASE_URL", ""),
        ]:
            context.start()
            self.addCleanup(context.stop)
        self.client = TestClient(main.app, base_url="https://infra.example.test")
        self.addCleanup(self.client.close)

    def test_uploaded_source_survives_project_roundtrip_and_deletes_with_project(self):
        with BytesIO() as content:
            Image.new("RGB", (8, 6)).save(content, format="PNG")
            upload = self.client.post("/api/upload-image", files={"file": ("cau.png", content.getvalue(), "image/png")})
        self.assertEqual(upload.status_code, 200, upload.text)
        uploaded = upload.json()
        snapshot = {
            "schemaVersion": 1, "projectName": "Cầu thÃ nh phá»‘", "promptMode": "vision",
            "source": {"saved_name": uploaded["saved_name"], "url": uploaded["url"],
                       "name": "cau.png", "size": "0.01 MB", "resolution": "8 Ã— 6"},
            "prompt": "Giá»¯ nguyÃªn hÃ¬nh há»c cáº§u", "notes": "Buá»•i chiá»u",
            "settings": {"quality": "4K", "aspectRatio": "16:9"},
            "promptAnalysis": ["Má»™t tuyáº¿n Ä‘Æ°á»ng qua cáº§u"], "promptModel": "test-vision",
            "versions": [], "renderVersions": [], "activeRenderId": None,
        }
        created = self.client.post("/api/projects", json={"name": "Cầu thÃ nh phá»‘", "workspace": snapshot})
        self.assertEqual(created.status_code, 201, created.text)
        project = created.json()
        url = f"/api/projects/{project['id']}"
        fetched = self.client.get(url)
        self.assertEqual(fetched.json()["workspace"], snapshot)
        self.assertEqual(self.client.get("/api/projects").json()["projects"][0]["id"], project["id"])

        media_url = f"/api/files/uploads/{uploaded['saved_name']}"
        self.assertEqual(self.client.delete(media_url).status_code, 409)
        update = {"name": "Cầu má»›i", "workspace": {**snapshot, "notes": "Buá»•i sÃ¡ng"}, "revision": 1}
        saved = self.client.put(url, json=update)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["revision"], 2)
        self.assertEqual(self.client.put(url, json=update).status_code, 409)
        self.assertEqual(self.client.get(url).json()["workspace"]["notes"], "Buá»•i sÃ¡ng")
        self.assertEqual(self.client.delete(url).status_code, 200)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertFalse((self.uploads / uploaded["saved_name"]).exists())

    def test_project_update_requires_revision_and_rejects_invalid_workspace(self):
        project = self.client.post("/api/projects", json={"name": "Cầu", "workspace": {}}).json()
        url = f"/api/projects/{project['id']}"
        self.assertEqual(self.client.put(url, json={"name": "New", "workspace": {}}).status_code, 422)
        invalid = self.client.put(url, json={"name": "New", "workspace": {"unknown": True}, "revision": 1})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(self.client.get(url).json()["revision"], 1)

    def test_body_limit_rejects_oversized_json_before_storing_data(self):
        response = self.client.post("/api/projects", content=b" " * (4 * 1024 * 1024 + 1),
                                    headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.store.list(), [])

    def test_storage_api_preview_does_not_delete_files(self):
        from uuid import uuid4
        name = f"{uuid4().hex}.png"
        path = self.outputs / name
        path.write_bytes(b"expired image")
        os.utime(path, (1, 1))
        preview = self.client.post("/api/storage/cleanup", json={})
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertTrue(preview.json()["dry_run"])
        self.assertTrue(path.exists())
        cleaned = self.client.post("/api/storage/cleanup", json={"dry_run": False})
        self.assertEqual(cleaned.status_code, 200, cleaned.text)
        self.assertFalse(path.exists())
        self.assertEqual(self.client.get("/api/storage").json()["total_bytes"], 0)

    def test_team_token_blocks_project_and_file_mutations_without_credentials(self):
        with patch.dict(os.environ, {"INFRARENDER_AUTH_PASS": "team-access"}):
            import base64
            auth = "Basic " + base64.b64encode(b"hieu.dv:team-access").decode()
            for method, url, data in [
                ("get", "/api/projects", None),
                ("post", "/api/projects", {"name": "Cầu", "workspace": {}}),
                ("post", "/api/storage/cleanup", {"dry_run": False}),
                ("delete", "/api/files/uploads/not-an-image.png", None),
            ]:
                response = self.client.request(method, url, json=data)
                self.assertEqual(response.status_code, 401)
            allowed = self.client.get("/api/projects", headers={"Authorization": auth})
            self.assertEqual(allowed.status_code, 200)

    def test_cors_preflight_supports_authenticated_project_updates(self):
        origin = main.CORS_ORIGINS[0]
        preflight = self.client.options("/api/projects", headers={
            "Origin": origin, "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        })
        self.assertEqual(preflight.status_code, 200, preflight.text)
        self.assertEqual(preflight.headers["access-control-allow-origin"], origin)
        self.assertIn("DELETE", preflight.headers["access-control-allow-methods"])
        denied = self.client.options("/api/projects", headers={
            "Origin": "https://untrusted.example.test", "Access-Control-Request-Method": "PUT",
        })
        self.assertEqual(denied.status_code, 400)
        self.assertNotIn("access-control-allow-origin", denied.headers)

    def test_production_lifespan_refuses_missing_authentication_or_insecure_public_url(self):
        for token, public_url, origins in [
            ("short", "https://infra.example.test", ["https://ui.example.test"]),
            ("x" * 32, "http://infra.example.test", ["https://ui.example.test"]),
            ("x" * 32, "https://infra.example.test", ["*"]),
        ]:
            with self.subTest(public_url=public_url, origins=origins), \
                 patch.dict(os.environ, {"INFRARENDER_ENV": "production", "INFRARENDER_AUTH_PASS": token}), \
                 patch.object(main, "PUBLIC_BASE_URL", public_url), patch.object(main, "CORS_ORIGINS", origins):
                with self.assertRaises(RuntimeError):
                    with TestClient(main.app):
                        pass

    def test_production_lifespan_accepts_explicit_secure_configuration(self):
        with patch.dict(os.environ, {"INFRARENDER_ENV": "production", "INFRARENDER_AUTH_PASS": "x" * 32}), \
             patch.object(main, "PUBLIC_BASE_URL", "https://infra.example.test"), \
             patch.object(main, "CORS_ORIGINS", ["https://ui.example.test"]), \
             patch.object(main.store, "check_ready", return_value=True):
            with TestClient(main.app) as client:
                self.assertEqual(client.get("/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
