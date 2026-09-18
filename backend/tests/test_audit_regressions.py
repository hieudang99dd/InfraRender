"""Regression tests for mounted secrets, durable storage and safe maintenance."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from services import cleanup_storage
from services.project_store import ProjectStore
from services.prompt_engine import _prompt_config
from services.providers.openai_provider import OpenAIImageProvider


class AuditRegressionTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.uploads, self.outputs = self.root / "uploads", self.root / "outputs"
        self.uploads.mkdir()
        self.outputs.mkdir()
        self.store = ProjectStore(self.root / "projects.sqlite3", self.uploads, self.outputs)
        self.store.initialize()
        env = patch.dict(os.environ, {
            "INFRARENDER_ENV": "development", "INFRARENDER_DATA_DIR": str(self.root),
            "INFRARENDER_RETENTION_DAYS": "30", "INFRARENDER_ACCESS_TOKEN": "",
            "INFRARENDER_ACCESS_TOKEN_FILE": "", "OPENAI_API_KEY": "",
            "OPENAI_API_KEY_FILE": "", "OPENAI_IMAGE_MODEL": "gpt-image-2",
            "OPENAI_PROMPT_MODEL": "gpt-4o-mini", "OPENAI_BASE_URL": "https://api.openai.com/v1",
        })
        env.start()
        self.addCleanup(env.stop)
        store_patch = patch.object(main, "store", self.store)
        store_patch.start()
        self.addCleanup(store_patch.stop)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
        # Isolate the old age-only implementation as well as its replacement.
        for name, directory in (("UPLOAD_DIR", self.uploads), ("OUTPUT_DIR", self.outputs)):
            directory_patch = patch.object(cleanup_storage, name, directory, create=True)
            directory_patch.start()
            self.addCleanup(directory_patch.stop)

    def test_mounted_provider_key_configures_both_ai_engines(self):
        secret = self.root / "provider-key"
        secret.write_text("test-mounted-provider-key\n", encoding="utf-8")
        with patch.dict(os.environ, {"OPENAI_API_KEY_FILE": str(secret)}):
            self.assertTrue(OpenAIImageProvider().get_status()["configured"])
            self.assertEqual(_prompt_config().api_key, "test-mounted-provider-key")

    def test_mounted_application_token_protects_project_api(self):
        secret = self.root / "access-token"
        token = "test-mounted-application-token-123456789"
        secret.write_text(token + "\n", encoding="utf-8")
        with patch.dict(os.environ, {"INFRARENDER_ACCESS_TOKEN_FILE": str(secret)}):
            self.assertTrue(self.client.get("/api/health").json()["authentication_required"])
            self.assertEqual(self.client.get("/api/projects").status_code, 401)
            response = self.client.get("/api/projects", headers={"Authorization": f"Bearer {token}"})
            self.assertEqual(response.status_code, 200)

    def test_unreadable_configured_token_file_never_opens_project_access(self):
        with patch.dict(os.environ, {"INFRARENDER_ACCESS_TOKEN_FILE": str(self.root / "missing")}):
            response = self.client.get("/api/projects")
            self.assertEqual(response.status_code, 503)
            self.assertNotIn(str(self.root), response.text)

    def test_health_fails_when_a_media_directory_disappears(self):
        self.uploads.rmdir()
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["capabilities"]["upload"])
        self.assertFalse(response.json()["capabilities"]["projects"])
        self.assertNotIn(str(self.root), response.text)

    def test_health_detects_unusable_database(self):
        self.store.db_path.unlink()
        self.store.db_path.mkdir()
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 503)

    def test_health_probe_preserves_projects_revisions_and_leaves_no_media(self):
        project = self.store.create("Keep", {"prompt": "Keep this text"})
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        self.assertEqual(self.store.get(project["id"]), project)
        self.assertEqual(list(self.uploads.iterdir()), [])
        self.assertEqual(list(self.outputs.iterdir()), [])

    def test_maintenance_uses_data_dir_and_preserves_referenced_old_files(self):
        source, output, orphan = "a" * 32 + ".png", "b" * 32 + ".png", "c" * 32 + ".png"
        for directory, name in ((self.uploads, source), (self.outputs, output), (self.outputs, orphan)):
            file = directory / name
            file.write_bytes(b"image fixture")
            os.utime(file, (1, 1))
        project = self.store.create("Keep", {
            "source": {"saved_name": source}, "renderVersions": [{"name": output}],
        })
        cleanup_storage.run_cleanup()
        self.assertTrue((self.uploads / source).exists())
        self.assertTrue((self.outputs / output).exists())
        self.assertFalse((self.outputs / orphan).exists())
        self.assertEqual(self.store.get(project["id"]), project)


if __name__ == "__main__":
    unittest.main()
