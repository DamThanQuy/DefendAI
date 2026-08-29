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
from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.database import async_session_maker
from app.core.deps import get_current_user_ws
from app.models.user import User
from app.models.booking import MockBooking, BookingStatus
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meetings", tags=["WebRTC Signaling"])

# meeting_id -> list of connected sockets (tối đa 2: student + mentor)
_ROOMS: Dict[int, List[WebSocket]] = {}


async def _get_meeting_participant(meeting_id: int, token: str):
    """Trả về (user, booking) nếu user là participant hợp lệ của meeting."""
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
        if booking.student_id != user.id and booking.mentor_id != user.id:
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
    # Giới hạn 2 peer
    if len(room) >= 2:
        await websocket.send_json({"type": "room-full"})
        await websocket.close(code=4003, reason="Room already has 2 participants")
        return

    room.append(websocket)
    is_first = len(room) == 1
    # Báo trạng thái cho chính peer vừa join
    await websocket.send_json({
        "type": "joined",
        "you_are": "initiator" if is_first else "receiver",
        "peers": len(room),
    })
    # Nếu đã có peer trước đó, báo cho peer cũ biết có người mới vào
    if not is_first:
        for other in room:
            if other is not websocket:
                await other.send_json({"type": "peer-joined"})

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
        if len(room) == 0:
            _ROOMS.pop(meeting_id, None)
        else:
            # Báo peer còn lại biết đối phương rời phòng
            for other in room:
                try:
                    await other.send_json({"type": "peer-left"})
                except Exception:
                    pass
