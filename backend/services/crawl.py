import math
from collections import deque
from pathlib import Path
from typing import Iterable

import database as db
from config import settings
from parsers.url import (
    display_name_for_url,
    extract_links,
    fetch_url_html,
    fetch_url_text,
    normalize_url,
    same_domain,
    validate_url,
)
from services.embeddings import embedding_service
from services.ingest import ingest_text


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


def _read_seed_urls(docs: list[dict]) -> list[str]:
    urls: list[str] = []
    for d in docs:
        file_path = d.get("file_path")
        if not isinstance(file_path, str):
            continue
        # URL docs are stored as text files containing the URL.
        if not (
            file_path.endswith(".url.txt")
            or file_path.endswith(".crawl.url.txt")
            or file_path.endswith(".url.txt".replace(".url", ".crawl.url"))  # harmless legacy guard
        ):
            continue
        try:
            url = Path(file_path).read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            continue
        if url:
            urls.append(url)
    # de-dupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        nu = normalize_url(u)
        if nu in seen:
            continue
        seen.add(nu)
        out.append(nu)
    return out


async def crawl_and_ingest_if_needed(
    pipeline_id: str,
    query: str,
    existing_context: str,
    max_pages: int = 20,
    max_depth: int = 2,
    min_similarity: float = 0.25,
) -> bool:
    """
    If retrieval produced no context but we have URL sources, crawl them and ingest relevant pages.
    Returns True if a crawl was performed.
    """
    if existing_context.strip():
        return False

    docs = db.list_documents(pipeline_id)
    seed_urls = _read_seed_urls(docs)
    if not seed_urls:
        return False

    # precompute query embedding once
    query_embedding = await embedding_service.embed_query(query)

    visited: set[str] = set()
    q: deque[tuple[str, int, str]] = deque()
    for u in seed_urls:
        try:
            validate_url(u)
        except ValueError:
            continue
        q.append((u, 0, u))

    pages_seen = 0
    crawled = False

    while q and pages_seen < max_pages:
        url, depth, seed = q.popleft()
        url = normalize_url(url)
        if url in visited:
            continue
        visited.add(url)
        pages_seen += 1
        crawled = True

        try:
            html = await fetch_url_html(url)
            links = extract_links(html, url)
        except Exception:
            links = []

        try:
            text = await fetch_url_text(url)
        except Exception:
            continue

        snippet = " ".join(text.split()[:1800])
        page_embedding = (await embedding_service.embed_texts([snippet]))[0]
        score = _cosine_similarity(query_embedding, page_embedding)

        if score >= min_similarity:
            filename = display_name_for_url(url)
            upload_dir = Path(settings.upload_dir) / pipeline_id
            upload_dir.mkdir(parents=True, exist_ok=True)

            doc_id = db.create_document(
                pipeline_id=pipeline_id,
                filename=filename,
                file_path=str((upload_dir / "placeholder.crawl.url.txt")),
                status="processing",
            )["id"]

            # overwrite file_path with stable doc_id filename
            file_path = upload_dir / f"{doc_id}.crawl.url.txt"
            file_path.write_text(url, encoding="utf-8")
            with db.get_connection() as conn:
                conn.execute(
                    "UPDATE documents SET file_path = ? WHERE id = ?",
                    (str(file_path), doc_id),
                )

            try:
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

        if depth >= max_depth:
            continue

        for link in links:
            if pages_seen + len(q) >= max_pages:
                break
            try:
                validate_url(link)
            except ValueError:
                continue
            if not same_domain(seed, link):
                continue
            if link not in visited:
                q.append((link, depth + 1, seed))

    return crawled

