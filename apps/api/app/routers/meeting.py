from datetime import datetime, timedelta
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import os
import tempfile
from openai import AsyncOpenAI

from app.core.database import get_db
from app.core.deps import get_current_user
from app.schemas.meeting import MeetingMessageResponse, MeetingMessageCreate
from app.models.meeting import Meeting, MeetingMessage
from app.models.booking import BookingStatus, MockBooking
from app.models.user import User
from app.repositories.meeting import MeetingMessageRepository

router = APIRouter(prefix="/api/meetings", tags=["Meeting"])

# Phòng mở trước bao nhiêu phút so với confirmed_time (đồng bộ với bookings.py)
ROOM_OPEN_BEFORE_MINUTES = 5


class MeetingAccessResponse(BaseModel):
    """Kết quả kiểm tra quyền vào phòng họp."""
    meeting_id: int
    open: bool
    reason: str  # why open/closed (để FE hiển thị)
    confirmed_time: datetime | None = None
    seconds_until_open: int | None = None


@router.get("/{meeting_id}/access", response_model=MeetingAccessResponse)
async def check_meeting_access(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Kiểm tra xem user hiện tại có được vào phòng họp ngay bây giờ không.

    Quy tắc: sau khi student & mentor chốt xong lịch (booking = confirmed), phòng
    mở hoàn toàn cho cả student lẫn mentor vào. Phòng chỉ bị khoá lại khi mentor
    xác nhận kết thúc buổi mock (booking chuyển sang completed).
    """
    meeting = (
        await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Phòng họp không tồn tại")

    booking = (
        await db.execute(
            select(MockBooking).where(MockBooking.meeting_id == meeting_id)
        )
    ).scalar_one_or_none()

    if not booking:
        # Meeting không thuộc booking nào -> giữ behaviour cũ (mở tự do)
        return MeetingAccessResponse(meeting_id=meeting_id, open=True, reason="free_room")

    if booking.status != BookingStatus.confirmed:
        return MeetingAccessResponse(
            meeting_id=meeting_id,
            open=False,
            reason=f"booking_{booking.status.value}",
            confirmed_time=booking.confirmed_time,
        )

    # Phòng mở hoàn toàn ngay sau khi student & mentor chốt xong lịch (confirmed),
    # cho cả 2 role (student + mentor) vào. Chỉ khoá lại khi mentor xác nhận kết
    # thúc buổi mock (booking chuyển sang completed).
    return MeetingAccessResponse(
        meeting_id=meeting_id,
        open=True,
        reason="confirmed_open",
        confirmed_time=booking.confirmed_time,
        seconds_until_open=0,
    )

@router.get("/{meeting_id}/messages", response_model=List[MeetingMessageResponse])
async def get_messages(meeting_id: int, db: AsyncSession = Depends(get_db)):
    repo = MeetingMessageRepository(db)
    messages = await repo.get_by_meeting_id(meeting_id)
    return messages

@router.post("/{meeting_id}/messages", response_model=MeetingMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(meeting_id: int, message: MeetingMessageCreate, db: AsyncSession = Depends(get_db)):
    repo = MeetingMessageRepository(db)
    new_message = MeetingMessage(
        meeting_id=meeting_id,
        sender_name=message.sender_name,
        sender_role=message.sender_role,
        content=message.content
    )
    return await repo.add(new_message)

@router.post("/{meeting_id}/messages/audio", response_model=MeetingMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_audio_message(meeting_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    repo = MeetingMessageRepository(db)
    
    ext = ".webm"
    if file.filename and "." in file.filename:
        ext = f".{file.filename.split('.')[-1]}"
        
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_audio:
        content = await file.read()
        temp_audio.write(content)
        temp_audio_path = temp_audio.name

    try:
        client = AsyncOpenAI()
        with open(temp_audio_path, "rb") as audio_file:
            transcript = await client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file
            )
        
        transcribed_text = transcript.text
        if not transcribed_text:
            raise ValueError("No transcript generated")
            
        new_message = MeetingMessage(
            meeting_id=meeting_id,
            sender_name="Bạn",
            sender_role="student",
            content=transcribed_text
        )
        saved_message = await repo.add(new_message)
        return saved_message
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio transcription failed: {str(e)}")
    finally:
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
