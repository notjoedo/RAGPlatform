from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings

from config import settings

_client: chromadb.ClientAPI | None = None


def get_chroma_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        Path(settings.chroma_persist_dir).mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def collection_name(pipeline_id: str) -> str:
    return f"pipeline_{pipeline_id.replace('-', '_')}"


def get_collection(pipeline_id: str):
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=collection_name(pipeline_id),
        metadata={"hnsw:space": "cosine"},
    )


def delete_collection(pipeline_id: str) -> None:
    client = get_chroma_client()
    name = collection_name(pipeline_id)
    try:
        client.delete_collection(name)
    except (ValueError, chromadb.errors.NotFoundError):
        pass
