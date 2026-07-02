from collections.abc import AsyncIterator

import httpx
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from config import settings
from model_catalog import model_display_name, resolve_chat_model
from models import ChatMessage, Provider


RAG_SYSTEM_PROMPT = """You are the assistant in a RAG Platform chat session.

Runtime configuration (authoritative — use this for questions about which model or provider is active):
- Provider: {provider}
- Model: {model_label}
- Model ID: {model_id}

Answer questions about uploaded documents only from the document context below. If the answer is not in that context, say you don't know.
For questions about this chat session itself (which model, provider, or app is being used), answer from the runtime configuration above — do not guess.

Use the conversation history to interpret follow-up questions (e.g. "what about now?", "and that one?", "same question"). When a follow-up refers to earlier messages, answer in that context instead of treating it as a new unrelated topic.

Cite document sources using [filename] notation when referencing specific information.

Document context:
{context}"""


def _build_chat_messages(
    history: list[ChatMessage], message: str
) -> list[dict[str, str]]:
    trimmed = history[-settings.max_chat_history_messages :]
    messages = [{"role": item.role.value, "content": item.content} for item in trimmed]
    messages.append({"role": "user", "content": message})
    return messages


class LLMService:
    async def stream_chat(
        self,
        message: str,
        context: str,
        provider: Provider = Provider.ollama,
        api_key: str | None = None,
        model: str | None = None,
        history: list[ChatMessage] | None = None,
    ) -> AsyncIterator[str]:
        chat_model = resolve_chat_model(
            provider,
            model,
            ollama_default=settings.ollama_chat_model,
            openai_default=settings.openai_chat_model,
            anthropic_default=settings.anthropic_chat_model,
        )
        system = RAG_SYSTEM_PROMPT.format(
            provider=provider.value,
            model_label=model_display_name(provider, chat_model),
            model_id=chat_model,
            context=context,
        )
        chat_messages = _build_chat_messages(history or [], message)
        if provider == Provider.openai:
            if not api_key:
                raise ValueError("OpenAI API key required")
            async for chunk in self._stream_openai(
                system, chat_messages, api_key, chat_model
            ):
                yield chunk
        elif provider == Provider.anthropic:
            if not api_key:
                raise ValueError("Anthropic API key required")
            async for chunk in self._stream_anthropic(
                system, chat_messages, api_key, chat_model
            ):
                yield chunk
        else:
            async for chunk in self._stream_ollama(system, chat_messages, chat_model):
                yield chunk

    async def _stream_ollama(
        self, system: str, messages: list[dict[str, str]], model: str
    ) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": model,
                    "messages": [{"role": "system", "content": system}, *messages],
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
        self, system: str, messages: list[dict[str, str]], api_key: str, model: str
    ) -> AsyncIterator[str]:
        client = AsyncOpenAI(api_key=api_key)
        stream = await client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, *messages],
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _stream_anthropic(
        self, system: str, messages: list[dict[str, str]], api_key: str, model: str
    ) -> AsyncIterator[str]:
        client = AsyncAnthropic(api_key=api_key)
        async with client.messages.stream(
            model=model,
            max_tokens=1024,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text


llm_service = LLMService()
