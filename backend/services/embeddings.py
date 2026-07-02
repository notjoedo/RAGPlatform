from pathlib import Path

import httpx
from openai import OpenAI

from config import settings
from models import Provider


class EmbeddingService:
    async def embed_texts(
        self,
        texts: list[str],
        provider: Provider = Provider.ollama,
        api_key: str | None = None,
    ) -> list[list[float]]:
        if provider == Provider.openai:
            if not api_key:
                raise ValueError("OpenAI API key required for embeddings")
            return self._embed_openai(texts, api_key)
        return await self._embed_ollama(texts)

    async def embed_query(
        self,
        text: str,
        provider: Provider = Provider.ollama,
        api_key: str | None = None,
    ) -> list[float]:
        vectors = await self.embed_texts([text], provider=provider, api_key=api_key)
        return vectors[0]

    async def _embed_ollama(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            embeddings: list[list[float]] = []
            for text in texts:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/embeddings",
                    json={"model": settings.ollama_embed_model, "prompt": text},
                )
                response.raise_for_status()
                embeddings.append(response.json()["embedding"])
            return embeddings

    def _embed_openai(self, texts: list[str], api_key: str) -> list[list[float]]:
        client = OpenAI(api_key=api_key)
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]


embedding_service = EmbeddingService()
