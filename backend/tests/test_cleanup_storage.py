"""Tests for production upload/output retention cleanup."""

import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from services import cleanup_storage


class CleanupStorageTests(unittest.TestCase):
    def test_cleanup_removes_only_expired_regular_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old_file = root / "old.png"
            new_file = root / "new.png"
            old_file.write_bytes(b"old")
            new_file.write_bytes(b"new")

            now = time.time()
            os.utime(old_file, (now - 3 * 3600, now - 3 * 3600))
            os.utime(new_file, (now - 30 * 60, now - 30 * 60))

            removed_files, removed_bytes = cleanup_storage.cleanup_directory(
                root, retention_hours=2, now=now
            )

            self.assertEqual(removed_files, 1)
            self.assertEqual(removed_bytes, 3)
            self.assertFalse(old_file.exists())
            self.assertTrue(new_file.exists())

    def test_zero_retention_disables_cleanup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "keep.png"
            path.write_bytes(b"keep")

            removed_files, removed_bytes = cleanup_storage.cleanup_directory(
                root, retention_hours=0, now=time.time()
            )

            self.assertEqual((removed_files, removed_bytes), (0, 0))
            self.assertTrue(path.exists())

    def test_invalid_environment_values_fall_back_to_defaults(self):
        with patch.dict(
            os.environ,
            {
                "INFRARENDER_UPLOAD_RETENTION_HOURS": "invalid",
                "INFRARENDER_OUTPUT_RETENTION_HOURS": "-4",
            },
            clear=False,
        ):
            self.assertEqual(
                cleanup_storage.positive_int_env(
                    "INFRARENDER_UPLOAD_RETENTION_HOURS", 168
                ),
                168,
            )
            self.assertEqual(
                cleanup_storage.positive_int_env(
                    "INFRARENDER_OUTPUT_RETENTION_HOURS", 720
                ),
                0,
            )


if __name__ == "__main__":
    unittest.main()
