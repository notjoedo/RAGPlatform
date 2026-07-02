import math
from collections import deque
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status

import database as db
from auth import require_api_key
from config import settings
from models import DocumentCrawlCreate, DocumentLinkCreate, DocumentResponse, DocumentStatus
from parsers.url import (
    display_name_for_url,
    extract_links,
    fetch_url_html,
    fetch_url_text,
    normalize_url,
    same_domain,
    validate_url,
)
from services.ingest import SUPPORTED_EXTENSIONS, ingest_document, ingest_text
from services.embeddings import embedding_service

router = APIRouter(prefix="/pipelines/{pipeline_id}/documents", tags=["documents"])


def _ensure_pipeline(pipeline_id: str) -> dict:
    pipeline = db.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline


async def _process_document(
    pipeline_id: str,
    doc_id: str,
    filename: str,
    file_path: Path,
) -> None:
    try:
        chunk_count = await ingest_document(
            pipeline_id=pipeline_id,
            doc_id=doc_id,
            filename=filename,
            file_path=file_path,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        db.update_document(doc_id, status="ready", chunk_count=chunk_count)
    except Exception as exc:
        db.update_document(doc_id, status="failed", error=str(exc))


async def _process_link(
    pipeline_id: str,
    doc_id: str,
    filename: str,
    url: str,
) -> None:
    try:
        text = await fetch_url_text(url)
        chunk_count = await ingest_text(
            pipeline_id=pipeline_id,
            doc_id=doc_id,
            filename=filename,
            text=text,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        db.update_document(doc_id, status="ready", chunk_count=chunk_count)
    except Exception as exc:
        db.update_document(doc_id, status="failed", error=str(exc))


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    denom = math.sqrt(na) * math.sqrt(nb)
    return dot / denom if denom else 0.0


async def _process_crawl(
    pipeline_id: str,
    seed_url: str,
    query: str,
    max_pages: int,
    max_depth: int,
    min_similarity: float,
) -> None:
    seed_url = normalize_url(seed_url)
    validate_url(seed_url)

    # precompute query embedding once (Ollama embedding model)
    query_embedding = await embedding_service.embed_query(query)

    visited: set[str] = set()
    q: deque[tuple[str, int]] = deque([(seed_url, 0)])
    pages_seen = 0

    while q and pages_seen < max_pages:
        url, depth = q.popleft()
        if url in visited:
            continue
        visited.add(url)
        pages_seen += 1

        try:
            html = await fetch_url_html(url)
            links = extract_links(html, url)
        except Exception:
            # If not HTML (or fetch fails), still try extracting text for relevance.
            links = []

        try:
            text = await fetch_url_text(url)
        except Exception:
            continue

        # For relevance we embed a trimmed slice (avoid huge pages)
        snippet = " ".join(text.split()[:1800])
        page_embedding = (await embedding_service.embed_texts([snippet]))[0]
        score = _cosine_similarity(query_embedding, page_embedding)

        if score >= min_similarity:
            filename = display_name_for_url(url)
            upload_dir = Path(settings.upload_dir) / pipeline_id
            upload_dir.mkdir(parents=True, exist_ok=True)

            doc_id = str(uuid.uuid4())
            file_path = upload_dir / f"{doc_id}.crawl.url.txt"
            file_path.write_text(url, encoding="utf-8")

            doc = db.create_document(
                pipeline_id=pipeline_id,
                filename=filename,
                file_path=str(file_path),
                status="processing",
            )
            try:
                chunk_count = await ingest_text(
                    pipeline_id=pipeline_id,
                    doc_id=doc["id"],
                    filename=filename,
                    text=text,
                    chunk_size=settings.chunk_size,
                    chunk_overlap=settings.chunk_overlap,
                )
                db.update_document(doc["id"], status="ready", chunk_count=chunk_count)
            except Exception as exc:
                db.update_document(doc["id"], status="failed", error=str(exc))

        if depth >= max_depth:
            continue

        # enqueue same-domain links
        for link in links:
            if pages_seen + len(q) >= max_pages:
                break
            try:
                validate_url(link)
            except ValueError:
                continue
            if not same_domain(seed_url, link):
                continue
            if link not in visited:
                q.append((link, depth + 1))


def _queue_upload(
    pipeline_id: str,
    filename: str,
    content: bytes,
    background_tasks: BackgroundTasks,
) -> DocumentResponse:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type for {filename}. Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=400, detail=f"{filename} exceeds 10 MB limit")

    upload_dir = Path(settings.upload_dir) / pipeline_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    doc_id = str(uuid.uuid4())
    file_path = upload_dir / f"{doc_id}{suffix}"
    file_path.write_bytes(content)

    doc = db.create_document(
        pipeline_id=pipeline_id,
        filename=filename,
        file_path=str(file_path),
        status="processing",
    )

    background_tasks.add_task(
        _process_document,
        pipeline_id,
        doc["id"],
        filename,
        file_path,
    )

    return DocumentResponse(
        id=doc["id"],
        pipeline_id=pipeline_id,
        filename=filename,
        status=DocumentStatus.processing,
        chunk_count=0,
        created_at=doc["created_at"],
    )


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    _: None = Depends(require_api_key),
) -> DocumentResponse:
    _ensure_pipeline(pipeline_id)

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    content = await file.read()
    return _queue_upload(pipeline_id, file.filename, content, background_tasks)


@router.post("/batch", response_model=list[DocumentResponse], status_code=status.HTTP_201_CREATED)
async def upload_documents_batch(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    _: None = Depends(require_api_key),
) -> list[DocumentResponse]:
    _ensure_pipeline(pipeline_id)

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > settings.max_batch_files:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum is {settings.max_batch_files}",
        )

    responses: list[DocumentResponse] = []
    for file in files:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Filename required")
        content = await file.read()
        responses.append(_queue_upload(pipeline_id, file.filename, content, background_tasks))

    return responses


@router.post("/link", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def ingest_link(
    pipeline_id: str,
    body: DocumentLinkCreate,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_api_key),
) -> DocumentResponse:
    _ensure_pipeline(pipeline_id)

    try:
        validate_url(body.url)
        filename = display_name_for_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    upload_dir = Path(settings.upload_dir) / pipeline_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    doc_id = str(uuid.uuid4())
    file_path = upload_dir / f"{doc_id}.url.txt"
    file_path.write_text(body.url, encoding="utf-8")

    doc = db.create_document(
        pipeline_id=pipeline_id,
        filename=filename,
        file_path=str(file_path),
        status="processing",
    )

    background_tasks.add_task(
        _process_link,
        pipeline_id,
        doc["id"],
        filename,
        body.url,
    )

    return DocumentResponse(
        id=doc["id"],
        pipeline_id=pipeline_id,
        filename=filename,
        status=DocumentStatus.processing,
        chunk_count=0,
        created_at=doc["created_at"],
    )


@router.post("/crawl", status_code=status.HTTP_202_ACCEPTED)
async def crawl_site(
    pipeline_id: str,
    body: DocumentCrawlCreate,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_api_key),
) -> dict:
    _ensure_pipeline(pipeline_id)

    try:
        validate_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(
        _process_crawl,
        pipeline_id,
        body.url,
        body.query,
        body.max_pages,
        body.max_depth,
        body.min_similarity,
    )

    return {"status": "started"}


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    pipeline_id: str,
    _: None = Depends(require_api_key),
) -> list[DocumentResponse]:
    _ensure_pipeline(pipeline_id)
    docs = db.list_documents(pipeline_id)
    # db returns file_path too; response model does not include it.
    return [DocumentResponse(**{k: v for k, v in d.items() if k != "file_path"}) for d in docs]
