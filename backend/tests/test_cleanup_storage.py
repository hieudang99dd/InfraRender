"""Maintenance must fail closed when the project database is unavailable."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.cleanup_storage import run_cleanup
from services.project_store import ProjectStore


class CleanupStorageTests(unittest.TestCase):
    def test_missing_database_never_treats_existing_media_as_orphans(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {"INFRARENDER_DATA_DIR": temp}):
            media = Path(temp) / "outputs"
            media.mkdir()
            image = media / ("a" * 32 + ".png")
            image.write_bytes(b"keep")
            os.utime(image, (1, 1))
            with self.assertRaises(RuntimeError):
                run_cleanup()
            self.assertTrue(image.exists())
            self.assertFalse((Path(temp) / "projects.sqlite3").exists())

    def test_preview_honors_shared_retention_setting(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {
            "INFRARENDER_DATA_DIR": temp, "INFRARENDER_RETENTION_DAYS": "60",
        }):
            root = Path(temp)
            uploads, outputs = root / "uploads", root / "outputs"
            uploads.mkdir()
            outputs.mkdir()
            ProjectStore(root / "projects.sqlite3", uploads, outputs).initialize()
            image = outputs / ("b" * 32 + ".png")
            image.write_bytes(b"old")
            os.utime(image, (1, 1))
            report = run_cleanup(dry_run=True)
            self.assertEqual(report["retention_days"], 60)
            self.assertEqual([entry["name"] for entry in report["candidates"]], [image.name])
            self.assertEqual(report["deleted_files"], [])
            self.assertTrue(image.exists())
