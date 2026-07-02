from pathlib import Path

from parsers.pdf import parse_pdf
from parsers.text import parse_text
from services.chroma_store import get_collection
from services.embeddings import embedding_service


SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}


def parse_document(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return parse_pdf(file_path)
    if suffix in {".txt", ".md"}:
        return parse_text(file_path)
    raise ValueError(f"Unsupported file type: {suffix}")


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        if chunk.strip():
            chunks.append(chunk)
        if end >= len(words):
            break
        start = end - overlap
    return chunks


async def ingest_text(
    pipeline_id: str,
    doc_id: str,
    filename: str,
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> int:
    chunks = chunk_text(text, chunk_size=chunk_size, overlap=chunk_overlap)
    if not chunks:
        raise ValueError("No text content found in document")

    embeddings = await embedding_service.embed_texts(chunks)
    collection = get_collection(pipeline_id)

    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [{"filename": filename, "doc_id": doc_id, "chunk_index": i} for i in range(len(chunks))]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
    )
    return len(chunks)


async def ingest_document(
    pipeline_id: str,
    doc_id: str,
    filename: str,
    file_path: Path,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> int:
    text = parse_document(file_path)
    return await ingest_text(
        pipeline_id=pipeline_id,
        doc_id=doc_id,
        filename=filename,
        text=text,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
