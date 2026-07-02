from fastapi import APIRouter, Depends, HTTPException, status

import database as db
from auth import require_api_key
from models import PipelineCreate, PipelineResponse
from services.chroma_store import delete_collection

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.post("", response_model=PipelineResponse, status_code=status.HTTP_201_CREATED)
def create_pipeline(
    body: PipelineCreate,
    _: None = Depends(require_api_key),
) -> PipelineResponse:
    pipeline = db.create_pipeline(body.name)
    return PipelineResponse(**pipeline)


@router.get("", response_model=list[PipelineResponse])
def list_pipelines(_: None = Depends(require_api_key)) -> list[PipelineResponse]:
    return [PipelineResponse(**p) for p in db.list_pipelines()]


@router.delete("/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pipeline(
    pipeline_id: str,
    _: None = Depends(require_api_key),
) -> None:
    if not db.delete_pipeline(pipeline_id):
        raise HTTPException(status_code=404, detail="Pipeline not found")
    delete_collection(pipeline_id)
