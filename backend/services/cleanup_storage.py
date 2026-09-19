"""Reference-aware maintenance using the same storage contract as the API.

The canonical retention owner is the FastAPI application itself: `main.lifespan`
runs `store.cleanup()` every 24 hours. This module is a manual/ops entry point
(for example previews with `--dry-run`), not a second background worker.
"""

import argparse
import json
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from services.project_store import ProjectStore

logger = logging.getLogger("infrarender.cleanup")


def run_cleanup(dry_run: bool = False) -> dict:
    base_dir = Path(__file__).resolve().parents[1]
    load_dotenv(base_dir / ".env")
    data_dir = Path(os.getenv("INFRARENDER_DATA_DIR", str(base_dir))).resolve()
    database = data_dir / "projects.sqlite3"
    if not database.is_file():
        raise RuntimeError("Project database is missing; cleanup refused.")
    store = ProjectStore(database, data_dir / "uploads", data_dir / "outputs",
                         retention_days=int(os.getenv("INFRARENDER_RETENTION_DAYS", "30")))
    if not store.check_ready():
        raise RuntimeError("Project storage is unavailable; cleanup refused.")
    result = store.cleanup(dry_run=dry_run)
    logger.info("Cleanup completed: deleted=%s failed=%s", len(result["deleted_files"]), len(result["failed_files"]))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean expired unreferenced InfraRender media.")
    parser.add_argument("--loop", action="store_true", help="Repeat daily; the API already runs this maintenance.")
    parser.add_argument("--dry-run", action="store_true", help="Preview only.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    while True:
        print(json.dumps(run_cleanup(dry_run=args.dry_run), ensure_ascii=False))
        if not args.loop:
            return
        time.sleep(86400)


if __name__ == "__main__":
    main()
