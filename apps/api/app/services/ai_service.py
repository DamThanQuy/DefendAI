import os
import json
from openai import AsyncOpenAI
from app.schemas.critique import CodeCritiqueRequest

# Lấy API Key từ môi trường
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

async def analyze_code_with_ai(request_data: CodeCritiqueRequest) -> str:
    """
    Sử dụng OpenAI để phân tích mã nguồn dựa trên AST data.
    Nếu không có API Key, trả về dữ liệu mock để test.
    """
    if not OPENAI_API_KEY:
        # Mock logic khi chưa có API key
        return (
            "⚠️ **CẢNH BÁO: CHƯA CẤU HÌNH OPENAI_API_KEY**\n\n"
            "Đây là kết quả giả lập (Mock) vì hệ thống không tìm thấy API Key.\n\n"
            "### 1. Nhận xét cấu trúc (Từ AST)\n"
            f"- File này import {len(request_data.ast_data.get('imports', []))} thư viện.\n"
            f"- File này có {len(request_data.ast_data.get('functions', []))} hàm.\n\n"
            "### 2. Phản biện Logic\n"
            "- Code có vẻ ổn nhưng cần kiểm tra lại các side-effects trong React components.\n"
            "- Cân nhắc tách nhỏ logic vào các custom hooks để dễ maintain."
        )

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    prompt = f"""
Bạn là một chuyên gia lập trình và kiến trúc sư phần mềm (Software Architect).
Người dùng yêu cầu bạn nhận xét, phản biện (critique) một đoạn mã nguồn.
Để giúp bạn phân tích chính xác hơn, hệ thống đã trích xuất sẵn cấu trúc mã (AST) thành dạng JSON.

Dưới đây là cấu trúc AST của mã nguồn:
```json
{json.dumps(request_data.ast_data, indent=2)}
```

Và đây là toàn bộ mã nguồn:
```
{request_data.source_code}
```

Dựa vào cả hai thông tin trên, hãy đưa ra một phản biện chi tiết, chuyên sâu nhưng dễ hiểu, tập trung vào:
1. **Kiến trúc & Thiết kế**: Việc chia function/class, import các thư viện đã hợp lý chưa?
2. **Lỗi tiềm ẩn & Bảo mật**: Có memory leak, re-render thừa (với React), hay lỗi logic nào không?
3. **Clean Code**: Code có dễ đọc không? Đề xuất cách viết gọn hơn nếu có.

Trình bày kết quả bằng Markdown chuẩn, rõ ràng, chia làm các mục nhỏ.
"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Bạn là chuyên gia phân tích mã nguồn AI. Hãy luôn trả lời bằng tiếng Việt trừ khi được yêu cầu khác."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1500,
        )
        return response.choices[0].message.content or "Không có phản hồi từ AI."
    except Exception as e:
        return f"❌ **Lỗi khi gọi OpenAI API:** {str(e)}"
