import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Optional

from config import settings


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    Path(settings.sqlite_path).parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS pipelines (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                pipeline_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                status TEXT NOT NULL,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                file_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
            );
            """
        )


@contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(settings.sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def create_pipeline(name: str) -> dict:
    pipeline_id = str(uuid.uuid4())
    created_at = _utcnow()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO pipelines (id, name, created_at) VALUES (?, ?, ?)",
            (pipeline_id, name, created_at),
        )
    return {"id": pipeline_id, "name": name, "created_at": created_at}


def list_pipelines() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, created_at FROM pipelines ORDER BY created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def get_pipeline(pipeline_id: str) -> Optional[dict]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, created_at FROM pipelines WHERE id = ?",
            (pipeline_id,),
        ).fetchone()
    return dict(row) if row else None


def delete_pipeline(pipeline_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM pipelines WHERE id = ?", (pipeline_id,))
        conn.execute("DELETE FROM documents WHERE pipeline_id = ?", (pipeline_id,))
    return cursor.rowcount > 0


def create_document(
    pipeline_id: str,
    filename: str,
    file_path: str,
    status: str = "processing",
) -> dict:
    doc_id = str(uuid.uuid4())
    created_at = _utcnow()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO documents (id, pipeline_id, filename, status, chunk_count, error, file_path, created_at)
            VALUES (?, ?, ?, ?, 0, NULL, ?, ?)
            """,
            (doc_id, pipeline_id, filename, status, file_path, created_at),
        )
    return {
        "id": doc_id,
        "pipeline_id": pipeline_id,
        "filename": filename,
        "status": status,
        "chunk_count": 0,
        "error": None,
        "file_path": file_path,
        "created_at": created_at,
    }


def update_document(
    doc_id: str,
    status: str,
    chunk_count: int = 0,
    error: Optional[str] = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE documents
            SET status = ?, chunk_count = ?, error = ?
            WHERE id = ?
            """,
            (status, chunk_count, error, doc_id),
        )


def list_documents(pipeline_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, pipeline_id, filename, status, chunk_count, error, file_path, created_at
            FROM documents
            WHERE pipeline_id = ?
            ORDER BY created_at DESC
            """,
            (pipeline_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_document(doc_id: str) -> Optional[dict]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, pipeline_id, filename, status, chunk_count, error, file_path, created_at
            FROM documents
            WHERE id = ?
            """,
            (doc_id,),
        ).fetchone()
    return dict(row) if row else None
