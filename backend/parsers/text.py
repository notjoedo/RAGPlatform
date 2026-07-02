from pathlib import Path


def parse_text(file_path: Path) -> str:
    return file_path.read_text(encoding="utf-8", errors="replace")
