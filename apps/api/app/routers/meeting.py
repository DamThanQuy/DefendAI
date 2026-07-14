from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import os
import tempfile
from openai import AsyncOpenAI

from app.core.database import get_db
from app.schemas.meeting import MeetingMessageResponse, MeetingMessageCreate
from app.models.meeting import MeetingMessage
from app.repositories.meeting import MeetingMessageRepository

router = APIRouter(prefix="/api/meetings", tags=["Meeting"])

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
