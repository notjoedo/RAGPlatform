from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    app_api_key: str = "change-me"
    ollama_base_url: str = "http://localhost:11434"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_chat_model: str = "llama3.2"
    chroma_persist_dir: str = str(ROOT_DIR / "db" / "chroma")
    upload_dir: str = str(ROOT_DIR / "db" / "uploads")
    sqlite_path: str = str(ROOT_DIR / "db" / "rag.db")
    max_upload_bytes: int = 10 * 1024 * 1024
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k: int = 5


settings = Settings()
