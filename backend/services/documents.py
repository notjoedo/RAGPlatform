from pathlib import Path

import database as db
from services.chroma_store import delete_document_chunks


def remove_document(doc: dict, pipeline_id: str) -> None:
    file_path = Path(doc["file_path"])
    if file_path.exists():
        file_path.unlink()

    delete_document_chunks(pipeline_id, doc["id"])
    db.delete_document(doc["id"], pipeline_id)


def list_available_documents(pipeline_id: str) -> list[dict]:
    docs = db.list_documents(pipeline_id)
    available: list[dict] = []

    for doc in docs:
        if Path(doc["file_path"]).exists():
            available.append(doc)
        else:
            remove_document(doc, pipeline_id)

    return available
