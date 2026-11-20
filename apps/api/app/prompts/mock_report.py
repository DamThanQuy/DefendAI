"""Prompt tổng hợp báo cáo sau buổi Mock Defense (KHÔNG chấm điểm số).

Tiêu chí, mức đánh giá và CLO đọc từ rubric DB (BR-A1) — file này chỉ là khung
câu lệnh, không chứa tiêu chí.
"""
from __future__ import annotations

from typing import Any

REPORT_SYSTEM_PROMPT = """Bạn là thư ký hội đồng bảo vệ đồ án tốt nghiệp {subject}. Bạn đọc biên bản một buổi BẢO VỆ THỬ (mock defense) giữa sinh viên và Giám khảo AI, rồi viết báo cáo nhận xét cho sinh viên.

QUY TẮC BẮT BUỘC:
1. KHÔNG chấm điểm số dưới bất kỳ hình thức nào (không thang 10, thang 100, phần trăm, OGA/TDA). Chỉ dùng đúng các mức đánh giá được liệt kê.
2. Chỉ dựa trên biên bản (và trích đoạn tài liệu nếu có). Không suy diễn điều sinh viên không nói. Tiêu chí nào biên bản không đủ căn cứ → "level": null và nêu rõ còn thiếu thông tin gì.
3. Đánh giá năng lực của SINH VIÊN qua câu trả lời; câu hỏi của Giám khảo AI chỉ là ngữ cảnh.
4. Viết hoàn toàn bằng tiếng Việt có dấu (tuyệt đối không chèn chữ Hán/tiếng Trung), cụ thể, mang tính xây dựng; mỗi ý ngắn gọn (1–2 câu), có dẫn chứng từ câu trả lời.
5. Chỉ trả về MỘT object JSON hợp lệ, không markdown, không văn bản thừa."""

_OUTPUT_SCHEMA = """{
  "overall_comment": "2–4 câu nhận xét tổng quan về buổi bảo vệ thử",
  "quality_criteria": [
    {
      "key": "<mã tiêu chí>",
      "level": "<một trong các mức đánh giá> hoặc null",
      "comment": "giải thích vì sao ở mức này",
      "evidence": "dẫn chứng ngắn từ câu trả lời của sinh viên"
    }
  ],
  "strengths": ["điểm mạnh cụ thể"],
  "weaknesses": ["điểm yếu cụ thể"],
  "action_items": ["việc nên làm để cải thiện, gắn với điểm yếu"],
  "clo_coverage": [
    {"clo": "<mã CLO>", "covered": true, "comment": "đã được chất vấn và trả lời thế nào"}
  ]
}"""


def build_report_prompts(
    rubric_cfg: dict[str, Any], transcript_text: str, document_excerpt: str = ""
) -> tuple[str, str]:
    """Trả (system_prompt, user_prompt) cho AI tổng hợp báo cáo."""
    subject = rubric_cfg.get("subject", {}).get("code") or "SEP490"
    criteria = [c for c in rubric_cfg.get("quality_criteria") or [] if c.get("key")]

    levels: list[str] = []
    for c in criteria:
        for level in c.get("levels") or []:
            if level not in levels:
                levels.append(level)

    criteria_lines = "\n".join(
        f"- {c['key']} — {c.get('label') or c['key']}"
        + (f": {c['description']}" if c.get("description") else "")
        for c in criteria
    )
    clo_lines = "\n".join(
        f"- {c['code']}: {c.get('desc', '')}"
        for c in rubric_cfg.get("clo") or [] if c.get("code")
    )

    parts = [
        f"TIÊU CHÍ CHẤT LƯỢNG — mỗi tiêu chí chọn đúng 1 mức: {' / '.join(levels)} "
        "(không đủ căn cứ thì để null):",
        criteria_lines,
        "",
        "CHUẨN ĐẦU RA (CLO) — cho biết buổi chất vấn đã đề cập CLO nào (covered):",
        clo_lines,
    ]
    if document_excerpt.strip():
        parts += [
            "",
            "TRÍCH ĐOẠN TÀI LIỆU ĐỒ ÁN (chỉ để tham khảo ngữ cảnh):",
            document_excerpt.strip(),
        ]
    parts += [
        "",
        "BIÊN BẢN BUỔI BẢO VỆ THỬ:",
        transcript_text,
        "",
        "Trả về DUY NHẤT một object JSON theo đúng khung sau "
        "(quality_criteria có đủ mọi mã tiêu chí ở trên):",
        _OUTPUT_SCHEMA,
    ]
    return REPORT_SYSTEM_PROMPT.format(subject=subject), "\n".join(parts)
