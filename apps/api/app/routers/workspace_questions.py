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
from app.models.entities import AssessmentStatus, User, Workspace, WorkspaceQuestion
from app.schemas.workspace_question import (
    WorkspaceQuestionCreateRequest,
    WorkspaceQuestionCreateResponse,
    WorkspaceQuestionResponse,
    WorkspaceQuestionListResponse,
)
from app.services.job_queue import create_job
from app.services.source_item_builder import to_source_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspaces", tags=["workspace-questions"])


def _q_to_response(q: WorkspaceQuestion) -> WorkspaceQuestionResponse:
    """Convert ORM row → response, đảm bảo `sources` luôn match schema mới.

    Row cũ trong DB có thể lưu dict thiếu field (`display_title`, `kind`, `doc_type`,
    `is_markdown`) do schema cũ. Đưa qua `to_source_list` để normalize lại.
    """
    data = {k: v for k, v in q.__dict__.items() if not k.startswith("_")}
    if data.get("sources"):
        data["sources"] = to_source_list(list(data["sources"]))
    return WorkspaceQuestionResponse.model_validate(data)


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

    row = WorkspaceQuestion(
        workspace_id=ws.id,
        topic=body.topic.strip(),
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
        },
    )
    return WorkspaceQuestionCreateResponse(question_id=row.id, job_id=job_id, status="queued")


@router.get("/{workspace_id}/questions", response_model=WorkspaceQuestionListResponse)
async def list_workspace_questions(
    workspace_id: int,
    limit: int = 10,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    limit = max(1, min(limit, 50))  # clamp 1..50
    offset = max(0, offset)
    total_result = await db.execute(
        select(WorkspaceQuestion)
        .where(WorkspaceQuestion.workspace_id == ws.id)
    )
    total = len(total_result.scalars().all())
    result = await db.execute(
        select(WorkspaceQuestion)
        .where(WorkspaceQuestion.workspace_id == ws.id)
        .order_by(WorkspaceQuestion.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return WorkspaceQuestionListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[_q_to_response(q) for q in result.scalars().all()],
    )


@router.get("/{workspace_id}/questions/{question_id}", response_model=WorkspaceQuestionResponse)
async def get_workspace_question(
    workspace_id: int,
    question_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    q = await db.get(WorkspaceQuestion, question_id)
    if not q or q.workspace_id != ws.id:
        raise HTTPException(status_code=404, detail="Question session not found")
    return _q_to_response(q)


@router.delete("/{workspace_id}/questions/{question_id}", status_code=204)
async def delete_workspace_question(
    workspace_id: int,
    question_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    q = await db.get(WorkspaceQuestion, question_id)
    if not q or q.workspace_id != ws.id:
        raise HTTPException(status_code=404, detail="Question session not found")
    await db.delete(q)
    await db.commit()


@router.delete("/{workspace_id}/questions", status_code=204)
async def delete_all_workspace_questions(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    result = await db.execute(
        select(WorkspaceQuestion).where(WorkspaceQuestion.workspace_id == ws.id)
    )
    for q in result.scalars().all():
        await db.delete(q)
    await db.commit()