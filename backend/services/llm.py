from collections.abc import AsyncIterator

import httpx
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from config import settings
from models import Provider


RAG_SYSTEM_PROMPT = """Answer only from the provided context. If the answer is not in the context, say you don't know.
Cite sources using [filename] notation when referencing specific information.

Context:
{context}"""


class LLMService:
    async def stream_chat(
        self,
        message: str,
        context: str,
        provider: Provider = Provider.ollama,
        api_key: str | None = None,
    ) -> AsyncIterator[str]:
        system = RAG_SYSTEM_PROMPT.format(context=context)
        if provider == Provider.openai:
            if not api_key:
                raise ValueError("OpenAI API key required")
            async for chunk in self._stream_openai(system, message, api_key):
                yield chunk
        elif provider == Provider.anthropic:
            if not api_key:
                raise ValueError("Anthropic API key required")
            async for chunk in self._stream_anthropic(system, message, api_key):
                yield chunk
        else:
            async for chunk in self._stream_ollama(system, message):
                yield chunk

    async def _stream_ollama(self, system: str, message: str) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": settings.ollama_chat_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": message},
                    ],
                    "stream": True,
                },
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    import json

                    data = json.loads(line)
                    if content := data.get("message", {}).get("content"):
                        yield content
                    if data.get("done"):
                        break

    async def _stream_openai(
        self, system: str, message: str, api_key: str
    ) -> AsyncIterator[str]:
        client = AsyncOpenAI(api_key=api_key)
        stream = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": message},
            ],
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _stream_anthropic(
        self, system: str, message: str, api_key: str
    ) -> AsyncIterator[str]:
        client = AsyncAnthropic(api_key=api_key)
        async with client.messages.stream(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": message}],
        ) as stream:
            async for text in stream.text_stream:
                yield text


llm_service = LLMService()
