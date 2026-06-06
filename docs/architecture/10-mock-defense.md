# 10 — Mock Defense

## Overview

Phòng bảo vệ giả định với Video Call + Timer + Phân quyền vai trò.

## Components

| Component | Công nghệ | Description |
|-----------|-----------|-------------|
| Room | FastAPI CRUD | Tạo phòng, join, leave |
| Video Call | Jitsi Meet API | iframe embed, free |
| Timer | WebSocket | Đếm ngược 3 giai đoạn |
| Roles | WebSocket | Chủ tịch, Phản biện, Thư ký, SV |
| Document Sync | WebSocket | Đồng bộ tài liệu trong phòng |

## Timer Stages

| Stage | Duration | Description |
|-------|----------|-------------|
| Thuyết trình | 15 phút | Sinh viên trình bày |
| Chất vấn | 10 phút | Hội đồng đặt câu hỏi |
| Nhận xét | 5 phút | Hội đồng nhận xét |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `timer:start` | Server → Client | Bắt đầu đếm ngược |
| `timer:tick` | Server → Client | Cập nhật thời gian |
| `phase:change` | Server → Client | Chuyển giai đoạn |
| `role:assign` | Server → Client | Phân vai |
| `document:sync` | Server → Client | Đồng bộ tài liệu |

## Jitsi Integration

Dùng Jitsi iframe API — embed trực tiếp vào trang Room.  
Custom UI overlay để ẩn controls mặc định, thêm timer và role info.

## Related Documents

- `05-backend.md` — Backend
- `06-frontend.md` — Frontend
- `12-api-design.md` — API endpoints
- `decisions/ADR-004-jitsi.md`