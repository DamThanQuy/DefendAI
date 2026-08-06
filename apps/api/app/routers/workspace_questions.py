"""Router: 'Hỏi theo đề tài' (R6) — workspace-scoped RAG question generation.

Endpoints:
- POST /api/workspaces/{ws_id}/questions → tạo job sinh câu hỏi RAG (202 + job_id)
- GET  /api/workspaces/{ws_id}/questions → lịch sử (mới → cũ)

Có auth: chỉ chủ sở hữu workspace mới gọi được.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.handlers.questions import _normalize_persona
from app.models.entities import AssessmentStatus, User, Workspace, WorkspaceQuestion
from app.schemas.workspace_question import (
    WorkspaceQuestionCreateRequest,
    WorkspaceQuestionCreateResponse,
    WorkspaceQuestionResponse,
)
from app.services.job_queue import create_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspaces", tags=["workspace-questions"])


async def _get_owned_workspace(workspace_id: int, user: User, db) -> Workspace:
    result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.user_id == user.id
        )
    )
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.post("/{workspace_id}/questions", response_model=WorkspaceQuestionCreateResponse, status_code=202)
async def create_workspace_questions(
    workspace_id: int,
    body: WorkspaceQuestionCreateRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    persona = _normalize_persona(body.persona)

    row = WorkspaceQuestion(
        workspace_id=ws.id,
        topic=body.topic.strip(),
        persona=persona,
        status=AssessmentStatus.pending,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    job_id = await create_job(
        "workspace_questions",
        {
            "question_id": row.id,
            "workspace_id": ws.id,
            "topic": row.topic,
            "persona": row.persona,
        },
    )
    return WorkspaceQuestionCreateResponse(question_id=row.id, job_id=job_id, status="queued")


@router.get("/{workspace_id}/questions", response_model=list[WorkspaceQuestionResponse])
async def list_workspace_questions(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    result = await db.execute(
        select(WorkspaceQuestion)
        .where(WorkspaceQuestion.workspace_id == ws.id)
        .order_by(WorkspaceQuestion.created_at.desc())
    )
    return result.scalars().all()