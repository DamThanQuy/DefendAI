# 🔧 Danh sách Functions — DefendAI MVP

> File tổng hợp tất cả chức năng cần xây dựng trong 3 tuần.
> Mỗi function bao gồm: mô tả, API endpoint (nếu có), file code, owner.

---

## TUẦN 1: AI Assessment (Upload + Phân tích)

### 1.1 Upload tài liệu
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Người dùng upload file .pdf, .docx, .pptx lên hệ thống |
| **API** | `POST /api/documents/upload` |
| **Frontend** | Upload zone (drag & drop + chọn file) |
| **File code** | `app/routers/documents.py`, `components/upload/UploadZone.tsx` |
| **Owner** | Dev C (API) + Dev A (UI) |

### 1.2 Upload Source Code
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Người dùng upload file .zip chứa source code project |
| **API** | `POST /api/documents/upload` (chung với upload tài liệu) |
| **Frontend** | Upload zone (nhận biết file .zip) |
| **File code** | `app/routers/documents.py` |
| **Owner** | Dev C (API) + Dev A (UI) |

### 1.3 Parse tài liệu (Document Parser)
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Trích xuất text từ .pdf (PyPDF2), .docx (python-docx), .pptx (python-pptx) |
| **API** | Internal (gọi từ service layer) |
| **File code** | `app/services/document_parser.py` |
| **Owner** | Quý |

### 1.4 Parse Source Code (Code Parser)
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Unzip .zip, đọc các file code (.py, .js, .ts, .java, .cs, .cpp, .html, .css), bỏ qua node_modules/, .git/, dist/, build/ |
| **API** | Internal (gọi từ service layer) |
| **File code** | `app/services/code_parser.py` |
| **Owner** | Quý + Dev C |

### 1.5 AI Generate Questions
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | AI phân tích tài liệu → sinh 10 câu hỏi phản biện + gợi ý trả lời theo 3 Persona |
| **API** | `POST /api/questions/generate` — body: `{ document_id, persona }` |
| **Persona 1** | Lý thuyết — giảng viên hàn lâm, bắt lỗi phương pháp luận |
| **Persona 2** | Thực tế — chuyên gia doanh nghiệp, hỏi ứng dụng thực tế |
| **Persona 3** | Khắt khe — hội đồng khó tính, bắt bẻ logic, số liệu |
| **File code** | `app/services/question_generator.py`, `app/routers/questions.py`, `app/schemas/question.py` |
| **Owner** | Quý |

### 1.6 AI Scan Code
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | AI phân tích source code → phát hiện lỗi logic, code smell, đề xuất cải thiện |
| **API** | `POST /api/code/scan` — body: `{ document_id }` |
| **Response** | `{ issues: [...], summary, improvement_suggestions, estimated_pass_rate }` |
| **File code** | `app/services/code_reviewer.py`, `app/routers/code_review.py`, `app/schemas/code_review.py` |
| **Owner** | Quý |

### 1.7 UI hiển thị kết quả AI
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Hiển thị 10 câu hỏi (tab theo Persona), accordion cho gợi ý, badge độ khó |
| **Frontend** | `components/questions/QuestionList.tsx` |
| **Owner** | Dev A |

### 1.8 UI hiển thị kết quả Code Review
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Hiển thị danh sách lỗi (theo severity), file bị lỗi, đề xuất sửa |
| **Frontend** | `components/questions/CodeReviewResult.tsx` |
| **Owner** | Dev A |

### 1.9 WebSocket
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Kết nối WebSocket cơ bản, chuẩn bị event types cho tuần 2 |
| **API** | `ws://localhost:8000/ws` |
| **File code** | `app/routers/ws.py` |
| **Owner** | Dev C |

---

## TUẦN 2: Mock Defense Room

### 2.1 Tạo phòng họp
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Tạo phòng mock defense, sinh link mời |
| **API** | `POST /api/rooms/create` |
| **Frontend** | Mock Room layout (video + document + timer) |
| **Owner** | Dev C + A |

### 2.2 Video Call (Jitsi)
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Tích hợp Jitsi Meet API, custom UI overlay |
| **API** | Jitsi iframe API |
| **Owner** | Dev C + A |

### 2.3 Timer 3 giai đoạn
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Đồng hồ đếm ngược: Thuyết trình → Chất vấn → Nhận xét, tự động chuyển phase |
| **API** | WebSocket events: `timer:start`, `timer:tick`, `phase:change` |
| **Owner** | Dev A + C |

### 2.4 Phân quyền vai trò
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Host chọn vai trò: Chủ tịch, Phản biện, Thư ký, Sinh viên |
| **Owner** | Dev A + C |

### 2.5 Đồng bộ tài liệu trong phòng
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Tài liệu đã upload hiển thị trong phòng họp |
| **Owner** | Dev A |

---

## TUẦN 3: Evaluation & Reporting

### 3.1 Form chấm điểm Rubric
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Chấm điểm theo tiêu chí: Kiến thức, Thuyết trình, Phản xạ, Chất lượng code |
| **API** | `POST /api/sessions/{id}/score` |
| **Owner** | Dev A (UI) + Dev C (API) |

### 3.2 Tính điểm trung bình
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Tự động tính avg ngay khi kết thúc phiên |
| **API** | `GET /api/sessions/{id}/results` |
| **Owner** | Dev C |

### 3.3 Biểu đồ Radar
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Vẽ biểu đồ radar năng lực (Chart.js) |
| **Frontend** | Chart.js Radar chart |
| **Owner** | Dev A |

### 3.4 AI Review tổng kết
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | AI tổng hợp điểm yếu từ câu hỏi + câu trả lời → "Bệnh án đồ án" |
| **API** | `POST /api/reports/generate` |
| **Owner** | Quý |

### 3.5 Xuất PDF Report
| Thông tin | Chi tiết |
|-----------|----------|
| **Mô tả** | Xuất PDF chứa: Radar Chart + danh sách lỗi + % đậu/rớt |
| **API** | `GET /api/reports/{id}/pdf` |
| **Frontend** | jsPDF / pdfmake |
| **Owner** | Dev A + C |

---

## Tổng quan

| Tuần | Số functions | Owner chính |
|------|-------------|-------------|
| 1 | 9 functions | Quý (5), Dev C (2), Dev A (2) |
| 2 | 5 functions | Dev A + C |
| 3 | 5 functions | Quý (1), Dev A (2), Dev C (2) |
| **Tổng** | **19 functions** | |

---

*Xem chi tiết kế hoạch tại [`MVP_PLAN.md`](../MVP_PLAN.md)*
*Xem task hằng ngày tại [`tasks/`](../tasks/)*