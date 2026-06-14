# 04 — Meeting API

> Quản lý phòng Mock Defense + WebSocket real-time.

## Overview

Module tạo phòng họp ảo cho Mock Defense. Tích hợp Jitsi cho video call + WebSocket cho timer, phase control, role assignment real-time.

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/meeting/rooms` | Tạo phòng mới |
| GET | `/api/meeting/rooms/{id}` | Lấy thông tin phòng |
| WS | `/api/meeting/ws/{room_id}` | WebSocket real-time |

---

## POST `/api/meeting/rooms`

Tạo phòng Mock Defense mới.

### Request

```json
{
  "name": "Defense Session - Nhóm 5"
}
```

### Response (201 Created)

```json
{
  "room_id": "room-abc123",
  "name": "Defense Session - Nhóm 5",
  "jitsi_url": "https://meet.jit.si/defendai-room-abc123",
  "created_at": "2026-06-14T12:00:00Z"
}
```

### Flow

```
POST /api/meeting/rooms { name }
        ↓
Tạo room record trong DB
        ↓
Tạo Jitsi room URL
        ↓
Return { room_id, jitsi_url }
        ↓
User mở phòng → Jitsi iframe embed
```

---

## GET `/api/meeting/rooms/{room_id}`

Lấy thông tin phòng + danh sách participants hiện tại.

### Response (200 OK)

```json
{
  "room_id": "room-abc123",
  "name": "Defense Session - Nhóm 5",
  "jitsi_url": "https://meet.jit.si/defendai-room-abc123",
  "status": "active",
  "participants": [
    {"id": "user-1", "name": "Host", "role": "host"},
    {"id": "user-2", "name": "Presenter", "role": "presenter"}
  ],
  "current_phase": "presentation",
  "timer": {"elapsed": 450, "total": 900}
}
```

---

## WS `/api/meeting/ws/{room_id}`

WebSocket connection cho real-time collaboration trong phòng.

### Events (Server → Client)

| Event | Payload | Mô tả |
|-------|---------|-------|
| `room:state` | `{ participants, phase, timer }` | Trạng thái phòng hiện tại |
| `timer:tick` | `{ elapsed: 450 }` | Tick mỗi 1s |
| `phase:change` | `{ phase: "defense" }` | Chuyển giai đoạn |
| `role:assign` | `{ user_id, role }` | Assign vai trò |
| `participant:join` | `{ user_id, name }` | User tham gia |
| `participant:leave` | `{ user_id }` | User rời phòng |
| `document:sync` | `{ document_id }` | Đồng bộ tài liệu |
| `meeting:end` | `{}` | Kết thúc buổi defense |

### Events (Client → Server)

| Event | Payload | Mô tả |
|-------|---------|-------|
| `timer:start` | `{}` | Bắt đầu đếm giờ |
| `timer:pause` | `{}` | Tạm dừng |
| `phase:next` | `{}` | Chuyển sang giai đoạn tiếp |
| `role:assign` | `{ user_id, role }` | Host assign vai trò |
| `mic:toggle` | `{ muted: true }` | Bật/tắt micro |

### Timer Flow

```
3 giai đoạn:
    1. Thuyết trình (Presentation): 15 phút
    2. Chất vấn (Defense): 10 phút
    3. Nhận xét (Feedback): 5 phút
        ↓
Auto lock micro khi hết thời gian mỗi giai đoạn
        ↓
Meeting end → trigger evaluation module
```

---

## Edge Cases

| Trường hợp ngoại lệ | Mức ưu tiên | Trạng thái | Ghi chú |
|---------------------|-------------|------------|---------|
| Room không tồn tại | 🔴 Cao | ❌ Chưa giải quyết | Validate room_id |
| Room đã full (max participants) | 🟡 Trung bình | ❌ Chưa giải quyết | Giới hạn số người tham gia |
| WebSocket disconnect giữa chừng | 🔴 Cao | ❌ Chưa giải quyết | Auto-reconnect + restore state |
| Host rời phòng | 🟡 Trung bình | ❌ Chưa giải quyết | Transfer host role |
| Concurrent timer start | 🟢 Thấp | ❌ Chưa giải quyết | Chỉ host mới được start timer |
| Jitsi service down | 🟡 Trung bình | ❌ Chưa giải quyết | Fallback / thông báo user |

---

## Related

- Architecture: [`10-mock-defense.md`](../architecture/10-mock-defense.md)
- Flow: [`FLOW.md`](../../FLOW.md) — Mock Defense Flow, Realtime Flow
