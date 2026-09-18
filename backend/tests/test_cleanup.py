"""Tests for production storage retention cleanup."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.cleanup_storage import cleanup_directory, positive_int_env


class CleanupStorageTests(unittest.TestCase):
    def test_cleanup_removes_only_expired_regular_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            expired = directory / "expired.png"
            fresh = directory / "fresh.png"
            expired.write_bytes(b"old")
            fresh.write_bytes(b"new")
            now = 2_000_000.0
            os.utime(expired, (now - 7200, now - 7200))
            os.utime(fresh, (now - 300, now - 300))

            files, size = cleanup_directory(directory, retention_hours=1, now=now)

            self.assertEqual(files, 1)
            self.assertEqual(size, 3)
            self.assertFalse(expired.exists())
            self.assertTrue(fresh.exists())

    def test_zero_retention_disables_cleanup(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            path = directory / "keep.png"
            path.write_bytes(b"data")
            files, size = cleanup_directory(directory, retention_hours=0, now=2_000_000.0)
            self.assertEqual((files, size), (0, 0))
            self.assertTrue(path.exists())

    def test_invalid_environment_value_uses_default(self):
        with patch.dict(os.environ, {"TEST_RETENTION": "invalid"}, clear=False):
            self.assertEqual(positive_int_env("TEST_RETENTION", 24), 24)


if __name__ == "__main__":
    unittest.main()
