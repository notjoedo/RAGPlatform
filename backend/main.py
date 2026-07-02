import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database as db
from auth import require_api_key
from config import settings
from models import HealthResponse
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


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    ollama_reachable = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            ollama_reachable = response.status_code == 200
    except httpx.HTTPError:
        pass

    return HealthResponse(
        status="ok",
        ollama_reachable=ollama_reachable,
        ollama_url=settings.ollama_base_url,
    )


@app.get("/")
async def root() -> dict:
    return {"name": "RAG Platform API", "docs": "/docs"}
