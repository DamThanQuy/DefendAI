from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class MeetingMessageBase(BaseModel):
    sender_name: str
    sender_role: str
    content: str

class MeetingMessageCreate(MeetingMessageBase):
    pass

class MeetingMessageResponse(MeetingMessageBase):
    id: int
    meeting_id: int
    created_at: datetime

    class Config:
        from_attributes = True
