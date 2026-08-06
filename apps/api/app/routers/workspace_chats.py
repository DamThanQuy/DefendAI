"""Router: Chat đề tài (R7) — workspace-scoped RAG chat (multi-turn).

Endpoints:
- POST /api/workspaces/{ws_id}/chat → tạo lượt chat (202 + job_id)
- GET  /api/workspaces/{ws_id}/chat → lịch sử hội thoại (mới → cũ)

Có auth: chỉ chủ sở hữu workspace mới gọi được.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.handlers.questions import _normalize_persona
from app.models.entities import AssessmentStatus, User, Workspace, WorkspaceChat
from app.schemas.workspace_chat import (
    WorkspaceChatCreateRequest,
    WorkspaceChatCreateResponse,
    WorkspaceChatResponse,
)
from app.services.job_queue import create_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspaces", tags=["workspace-chat"])


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


@router.post("/{workspace_id}/chat", response_model=WorkspaceChatCreateResponse, status_code=202)
async def create_workspace_chat(
    workspace_id: int,
    body: WorkspaceChatCreateRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    persona = _normalize_persona(body.persona)

    row = WorkspaceChat(
        workspace_id=ws.id,
        question=body.question.strip(),
        persona=persona,
        status=AssessmentStatus.pending,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    job_id = await create_job(
        "chat_ask",
        {
            "chat_id": row.id,
            "workspace_id": ws.id,
            "question": row.question,
            "persona": row.persona,
        },
    )
    return WorkspaceChatCreateResponse(chat_id=row.id, job_id=job_id, status="queued")


@router.get("/{workspace_id}/chat", response_model=list[WorkspaceChatResponse])
async def list_workspace_chats(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await _get_owned_workspace(workspace_id, user, db)
    result = await db.execute(
        select(WorkspaceChat)
        .where(WorkspaceChat.workspace_id == ws.id)
        .order_by(WorkspaceChat.created_at.desc())
    )
    return result.scalars().all()
