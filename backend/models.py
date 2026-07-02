from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Provider(str, Enum):
    ollama = "ollama"
    openai = "openai"
    anthropic = "anthropic"


class PipelineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class PipelineResponse(BaseModel):
    id: str
    name: str
    created_at: datetime


class DocumentStatus(str, Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class DocumentResponse(BaseModel):
    id: str
    pipeline_id: str
    filename: str
    status: DocumentStatus
    chunk_count: int = 0
    error: Optional[str] = None
    created_at: datetime


class DocumentLinkCreate(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class DocumentCrawlCreate(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    query: str = Field(min_length=1, max_length=500)
    max_pages: int = Field(default=25, ge=1, le=100)
    max_depth: int = Field(default=2, ge=0, le=3)
    min_similarity: float = Field(default=0.25, ge=0.0, le=1.0)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    provider: Provider = Provider.ollama
    api_key: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    ollama_reachable: bool
    ollama_url: str
