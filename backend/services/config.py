"""Read configuration from environment variables or mounted secret files."""

import os
from pathlib import Path


def env_or_file(name: str, default: str = "") -> str:
    """Return NAME_FILE contents when configured, otherwise NAME, otherwise default."""
    file_path = os.getenv(f"{name}_FILE", "").strip()
    if file_path:
        try:
            return Path(file_path).read_text(encoding="utf-8").strip()
        except OSError:
            return ""
    return os.getenv(name, default).strip()
