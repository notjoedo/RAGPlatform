import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

import database as db
from auth import require_api_key
from model_catalog import validate_chat_model
from models import ChatRequest, Provider
from services.crawl import crawl_and_ingest_if_needed
from services.llm import llm_service
from services.retrieve import retrieve_context

router = APIRouter(prefix="/pipelines/{pipeline_id}/chat", tags=["chat"])


@router.post("")
async def chat(
    pipeline_id: str,
    body: ChatRequest,
    _: None = Depends(require_api_key),
) -> StreamingResponse:
    if not db.get_pipeline(pipeline_id):
        raise HTTPException(status_code=404, detail="Pipeline not found")

    if body.provider != Provider.ollama and not body.api_key:
        raise HTTPException(
            status_code=400,
            detail=f"API key required for provider: {body.provider.value}",
        )

    if model_error := validate_chat_model(body.provider, body.model):
        raise HTTPException(status_code=400, detail=model_error)

    context = await retrieve_context(
        pipeline_id=pipeline_id,
        query=body.message,
        provider=body.provider,
        api_key=body.api_key,
    )
    # If the pipeline contains URL sources and retrieval found nothing, auto-crawl
    # those sources for the user prompt and then re-retrieve.
    crawled = await crawl_and_ingest_if_needed(pipeline_id, body.message, context)
    if crawled:
        context = await retrieve_context(
            pipeline_id=pipeline_id,
            query=body.message,
            provider=body.provider,
            api_key=body.api_key,
        )

    async def event_stream():
        try:
            async for token in llm_service.stream_chat(
                message=body.message,
                context=context
                or "No documents have been indexed yet. If you uploaded a link, try adding a few more pages or ask a more specific question.",
                provider=body.provider,
                api_key=body.api_key,
                model=body.model,
                history=body.history,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
