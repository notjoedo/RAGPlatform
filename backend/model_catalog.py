"""Chat model catalog — Anthropic IDs from https://docs.anthropic.com/en/docs/about-claude/models/overview"""

from models import Provider

# Latest-generation Claude models only (not legacy).
ANTHROPIC_CHAT_MODELS: dict[str, str] = {
    "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-opus-4-8": "Claude Opus 4.8",
    "claude-fable-5": "Claude Fable 5",
}

OPENAI_CHAT_MODELS: dict[str, str] = {
    "gpt-4o-mini": "GPT-4o mini",
    "gpt-4o": "GPT-4o",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 mini",
}

DEFAULT_CHAT_MODEL: dict[Provider, str] = {
    Provider.anthropic: "claude-haiku-4-5-20251001",
    Provider.openai: "gpt-4o-mini",
    Provider.ollama: "",  # resolved from settings at runtime
}


def chat_models_for_provider(provider: Provider) -> dict[str, str]:
    if provider == Provider.anthropic:
        return ANTHROPIC_CHAT_MODELS
    if provider == Provider.openai:
        return OPENAI_CHAT_MODELS
    return {}


def resolve_chat_model(
    provider: Provider,
    model: str | None,
    *,
    ollama_default: str,
    openai_default: str,
    anthropic_default: str,
) -> str:
    if provider == Provider.ollama:
        return model or ollama_default

    catalog = chat_models_for_provider(provider)
    if model and model in catalog:
        return model

    if provider == Provider.openai:
        return openai_default if openai_default in catalog else DEFAULT_CHAT_MODEL[provider]
    return anthropic_default if anthropic_default in catalog else DEFAULT_CHAT_MODEL[provider]


def model_display_name(provider: Provider, model_id: str) -> str:
    catalog = chat_models_for_provider(provider)
    if model_id in catalog:
        return catalog[model_id]
    return model_id


def validate_chat_model(provider: Provider, model: str | None) -> str | None:
    if model is None:
        return None
    if provider == Provider.ollama:
        if not model.strip():
            return "Ollama model cannot be empty"
        return None

    catalog = chat_models_for_provider(provider)
    if model not in catalog:
        allowed = ", ".join(sorted(catalog))
        return f"Unsupported {provider.value} model: {model}. Choose one of: {allowed}"
    return None
