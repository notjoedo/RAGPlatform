import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database as db
from auth import require_api_key
from config import settings
from config import settings
from model_catalog import ANTHROPIC_CHAT_MODELS, OPENAI_CHAT_MODELS
from models import ChatModelOption, ChatModelsResponse, HealthResponse, Provider
from routers import chat, documents, pipelines

app = FastAPI(title="RAG Platform", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pipelines.router)
app.include_router(documents.router)
app.include_router(chat.router)


@app.on_event("startup")
def startup() -> None:
    db.init_db()
    from pathlib import Path

    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.chroma_persist_dir).mkdir(parents=True, exist_ok=True)


def _ollama_model_names(payload: dict) -> list[str]:
    models = payload.get("models") or []
    names: list[str] = []
    for entry in models:
        if isinstance(entry, dict) and (name := entry.get("name")):
            names.append(str(name))
    return sorted(set(names))


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    ollama_reachable = False
    ollama_models: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            ollama_reachable = response.status_code == 200
            if ollama_reachable:
                ollama_models = _ollama_model_names(response.json())
    except httpx.HTTPError:
        pass

    return HealthResponse(
        status="ok",
        ollama_reachable=ollama_reachable,
        ollama_url=settings.ollama_base_url,
        ollama_models=ollama_models,
    )


@app.get("/models", response_model=ChatModelsResponse)
async def list_chat_models() -> ChatModelsResponse:
    return ChatModelsResponse(
        anthropic=[
            ChatModelOption(id=model_id, label=label)
            for model_id, label in ANTHROPIC_CHAT_MODELS.items()
        ],
        openai=[
            ChatModelOption(id=model_id, label=label)
            for model_id, label in OPENAI_CHAT_MODELS.items()
        ],
        defaults={
            Provider.anthropic.value: settings.anthropic_chat_model,
            Provider.openai.value: settings.openai_chat_model,
            Provider.ollama.value: settings.ollama_chat_model,
        },
    )


@app.get("/")
async def root() -> dict:
    return {"name": "RAG Platform API", "docs": "/docs"}
