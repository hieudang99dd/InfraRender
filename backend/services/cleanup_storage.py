"""Periodic retention cleanup for uploaded references and rendered outputs."""

import argparse
import logging
import os
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"

logger = logging.getLogger("infrarender.cleanup")


def positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(0, value)


def cleanup_directory(directory: Path, retention_hours: int, now: float | None = None) -> tuple[int, int]:
    """Delete regular files older than the configured retention period."""
    if retention_hours <= 0:
        return (0, 0)

    current = time.time() if now is None else now
    cutoff = current - (retention_hours * 3600)
    removed_files = 0
    removed_bytes = 0

    directory.mkdir(parents=True, exist_ok=True)
    for path in directory.iterdir():
        try:
            if path.is_symlink() or not path.is_file():
                continue
            stat = path.stat()
            if stat.st_mtime >= cutoff:
                continue
            size = stat.st_size
            path.unlink()
            removed_files += 1
            removed_bytes += size
        except OSError:
            logger.exception("cleanup failed path=%s", path.name)

    return (removed_files, removed_bytes)


def run_cleanup() -> dict[str, int]:
    upload_hours = positive_int_env("INFRARENDER_UPLOAD_RETENTION_HOURS", 168)
    output_hours = positive_int_env("INFRARENDER_OUTPUT_RETENTION_HOURS", 720)

    upload_files, upload_bytes = cleanup_directory(UPLOAD_DIR, upload_hours)
    output_files, output_bytes = cleanup_directory(OUTPUT_DIR, output_hours)
    result = {
        "upload_files": upload_files,
        "upload_bytes": upload_bytes,
        "output_files": output_files,
        "output_bytes": output_bytes,
    }
    logger.info(
        "cleanup completed upload_files=%s upload_bytes=%s output_files=%s output_bytes=%s",
        upload_files,
        upload_bytes,
        output_files,
        output_bytes,
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean expired InfraRender files.")
    parser.add_argument("--loop", action="store_true", help="Run continuously.")
    args = parser.parse_args()

    logging.basicConfig(
        level=os.getenv("INFRARENDER_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    if not args.loop:
        run_cleanup()
        return

    interval = positive_int_env("INFRARENDER_CLEANUP_INTERVAL_SECONDS", 21600)
    interval = max(interval, 300)
    while True:
        run_cleanup()
        time.sleep(interval)


if __name__ == "__main__":
    main()
