"""
WebSocket signaling router cho WebRTC (voice chat + screen share) trong Mock Room.

Thiết kế: mesh 1-1 giữa student và mentor của cùng một meeting.
- Mỗi participant kết nối WS signaling, gửi message dạng:
    {"type": "join"}  -> server gán peer vào room, báo "ready"/"peer-joined"
    {"type": "offer" | "answer" | "ice-candidate", "payload": ...}
- Server relay message tới peer còn lại trong cùng meeting.
- Khi 1 peer disconnect, báo "peer-left" cho peer kia để dọn dẹp.

Không lưu trữ media — chỉ relay SDP/ICE. Media chạy P2P giữa 2 browser.
"""
import logging
from datetime import datetime
from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.database import async_session_maker
from app.core.deps import get_current_user_ws
from app.models.user import User
from app.models.booking import MockBooking, BookingStatus
from app.models.meeting import MeetingMessage
from app.repositories.meeting import MeetingMessageRepository
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meetings", tags=["WebRTC Signaling"])

# meeting_id -> list of connected sockets (tối đa 2: student + mentor)
_ROOMS: Dict[int, List[WebSocket]] = {}

# meeting_id -> list of (user_id, name, role) hiện đang có mặt trong phòng.
# Dùng để báo "presence" (số người + danh sách) ngay khi join, KHÔNG cần chờ
# bên kia bật mic (khắc phục lỗi chỉ thấy 2/2 khi bật mic).
_PRESENCE: Dict[int, List[dict]] = {}


async def _get_meeting_participant(meeting_id: int, token: str):
    """Trả về (user, booking) nếu user là participant hợp lệ của meeting.

    Participant = student chủ trì, mentor, HOẶC sinh viên được mời (invited_students).
    """
    user = await get_current_user_ws(token, async_session_maker)
    if not user:
        return None, None
    async with async_session_maker() as db:
        booking = (
            await db.execute(
                select(MockBooking).where(MockBooking.meeting_id == meeting_id)
            )
        ).scalar_one_or_none()
        if not booking or booking.status != BookingStatus.confirmed:
            return user, None
        invited_ids = [u.get("user_id") for u in (booking.invited_students or [])]
        if booking.student_id != user.id and booking.mentor_id != user.id and user.id not in invited_ids:
            return user, None
        return user, booking
    return user, None


@router.websocket("/{meeting_id}/signal")
async def meeting_signal(
    websocket: WebSocket,
    meeting_id: int,
    token: str = Query(...),
):
    user, booking = await _get_meeting_participant(meeting_id, token)
    if not user or not booking:
        await websocket.close(code=4003, reason="Not authorized for this meeting")
        return

    await websocket.accept()
    room = _ROOMS.setdefault(meeting_id, [])
    # Giới hạn số người trong phòng (student chủ trì + mentor + sinh viên mời)
    MAX_PARTICIPANTS = 10
    if len(room) >= MAX_PARTICIPANTS:
        await websocket.send_json({"type": "room-full"})
        await websocket.close(code=4003, reason="Room is full")
        return

    room.append(websocket)
    is_first = len(room) == 1

    # Cập nhật danh sách presence (người có mặt trong phòng)
    role = "mentor" if (user.roles and any(r.name == "mentor" for r in user.roles)) else "student"
    name = user.full_name or user.email or f"User {user.id}"
    entry = {"user_id": user.id, "name": name, "role": role}
    presence = _PRESENCE.setdefault(meeting_id, [])
    presence = [p for p in presence if p["user_id"] != user.id]  # tránh trùng
    presence.append(entry)
    _PRESENCE[meeting_id] = presence

    # Báo trạng thái cho chính peer vừa join
    await websocket.send_json({
        "type": "joined",
        "you_are": "initiator" if is_first else "receiver",
        "peers": len(room),
        "presence": presence,
    })
    # Nếu đã có peer trước đó, báo cho peer cũ biết có người mới vào
    if not is_first:
        for other in room:
            if other is not websocket:
                await other.send_json({"type": "peer-joined"})
    # Broadcast presence mới cho TẤT CẢ peer (kể cả người vừa join đã nhận ở trên)
    for other in room:
        try:
            await other.send_json({"type": "presence", "participants": presence})
        except Exception:
            pass

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            # Chỉ relay các message signaling hợp lệ
            if msg_type in ("offer", "answer", "ice-candidate"):
                relay = {
                    "type": msg_type,
                    "from": user.id,
                    "payload": data.get("payload"),
                }
                for other in room:
                    if other is not websocket:
                        await other.send_json(relay)
            elif msg_type == "chat":
                # Tin nhắn chat / speech-to-text từ 1 peer.
                # Lưu vào DB (MeetingMessage) để cả 2 có thể xem lại sau khi reload,
                # đồng thời relay cho peer còn lại.
                content = (data.get("content") or "").strip()
                if not content:
                    continue
                sender_role = "mentor" if (user.roles and any(r.name == "mentor" for r in user.roles)) else "student"
                sender_name = user.full_name or user.email or "Bạn"
                async with async_session_maker() as db:
                    repo = MeetingMessageRepository(db)
                    saved = await repo.add(MeetingMessage(
                        meeting_id=meeting_id,
                        sender_name=sender_name,
                        sender_role=sender_role,
                        content=content,
                    ))
                    created_at = saved.created_at.isoformat() if saved.created_at else datetime.utcnow().isoformat()
                chat_msg = {
                    "type": "chat",
                    "content": content,
                    "sender_name": sender_name,
                    "sender_role": sender_role,
                    "created_at": created_at,
                }
                # Gửi lại cho chính người gửi (để đồng bộ id/time) + relay cho peer
                await websocket.send_json(chat_msg)
                for other in room:
                    if other is not websocket:
                        await other.send_json(chat_msg)
            elif msg_type == "qa_question":
                # Câu hỏi từ Mentor trong tab Hỏi & Đáp (giai đoạn chất vấn).
                # Relay cho peer còn lại + echo lại cho người gửi để đồng bộ.
                question = (data.get("question") or "").strip()
                if not question:
                    continue
                asked_by = data.get("asked_by") or (user.full_name or user.email or "Mentor")
                qa_msg = {
                    "type": "qa_question",
                    "question": question,
                    "asked_by": asked_by,
                    "created_at": datetime.utcnow().isoformat(),
                }
                await websocket.send_json(qa_msg)
                for other in room:
                    if other is not websocket:
                        await other.send_json(qa_msg)
            elif msg_type == "bye":
                for other in room:
                    if other is not websocket:
                        await other.send_json({"type": "peer-left"})
    except WebSocketDisconnect:
        logger.info(f"Signaling WS disconnect: meeting={meeting_id} user={user.id}")
    except Exception as e:
        logger.warning(f"Signaling WS error: {e}")
    finally:
        if websocket in room:
            room.remove(websocket)
        # Xoá khỏi presence
        presence = _PRESENCE.get(meeting_id, [])
        presence = [p for p in presence if p.get("user_id") != user.id]
        if presence:
            _PRESENCE[meeting_id] = presence
        else:
            _PRESENCE.pop(meeting_id, None)
        if len(room) == 0:
            _ROOMS.pop(meeting_id, None)
        else:
            # Báo peer còn lại biết đối phương rời phòng
            for other in room:
                try:
                    await other.send_json({"type": "peer-left"})
                except Exception:
                    pass
            # Broadcast presence mới (đã bớt 1 người)
            try:
                await room[0].send_json({"type": "presence", "participants": _PRESENCE.get(meeting_id, [])})
            except Exception:
                pass
