"""Durable workspace snapshots and conservative ownership-aware media retention.

All mutations acquire SQLite's write lock. A save checks that its referenced files
still exist while holding that lock, so cleanup cannot race a successful save.
Only direct, UUID-named regular files inside the configured media roots are managed.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import json
import logging
import math
import os
from pathlib import Path
import re
import sqlite3
from threading import Lock
import time
import tempfile
from typing import Any, Annotated, Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError


logger = logging.getLogger(__name__)
MEDIA_NAME = re.compile(r"^[a-f0-9]{32}\.(?:png|jpg|jpeg|webp)$")
MAX_WORKSPACE_BYTES = 4 * 1024 * 1024
ShortText = Annotated[str, StringConstraints(strict=True, max_length=200)]


class WorkspaceSnapshot(BaseModel):
    """Root shape is explicit; nested snapshots may carry bounded provider metadata."""

    model_config = ConfigDict(extra="forbid", strict=True)
    schemaVersion: int = Field(default=1, ge=1, le=100)
    projectName: ShortText = ""
    source: dict[str, Any] | None = None
    settings: dict[str, Any] = Field(default_factory=dict)
    notes: str = Field(default="", max_length=5000)
    prompt: str = Field(default="", max_length=28000)
    negativePrompt: str = Field(default="", max_length=4000)
    versions: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    activeVersion: ShortText | None = None
    generatedFrom: str = Field(default="", max_length=50000)
    renderVersions: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    renderHistory: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    activeRenderId: ShortText | None = None
    promptMode: Literal["rules", "template", "ai", "vision", "refine"] = "rules"
    promptAnalysis: list[str] = Field(default_factory=list, max_length=100)
    promptModel: ShortText | None = None
    renderedImage: dict[str, Any] | None = None


def _validate_json(value: Any, depth: int = 0, budget: list[int] | None = None) -> None:
    """Bound arbitrary nested metadata before serializing it into SQLite."""
    if budget is None:
        budget = [25000]
    budget[0] -= 1
    if budget[0] < 0 or depth > 8:
        raise ValueError("Workspace is too complex")
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, str):
        if len(value) > 50000:
            raise ValueError("Text exceeds limit")
    elif isinstance(value, (int, float)):
        if not math.isfinite(value) or abs(value) > 10**16:
            raise ValueError("Number is outside the supported range")
    elif isinstance(value, list):
        if len(value) > 500:
            raise ValueError("List exceeds limit")
        for item in value:
            _validate_json(item, depth + 1, budget)
    elif isinstance(value, dict):
        if len(value) > 100:
            raise ValueError("Object exceeds limit")
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 100 or key in {"__proto__", "constructor", "prototype"}:
                raise ValueError("Invalid metadata key")
            _validate_json(item, depth + 1, budget)
    else:
        raise ValueError("Workspace must contain only JSON data")


def safe_media_path(directory: Path, filename: str) -> Path:
    """Resolve one managed filename, refusing traversal, links and directories."""
    if not isinstance(filename, str) or not MEDIA_NAME.fullmatch(filename):
        raise HTTPException(404, "Không tìm thấy tệp ảnh hợp lệ.")
    directory = Path(directory).absolute()
    candidate = directory / filename
    if _is_link(directory) or _is_link(candidate):
        raise HTTPException(404, "Không tìm thấy tệp ảnh hợp lệ.")
    if candidate.resolve().parent != directory.resolve() or (candidate.exists() and not candidate.is_file()):
        raise HTTPException(404, "Không tìm thấy tệp ảnh hợp lệ.")
    return candidate


def _is_link(path: Path) -> bool:
    # Path.is_junction was added in Python 3.12; production also supports 3.11.
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()


def _project_id(value: str) -> str:
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(404, "Không tìm thấy dự án.") from exc


def _media_references(workspace: dict) -> set[tuple[str, str]]:
    references: set[tuple[str, str]] = set()

    def add(kind, data, field):
        if data is None:
            return
        if not isinstance(data, dict):
            raise ValueError("Image metadata must be an object")
        filename = data.get(field)
        if filename is not None:
            if not isinstance(filename, str) or not MEDIA_NAME.fullmatch(filename):
                raise ValueError("Image filename is not managed by this application")
            references.add((kind, filename))

    add("uploads", workspace.get("source"), "saved_name")
    add("outputs", workspace.get("renderedImage"), "name")
    for version in workspace.get("renderVersions", []):
        add("outputs", version, "name")
        add("uploads", version.get("source"), "saved_name")
    for version in workspace.get("renderHistory", []):
        add("outputs", version.get("result"), "name")
        add("uploads", version.get("source"), "saved_name")
    return references


def _snapshot(name: str, workspace: dict) -> tuple[str, str, set[tuple[str, str]]]:
    try:
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 200:
            raise ValueError("Project name must contain 1 to 200 characters")
        _validate_json(workspace)
        # Validate without filling absent fields, preserving the client's snapshot.
        data = WorkspaceSnapshot.model_validate(workspace).model_dump(exclude_unset=True)
        references = _media_references(data)
        encoded = json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > MAX_WORKSPACE_BYTES:
            raise ValueError("Workspace exceeds the storage limit")
        return name.strip(), encoded, references
    except (ValueError, TypeError, OverflowError, RecursionError, ValidationError) as exc:
        raise HTTPException(422, "Dữ liệu dự án không hợp lệ hoặc vượt giới hạn lưu trữ.") from exc


class ProjectStore:
    def __init__(self, db_path: Path, upload_dir: Path, output_dir: Path, retention_days: int = 30):
        if type(retention_days) is not int or not 1 <= retention_days <= 3650:
            raise ValueError("retention_days must be between 1 and 3650")
        self.db_path = Path(db_path)
        self.directories = {"uploads": Path(upload_dir), "outputs": Path(output_dir)}
        self.retention_days = retention_days
        self._initialized = False
        self._initialization_lock = Lock()

    def initialize(self) -> None:
        if self._initialized:
            return
        with self._initialization_lock:
            if self._initialized:
                return
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.db_path, timeout=15)
            try:
                connection.execute("PRAGMA journal_mode=WAL")
                version = connection.execute("PRAGMA user_version").fetchone()[0]
                self._migrate(connection, version)
                connection.commit()
                self._initialized = True
            finally:
                connection.close()

    @staticmethod
    def _migrate(connection: sqlite3.Connection, current: int) -> None:
        """Apply schema migrations in order using PRAGMA user_version.

        Version 1: the original projects table this store has always used.
        Future schema changes must be additive migrations applied in the same
        transaction as the user_version bump, so an interrupted migration rolls
        back cleanly. Run smoke tests before bumping the version.
        """
        if current < 1:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL,
                    updated_at TEXT NOT NULL, workspace TEXT NOT NULL
                )"""
            )
            current = 1
        # Example for a future schema change:
        # if current < 2:
        #     connection.execute("ALTER TABLE projects ADD COLUMN ...")
        #     current = 2
        connection.execute(f"PRAGMA user_version = {int(current)}")

    @contextmanager
    def _connection(self, write: bool = False):
        self.initialize()
        connection = sqlite3.connect(self.db_path, timeout=15)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield connection
            connection.commit()
        except sqlite3.Error as exc:
            connection.rollback()
            logger.exception("Project database operation failed")
            raise HTTPException(503, "Kho dự án đang bận hoặc không thể ghi dữ liệu. Vui lòng thử lại.") from exc
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    def check_ready(self) -> bool:
        """Probe the actual database and media roots without changing projects."""
        try:
            # A lost mount must not silently become a new empty database.
            if not self.db_path.is_file():
                return False
            connection = sqlite3.connect(self.db_path, timeout=1)
            try:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute("UPDATE projects SET revision = revision WHERE id = ''")
                connection.rollback()
            finally:
                connection.close()
            for directory in self.directories.values():
                if not directory.is_dir() or _is_link(directory):
                    return False
                descriptor, name = tempfile.mkstemp(prefix=".readiness-", dir=directory)
                try:
                    with os.fdopen(descriptor, "wb") as probe:
                        probe.write(b"ready")
                        probe.flush()
                        os.fsync(probe.fileno())
                finally:
                    Path(name).unlink(missing_ok=True)
            return True
        except (OSError, sqlite3.Error):
            logger.warning("Storage readiness check failed")
            return False

    @staticmethod
    def _document(row) -> dict:
        if row is None:
            raise HTTPException(404, "Không tìm thấy dự án.")
        data = dict(row)
        data["workspace"] = json.loads(data["workspace"])
        return data

    def _check_media(self, references: set[tuple[str, str]]) -> None:
        for kind, filename in references:
            try:
                exists = safe_media_path(self.directories[kind], filename).is_file()
            except HTTPException:
                exists = False
            if not exists:
                raise HTTPException(409, "Ảnh của dự án không còn trên máy chủ. Hãy tải lại ảnh trước khi lưu.")

    @staticmethod
    def _all_references(connection) -> set[tuple[str, str]]:
        references: set[tuple[str, str]] = set()
        for row in connection.execute("SELECT workspace FROM projects"):
            references.update(_media_references(json.loads(row[0])))
        return references

    def create(self, name: str, workspace: dict) -> dict:
        name, encoded, references = _snapshot(name, workspace)
        project_id = str(uuid4())
        updated_at = datetime.now(timezone.utc).isoformat()
        with self._connection(write=True) as connection:
            self._check_media(references)
            connection.execute("INSERT INTO projects VALUES (?, ?, 1, ?, ?)", (project_id, name, updated_at, encoded))
        return {"id": project_id, "name": name, "revision": 1, "updated_at": updated_at, "workspace": json.loads(encoded)}

    def get(self, project_id: str) -> dict:
        project_id = _project_id(project_id)
        with self._connection() as connection:
            return self._document(connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone())

    def list(self) -> list[dict]:
        with self._connection() as connection:
            return [dict(row) for row in connection.execute("SELECT id, name, revision, updated_at FROM projects ORDER BY updated_at DESC, id")]

    def update(self, project_id: str, name: str, workspace: dict, revision: int) -> dict:
        project_id = _project_id(project_id)
        name, encoded, references = _snapshot(name, workspace)
        if type(revision) is not int or revision < 1:
            raise HTTPException(422, "Phiên bản dự án không hợp lệ.")
        updated_at = datetime.now(timezone.utc).isoformat()
        with self._connection(write=True) as connection:
            current = connection.execute("SELECT revision FROM projects WHERE id = ?", (project_id,)).fetchone()
            if current is None:
                raise HTTPException(404, "Không tìm thấy dự án.")
            if current[0] != revision:
                raise HTTPException(409, "Dự án đã thay đổi ở cửa sổ khác. Hãy mở lại bản mới nhất trước khi lưu.")
            self._check_media(references)
            connection.execute("UPDATE projects SET name = ?, workspace = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?", (name, encoded, updated_at, project_id, revision))
        return {"id": project_id, "name": name, "revision": revision + 1, "updated_at": updated_at, "workspace": json.loads(encoded)}

    def _remove_files(self, references: set[tuple[str, str]], protected: set[tuple[str, str]]) -> tuple[list[dict], list[dict]]:
        deleted, failed = [], []
        for kind, filename in sorted(references - protected):
            try:
                path = safe_media_path(self.directories[kind], filename)
                if not path.exists():
                    continue
                size = path.stat().st_size
                path.unlink()
                deleted.append({"kind": kind, "name": filename, "bytes": size})
            except (HTTPException, OSError):
                failed.append({"kind": kind, "name": filename})
                logger.warning("Could not remove managed media file %s/%s", kind, filename)
        return deleted, failed

    def delete(self, project_id: str) -> dict:
        project_id = _project_id(project_id)
        with self._connection(write=True) as connection:
            document = self._document(connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone())
            references = _media_references(document["workspace"])
            connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        # Commit the project deletion first: a failed commit must not destroy its files.
        # A second write lock prevents saves while we recheck ownership and unlink.
        with self._connection(write=True) as connection:
            deleted, failed = self._remove_files(references, self._all_references(connection))
        return {"id": project_id, "deleted_files": deleted, "failed_files": failed}

    def delete_file(self, directory: str, filename: str) -> dict:
        if directory not in self.directories:
            raise HTTPException(404, "Không tìm thấy thư mục ảnh.")
        with self._connection(write=True) as connection:
            path = safe_media_path(self.directories[directory], filename)
            if (directory, filename) in self._all_references(connection):
                raise HTTPException(409, "Ảnh đang được dự án sử dụng. Hãy xóa ảnh khỏi dự án trước.")
            if not path.exists():
                raise HTTPException(404, "Không tìm thấy tệp ảnh.")
            deleted, failed = self._remove_files({(directory, filename)}, set())
            if failed or not deleted:
                raise HTTPException(503, "Không thể xóa tệp ảnh. Vui lòng thử lại.")
        return {"kind": directory, "name": filename, "deleted": True}

    def _files(self):
        for kind, directory in self.directories.items():
            if not directory.exists() or _is_link(directory):
                continue
            for candidate in directory.iterdir():
                try:
                    path = safe_media_path(directory, candidate.name)
                    if path.is_file():
                        yield kind, path, path.stat()
                except (HTTPException, OSError):
                    continue

    def cleanup(self, dry_run: bool = True, retention_days: int | None = None) -> dict:
        days = self.retention_days if retention_days is None else retention_days
        if type(days) is not int or not 1 <= days <= 3650 or type(dry_run) is not bool:
            raise HTTPException(422, "Thời gian lưu trữ phải từ 1 đến 3650 ngày.")
        cutoff = time.time() - days * 86400
        with self._connection(write=True) as connection:
            protected = self._all_references(connection)
            candidates = [
                {"kind": kind, "name": path.name, "bytes": stat.st_size}
                for kind, path, stat in self._files()
                if stat.st_mtime < cutoff and (kind, path.name) not in protected
            ]
            deleted, failed = ([], []) if dry_run else self._remove_files(
                {(entry["kind"], entry["name"]) for entry in candidates}, protected,
            )
        return {"dry_run": dry_run, "retention_days": days, "candidates": candidates,
                "deleted_files": deleted, "failed_files": failed,
                "reclaimed_bytes": sum(entry["bytes"] for entry in deleted)}

    def stats(self) -> dict:
        counts = {kind: {"count": 0, "bytes": 0} for kind in self.directories}
        for kind, _, stat in self._files():
            counts[kind]["count"] += 1
            counts[kind]["bytes"] += stat.st_size
        with self._connection() as connection:
            projects = connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        return {**counts, "total_bytes": sum(item["bytes"] for item in counts.values()),
                "projects": projects, "retention_days": self.retention_days}
