from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent


def _data_path(value: str) -> str:
    path = Path(value)
    if path.is_absolute():
        return str(path)
    return str((ROOT_DIR / path).resolve())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    app_api_key: str = "change-me"
    ollama_base_url: str = "http://localhost:11434"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_chat_model: str = "llama3.2"
    openai_chat_model: str = "gpt-4o-mini"
    anthropic_chat_model: str = "claude-haiku-4-5-20251001"
    chroma_persist_dir: str = str(ROOT_DIR / "db" / "chroma")
    upload_dir: str = str(ROOT_DIR / "db" / "uploads")
    sqlite_path: str = str(ROOT_DIR / "db" / "rag.db")
    max_upload_bytes: int = 10 * 1024 * 1024
    max_batch_files: int = 100
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k: int = 5
    max_chat_history_messages: int = 20

    def model_post_init(self, __context) -> None:
        self.chroma_persist_dir = _data_path(self.chroma_persist_dir)
        self.upload_dir = _data_path(self.upload_dir)
        self.sqlite_path = _data_path(self.sqlite_path)


settings = Settings()
