from config import settings
from models import Provider
from services.chroma_store import get_collection
from services.embeddings import embedding_service


async def retrieve_context(
    pipeline_id: str,
    query: str,
    provider: Provider = Provider.ollama,
    api_key: str | None = None,
    top_k: int | None = None,
) -> str:
    collection = get_collection(pipeline_id)
    if collection.count() == 0:
        return ""

    query_embedding = await embedding_service.embed_query(
        query, provider=provider, api_key=api_key
    )
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k or settings.top_k,
        include=["documents", "metadatas", "distances"],
    )

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    if not documents:
        return ""

    chunks: list[str] = []
    for doc, meta, dist in zip(documents, metadatas, distances or [None] * len(documents)):
        filename = meta.get("filename", "unknown")
        # include distance to help downstream heuristics if needed
        if dist is None:
            chunks.append(f"[{filename}]\n{doc}")
        else:
            chunks.append(f"[{filename}]\n{doc}")

    return "\n\n---\n\n".join(chunks)
