"""Durability and file ownership tests, always using temporary media directories."""

import os
import sqlite3
import tempfile
import time
import unittest
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from services.project_store import ProjectStore


class ProjectStoreTests(unittest.TestCase):
    def setUp(self):
        self.store_type = ProjectStore
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.uploads = self.root / "uploads"
        self.outputs = self.root / "outputs"
        self.uploads.mkdir()
        self.outputs.mkdir()
        self.db = self.root / "data" / "projects.sqlite3"
        self.store = ProjectStore(self.db, self.uploads, self.outputs)

    def file(self, directory, content=b"test image", days_old=0):
        filename = f"{uuid4().hex}.png"
        path = directory / filename
        path.write_bytes(content)
        age = time.time() - days_old * 86400
        os.utime(path, (age, age))
        return filename

    def assert_status(self, status, operation):
        with self.assertRaises(HTTPException) as caught:
            operation()
        self.assertEqual(caught.exception.status_code, status)

    def test_schema_migration_sets_user_version_and_is_idempotent(self):
        self.store.initialize()
        with closing(sqlite3.connect(self.db)) as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            empty = connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        self.assertEqual(version, 1)
        self.assertEqual(empty, 0)
        project = self.store.create("Giữ nguyên", {"prompt": "x"})
        reopened = ProjectStore(self.db, self.uploads, self.outputs)
        reopened.initialize()  # must not recreate or reset the schema
        self.assertEqual(reopened.get(project["id"])["name"], "Giữ nguyên")
        with closing(sqlite3.connect(self.db)) as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
        self.assertEqual(version, 1)

    def test_workspace_survives_new_store_instance_and_revision_increments(self):
        snapshot = {"prompt": "Phối cảnh cầu vượt", "settings": {"customKeywords": ["ban đêm"]}}
        project = self.store.create("Dự án cầu", snapshot)
        self.assertEqual(project["revision"], 1)
        reopened = self.store_type(self.db, self.uploads, self.outputs)
        self.assertEqual(reopened.get(project["id"])["workspace"]["prompt"], "Phối cảnh cầu vượt")
        updated = reopened.update(project["id"], "Cầu mới", {"notes": "Hướng Tây"}, 1)
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(self.store.get(project["id"])["name"], "Cầu mới")
        self.assertEqual(self.store.list()[0]["id"], project["id"])
        self.assertNotIn("workspace", self.store.list()[0])

    def test_simultaneous_edits_conflict_instead_of_losing_a_save(self):
        project = self.store.create("Cầu", {})
        barrier = Barrier(2)
        def update(name):
            store = self.store_type(self.db, self.uploads, self.outputs)
            barrier.wait()
            try:
                return store.update(project["id"], name, {"notes": name}, 1)["revision"]
            except HTTPException as exc:
                return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            self.assertCountEqual(list(executor.map(update, ["A", "B"])), [2, 409])
        current = self.store.get(project["id"])
        self.assertEqual(current["workspace"]["notes"], current["name"])

    def test_invalid_or_unbounded_snapshots_are_not_saved(self):
        cases = [
            {"unknown": "not workspace data"},
            {"prompt": "x" * 28001},
            {"settings": {"bad": float("nan")}},
            {"renderVersions": [{}] * 201},
            {"settings": {"nested": [[[[[[[[[{}]]]]]]]]]}},
        ]
        for snapshot in cases:
            with self.subTest(snapshot_keys=list(snapshot)):
                self.assert_status(422, lambda: self.store.create("Cầu", snapshot))
        self.assertEqual(self.store.list(), [])

    def test_missing_media_prevents_saving_broken_snapshot(self):
        missing = f"{uuid4().hex}.png"
        self.assert_status(409, lambda: self.store.create("Cầu", {"source": {"saved_name": missing}}))

    def test_stale_save_cannot_restore_reference_to_a_cleaned_file(self):
        name = self.file(self.outputs, b"old result", 40)
        project = self.store.create("Cầu", {})
        self.store.cleanup(dry_run=False)
        self.assert_status(409, lambda: self.store.update(
            project["id"], "Cầu", {"renderVersions": [{"name": name}]}, 1,
        ))
        self.assertEqual(self.store.get(project["id"])["revision"], 1)
        self.assertEqual(self.store.get(project["id"])["workspace"], {})

    def test_retention_treats_upload_and_output_ownership_separately(self):
        name = self.file(self.uploads, b"source", 40)
        output = self.outputs / name
        output.write_bytes(b"unreferenced output")
        os.utime(output, (1, 1))
        self.store.create("A", {"source": {"saved_name": name}})
        self.store.create("B", {"source": {"saved_name": name}})
        result = self.store.cleanup(dry_run=False)
        self.assertEqual([entry["kind"] for entry in result["deleted_files"]], ["outputs"])
        self.assertTrue((self.uploads / name).exists())
        self.assertFalse(output.exists())

    def test_project_deletion_keeps_shared_media_and_removes_exclusive_media(self):
        shared = self.file(self.uploads)
        render_source = self.file(self.uploads)
        exclusive = self.file(self.outputs)
        unrelated = self.file(self.outputs)
        first = self.store.create("A", {
            "source": {"saved_name": shared},
            "renderVersions": [{"name": exclusive, "source": {"saved_name": render_source}}],
        })
        second = self.store.create("B", {"source": {"saved_name": shared}})
        self.store.delete(first["id"])
        self.assert_status(404, lambda: self.store.get(first["id"]))
        self.assertTrue((self.uploads / shared).exists())
        self.assertFalse((self.uploads / render_source).exists())
        self.assertFalse((self.outputs / exclusive).exists())
        self.assertTrue((self.outputs / unrelated).exists())
        self.store.delete(second["id"])
        self.assertFalse((self.uploads / shared).exists())

    def test_explicit_file_delete_refuses_referenced_media(self):
        name = self.file(self.outputs)
        self.store.create("A", {"renderVersions": [{"name": name}]})
        self.assert_status(409, lambda: self.store.delete_file("outputs", name))
        self.assertTrue((self.outputs / name).exists())
        unused = self.file(self.uploads)
        self.assertTrue(self.store.delete_file("uploads", unused)["deleted"])
        self.assertFalse((self.uploads / unused).exists())

    def test_paths_cannot_escape_media_directories_or_delete_unmanaged_files(self):
        outside = self.root / "important.png"
        outside.write_bytes(b"keep me")
        legacy = self.uploads / "reference.png"
        legacy.write_bytes(b"keep me")
        for directory, name in [("uploads", "../important.png"), ("outputs", str(outside)),
                                ("uploads", "reference.png"), ("../", uuid4().hex + ".png")]:
            with self.subTest(directory=directory, name=name):
                self.assert_status(404, lambda: self.store.delete_file(directory, name))
        self.assertEqual(outside.read_bytes(), b"keep me")
        self.assertTrue(legacy.exists())

    def test_cleanup_defaults_to_preview_and_keeps_used_young_and_unmanaged_files(self):
        expired = self.file(self.outputs, b"remove", 31)
        young = self.file(self.outputs, b"young", 1)
        used = self.file(self.uploads, b"used", 100)
        self.store.create("A", {"source": {"saved_name": used}})
        legacy = self.outputs / "user-upload.png"
        legacy.write_bytes(b"legacy")
        os.utime(legacy, (0, 0))
        nested = self.outputs / "nested"
        nested.mkdir()
        nested_file = nested / f"{uuid4().hex}.png"
        nested_file.write_bytes(b"keep")
        preview = self.store.cleanup()
        self.assertTrue(preview["dry_run"])
        self.assertEqual([entry["name"] for entry in preview["candidates"]], [expired])
        self.assertTrue((self.outputs / expired).exists())
        result = self.store.cleanup(dry_run=False)
        self.assertEqual(result["reclaimed_bytes"], 6)
        self.assertFalse((self.outputs / expired).exists())
        for path in [self.outputs / young, self.uploads / used, legacy, nested_file]:
            self.assertTrue(path.exists(), str(path))

    def test_cleanup_and_explicit_delete_skip_symbolic_links(self):
        outside = self.root / "outside.png"
        outside.write_bytes(b"keep")
        link = self.outputs / f"{uuid4().hex}.png"
        try:
            link.symlink_to(outside)
        except OSError:
            self.skipTest("Creating symbolic links needs OS privileges on this machine.")
        self.assert_status(404, lambda: self.store.delete_file("outputs", link.name))
        self.assertEqual(self.store.cleanup(dry_run=False)["deleted_files"], [])
        self.assertTrue(outside.exists())

    def test_stats_report_bytes_and_project_count(self):
        self.file(self.uploads, b"123")
        self.file(self.outputs, b"12345")
        self.store.create("Cầu", {})
        stats = self.store.stats()
        self.assertEqual(stats["uploads"], {"count": 1, "bytes": 3})
        self.assertEqual(stats["outputs"], {"count": 1, "bytes": 5})
        self.assertEqual(stats["total_bytes"], 8)
        self.assertEqual(stats["projects"], 1)

    def test_media_operations_support_python_without_path_is_junction(self):
        name = self.file(self.outputs, b"expired", 31)
        # Python 3.11 lacks this Path method. Exercise real storage behavior in
        # that environment rather than asserting on a compatibility helper.
        def unavailable(_):
            raise AttributeError("Path.is_junction is not available on Python 3.11")
        with patch.object(type(self.outputs), "is_junction", new=property(unavailable), create=True):
            self.assertEqual(self.store.stats()["outputs"]["count"], 1)
            self.assertEqual(self.store.cleanup()["candidates"][0]["name"], name)
            self.assertTrue(self.store.delete_file("outputs", name)["deleted"])
        self.assertFalse((self.outputs / name).exists())


if __name__ == "__main__":
    unittest.main()
