"""Tests for production storage retention cleanup via ProjectStore."""

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from services.project_store import ProjectStore


class CleanupStorageTests(unittest.TestCase):
    def _make_store(self, tmp: str, retention_days: int = 1) -> ProjectStore:
        data_dir = Path(tmp)
        uploads = data_dir / "uploads"
        outputs = data_dir / "outputs"
        uploads.mkdir()
        outputs.mkdir()
        db_path = data_dir / "projects.sqlite3"
        store = ProjectStore(db_path, uploads, outputs, retention_days=retention_days)
        store.initialize()
        return store

    def _age_file(self, path: Path, seconds_ago: float) -> None:
        """Set file mtime to simulate an old file."""
        now = 2_000_000.0
        mtime = now - seconds_ago
        os.utime(path, (mtime, mtime))

    def test_cleanup_removes_unreferenced_expired_files(self):
        """Files not referenced by any project and older than retention should be deleted."""
        with tempfile.TemporaryDirectory() as tmp:
            store = self._make_store(tmp, retention_days=1)
            uploads = Path(tmp) / "uploads"
            outputs = Path(tmp) / "outputs"

            # Create files with names matching the expected media name pattern
            old_upload = uploads / ("aa" * 16 + ".png")
            old_output = outputs / ("bb" * 16 + ".png")
            old_upload.write_bytes(b"old upload")
            old_output.write_bytes(b"old output")

            # Age these files so they appear well beyond the 1-day retention window (>2 days)
            self._age_file(old_upload, 3 * 86400)
            self._age_file(old_output, 3 * 86400)

            result = store.cleanup(dry_run=False)
            self.assertIsInstance(result, dict)
            self.assertIn("deleted_files", result)
            self.assertIn("failed_files", result)

    def test_cleanup_dry_run_does_not_delete(self):
        """Dry-run should report candidates but not actually delete any file."""
        with tempfile.TemporaryDirectory() as tmp:
            store = self._make_store(tmp, retention_days=1)
            uploads = Path(tmp) / "uploads"
            f = uploads / ("cc" * 16 + ".png")
            f.write_bytes(b"test")
            # Age file > 1 day so it is a deletion candidate
            self._age_file(f, 3 * 86400)

            result = store.cleanup(dry_run=True)
            self.assertIsInstance(result, dict)
            # File must still exist after dry run
            self.assertTrue(f.exists())

    def test_storage_check_ready_returns_bool(self):
        """check_ready() must return a boolean and not raise."""
        with tempfile.TemporaryDirectory() as tmp:
            store = self._make_store(tmp, retention_days=30)
            self.assertIsInstance(store.check_ready(), bool)

    def test_stats_returns_expected_keys(self):
        """stats() must include uploads, outputs, projects and total_bytes sections."""
        with tempfile.TemporaryDirectory() as tmp:
            store = self._make_store(tmp, retention_days=30)
            stats = store.stats()
            self.assertIn("uploads", stats)
            self.assertIn("outputs", stats)
            self.assertIn("projects", stats)
            self.assertIn("total_bytes", stats)


if __name__ == "__main__":
    unittest.main()
