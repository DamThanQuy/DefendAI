"""
Prompt Templates cho Mock Room AI Q&A Engine.

Chứa các prompt template cho:
1. Question Generation - Sinh câu hỏi theo CLO
2. Answer Evaluation - Chấm điểm câu trả lời theo Rubric
3. Difficulty Adjustment - Điều chỉnh độ khó thích ứng
4. Hint Generation - Sinh gợi ý khi sinh viên trả lời sai
5. Summary Report - Báo cáo tổng kết phiên
"""

from typing import Dict, Any, List
from dataclasses import dataclass

# ============================================================================
# QUESTION GENERATION PROMPT
# ============================================================================

QUESTION_GEN_SYSTEM_PROMPT = """Bạn là hội đồng bảo vệ đồ án SEP490 (SMC-Ride System).

Nhiệm vụ: Tạo câu hỏi phản biện CHUYÊN SÂU theo CLO (Course Learning Outcome) được chỉ định.

QUY TẮC:
1. Chỉ trả về MỘT câu hỏi DUY NHẤT, đúng CLO được chỉ định.
2. Loại câu hỏi (type) phân bố: Clarification 20% | Deep-dive 50% | Challenge 30%.
3. Độ khó (difficulty): Easy → Medium → Hard (tùy adaptive logic).
4. Câu hỏi PHẢI dựa trên context tài liệu được cung cấp (RAG context).
5. KHÔNG được bịa đặt kiến thức ngoài tài liệu.
6. Trả về CHÍNH XÁC JSON format như yêu cầu, KHÔNG thêm markdown/text thừa."""

QUESTION_GEN_USER_PROMPT = """CONTEXT:
- Current CLO: {current_clo} (OGA Weight: {oga_weight}%, TDA Weight: {tda_weight}%)
- Coverage so far: {coverage}
- Document Context (RAG): {rag_context}
- Code Context: {code_context}
- Previous Q&A History: {history}

TASK: Generate NEXT question.

Return ONLY JSON (no markdown, no extra text):
{{
  "question": "string",
  "clo": "CLO1|CLO2|CLO3|CLO4|CLO5|CLO6|CLO7",
  "type": "Clarification|Deep-dive|Challenge",
  "difficulty": "Easy|Medium|Hard",
  "expected_keywords": ["keyword1", "keyword2", ...],
  "source_chunks": ["chunk_id_1", "chunk_id_2"]
}}"""

# ============================================================================
# ANSWER EVALUATION PROMPT
# ============================================================================

EVALUATION_SYSTEM_PROMPT = """Bạn là hội đồng chấm điểm bảo vệ đồ án SEP490 (SMC-Ride System).

NHIỆM VỤ: Đánh giá câu trả lời của sinh viên dựa trên RUBRIC SEP490.

RUBRIC WEIGHTS (tổng 100%):
- OGA (Overall Grading Assessment) 50%: introduction(4%), pmp(8%), srs(16%), sdd(18%), testing(18%), user_guides(4%), implementation(32%)
- TDA (Team/Defense Assessment) 50%: introduction(5%), pmp(5%), srs(15%), sdd(10%), testing(10%), user_guides(5%), implementation(35%), presentation(5%), qa(10%)

CLO MAP:
- CLO1 -> srs (OGA:16%, TDA:15%)
- CLO2 -> sdd (OGA:18%, TDA:10%)
- CLO3 -> implementation+testing (OGA:50%, TDA:45%)
- CLO4 -> pmp (OGA:8%, TDA:5%)
- CLO5 -> user_guides+report (OGA:8%, TDA:10%)
- CLO6 -> presentation+qa (OGA:0%, TDA:15%)
- CLO7 -> attitude (OGA:0%, TDA:0%)

QUALITY CRITERIA (Đánh giá chất lượng câu trả lời):
- tinh_thuc_te: Tính thực tế, khả thi
- tinh_giai_quyet_van_de: Tính giải quyết vấn đề
- br_chac: Business Rules chắc chắn
- giai_quyet_van_de_hien_tai: Giải quyết vấn đề hiện tại

NHIỆM VỤ: Chấm điểm câu trả lời theo rubric. Trả về JSON CHÍNH XÁC.
"""

EVALUATION_USER_PROMPT = """CONTEXT:
- Current CLO: {clo}
- Question Type: {question_type}
- Difficulty: {difficulty}
- Expected Keywords: {expected_keywords}
- Question: {question}
- Student Answer: {answer}

DOCUMENT CONTEXT:
{context}

TASK: Chấm điểm câu trả lời theo rubric SEP490.

Return ONLY JSON (no markdown, no extra text):
{{
  "oga_score": 0.0-10.0,
  "tda_score": 0.0-10.0,
  "feedback": "string - cụ thể, actionable: điểm mạnh, điểm yếu, cần bổ sung gì",
  "quality_criteria_met": ["tinh_thuc_te", "br_chac", ...],
  "confidence": 0.0-1.0
}}

RULES:
- Score dựa trên trọng số OGA/TDA của CLO tương ứng
- Feedback PHẢI cụ thể, actionable: nêu điểm mạnh, điểm yếu, cần bổ sung gì
- Nếu câu trả lời đúng trọng tâm → score cao
- Nếu thiếu keyword quan trọng → trừ điểm, nêu rõ thiếu gì
- Confidence: độ tin cậy của đánh giá (0.0-1.0)
"""

# ============================================================================
# DIFFICULTY ADJUSTMENT PROMPT
# ============================================================================

DIFFICULTY_ADJUSTMENT_PROMPT = """Bạn là hệ thống điều chỉnh độ khó thích ứng cho Mock Room.

RULES:
1. Answer quality >= 0.8 (xuất sắc) -> "deeper" (hỏi sâu hơn, trade-off, edge cases)
2. Answer quality >= 0.5 (khá) -> "same" (cùng level, hỏi khía cạnh khác)
3. Consecutive wrong >= 3 -> "switch_clo" (chuyển CLO khác, reset counter)
4. Consecutive wrong == 2 -> "hint" (cho hint + rephrase câu hỏi)
3. Consecutive wrong == 1 -> "hint" (gợi ý từ khóa nhẹ)
4. Default -> "same"

CONTEXT:
- Current CLO: {current_clo}
- Answer Quality: {answer_quality} (0.0-1.0)
- Consecutive Wrong: {consecutive_wrong}
- Time Remaining: {time_remaining} seconds
- Coverage: {coverage}
- Time Remaining: {time_remaining} seconds

Return ONLY JSON:
{{
  "action": "deeper|same|hint|switch_clo",
  "target_clo": "CLO1|CLO2|...|null",
  "reason": "string"
}}"""

# ============================================================================
# HINT GENERATION PROMPT
# ============================================================================

HINT_GENERATION_PROMPT = """Bạn là mentor hỗ trợ sinh viên khi bị kẹt ở câu hỏi.

CONTEXT:
- Question: {question}
- Expected Keywords: {expected_keywords}
- Student Answer Quality: {answer_quality} (0.0-1.0)
- Consecutive Wrong: {consecutive_wrong}
- Hint Level: {hint_level}  # 1=keyword, 2=rephrase, 3=step-by-step

TASK: Tạo gợi ý (hint) phù hợp.

HINT LEVELS:
1. keyword: Cho 2-3 từ khóa gợi ý chính
2. rephrase: Viết lại câu hỏi theo cách dễ hiểu hơn, gợi ý hướng tiếp cận
3. step-by-step: Dẫn dắt từng bước (Bước 1: ..., Bước 2: ...)

Return ONLY JSON:
{{
  "hint": "string",
  "level": 1|2|3
}}"""

# ============================================================================
# SUMMARY REPORT PROMPT
# ============================================================================

SUMMARY_REPORT_PROMPT = """Bạn là hội đồng bảo vệ đồ án SEP490.

TASK: Tạo báo cáo tổng kết phiên Mock Room cho sinh viên.

SESSION DATA:
- Duration: {duration_minutes} minutes
- Total Questions: {total_questions}
- CLO Coverage: {clo_coverage}
- OGA Final Score: {oga_final}
- TDA Final Score: {tda_final}
- Per-CLO Breakdown: {per_clo_breakdown}
- Question Log: {question_log}

TASK: Tạo báo cáo tổng kết JSON.

Return ONLY JSON:
{{
  "session_id": "string",
  "duration_minutes": int,
  "total_questions": int,
  "clo_coverage": {{"CLO1": 2, "CLO2": 2, ...}},
  "oga_final": float,
  "tda_final": float,
  "per_clo_breakdown": {{
    "CLO1": {{"oga_avg": 7.5, "tda_avg": 8.0, "count": 2}},
    ...
  }},
  "strengths": ["strength1", "strength2", ...],
  "weaknesses": ["weakness1", "weakness2", ...],
  "action_items": ["action1", "action2", ...],
  "question_log": [
    {{"clo": "CLO1", "question": "...", "answer_quality": 0.8, "oga_score": 8.5, "tda_score": 8.0}},
    ...
  ]
}}

RULES:
- Strengths: Các CLO có avg score >= 8.0
- Weaknesses: Các CLO có avg score < 6.0
- Action items: Gợi ý cụ thể để cải thiện từng weakness
- Tone: Khuyến khích, xây dựng, chuyên nghiệp
"""

# ============================================================================
# CLO QUERY TEMPLATES & KEYWORDS (for RAG retrieval)
# ============================================================================

CLO_QUERY_TEMPLATES = {
    "CLO1": "SRS problem statement actors use cases functional requirements business rules",
    "CLO2": "SDD architecture design patterns API specification database ERD sequence diagram",
    "CLO3": "implementation code structure modules testing CI/CD deployment",
    "CLO4": "PMP project management plan WBS risk management schedule resource",
    "CLO5": "user guide installation manual admin guide troubleshooting FAQ",
    "CLO6": "presentation demo communication skills Q&A defense",
    "CLO7": "attitude professional ethics teamwork learning",
}

CLO_KEYWORDS = {
    "CLO1": ["SRS", "requirement", "use case", "actor", "functional", "business rule", "actor"],
    "CLO2": ["architecture", "design", "ERD", "sequence", "API", "database", "schema", "component"],
    "CLO3": ["implementation", "code", "module", "test", "CI/CD", "deployment", "algorithm"],
    "CLO4": ["PMP", "WBS", "risk", "schedule", "resource", "milestone", "Gantt"],
    "CLO5": ["user guide", "manual", "installation", "tutorial", "FAQ", "troubleshoot"],
    "CLO6": ["presentation", "demo", "communication", "Q&A", "defense", "soft skill"],
    "CLO7": ["attitude", "professional", "ethics", "teamwork", "learning"],
}

QUESTION_TYPE_DISTRIBUTION = {
    "Clarification": 0.20,
    "Deep-dive": 0.50,
    "Challenge": 0.30,
}

CLO_NAMES = {
    "CLO1": "Xác định vấn đề & lập SRS",
    "CLO2": "Thiết kế giải pháp",
    "CLO3": "Hiện thực + kiểm thử",
    "CLO4": "Quản lý dự án",
    "CLO5": "Viết báo cáo",
    "CLO6": "Thuyết trình & giao tiếp",
    "CLO7": "Thái độ chuyên nghiệp"
}

CLO_PRIORITY = {
    "CLO1": 0.155,  # SRS: 16%+15% = 31% -> 15.5%
    "CLO2": 0.14,   # SDD: 18%+10% = 28% -> 14%
    "CLO3": 0.335,  # Implementation+Testing: 50%+45% = 95% -> 33.5%
    "CLO4": 0.065,  # PMP: 8%+5% = 13% -> 6.5%
    "CLO5": 0.045,  # User Guides: 4%+5% = 9% -> 4.5%
    "CLO6": 0.075,  # Presentation+QA: 5%+10% = 15% -> 7.5%
    "CLO7": 0.185,  # Attitude: quan trọng cho pass/fail
}

CLO_WEIGHTS_OGA = {
    "CLO1": 16, "CLO2": 18, "CLO3": 50,  # impl+testing = 32+18
    "CLO4": 8, "CLO5": 4, "CLO6": 0, "CLO7": 0
}

CLO_WEIGHTS_TDA = {
    "CLO1": 15, "CLO2": 10, "CLO3": 45,  # impl+testing = 35+10
    "CLO4": 5, "CLO5": 10, "CLO6": 15, "CLO7": 0
}

QUESTION_TYPE_DISTRIBUTION = {
    "Clarification": 0.20,
    "Deep-dive": 0.50,
    "Challenge": 0.30,
}

def get_clo_weight(clo: str, component: str) -> float:
    """Lấy trọng số OGA/TDA cho CLO."""
    if component == "OGA":
        return CLO_WEIGHTS_OGA.get(clo, 0)
    elif component == "TDA":
        return CLO_WEIGHTS_TDA.get(clo, 0)
    return 0

def get_next_clo(coverage: Dict[str, int]) -> str:
    """Chọn CLO tiếp theo dựa trên coverage gap + rubric weight."""
    missing = [clo for clo in CLO_NAMES.keys() if coverage.get(clo, 0) < 2]
    if not missing:
        return "CLO1"  # default
    
    # Score = priority * (1 - coverage_ratio)
    scores = {}
    for clo in missing:
        priority = CLO_PRIORITY.get(clo, 0)
        coverage_ratio = min(coverage.get(clo, 0) / 2.0, 1.0)
        scores[clo] = priority * (1 - coverage_ratio)
    
    return max(scores, key=scores.get)

def get_question_type_distribution() -> Dict[str, float]:
    return QUESTION_TYPE_DISTRIBUTION.copy()

def get_clo_name(clo: str) -> str:
    return CLO_NAMES.get(clo, clo)

def get_clo_weight_oga(clo: str) -> float:
    return CLO_WEIGHTS_OGA.get(clo, 0)

def get_clo_weight_tda(clo: str) -> float:
    return CLO_WEIGHTS_TDA.get(clo, 0)


def format_coverage(coverage: Dict[str, int]) -> Dict[str, Any]:
    """Format coverage info cho prompt."""
    total = sum(coverage.values())
    covered = sum(1 for v in coverage.values() if v > 0)
    total_target = 7
    
    details = {}
    for clo in CLO_NAMES.keys():
        count = coverage.get(clo, 0)
        target = 2  # target 2 questions per CLO
        details[clo] = {
            "name": CLO_NAMES.get(clo, clo),
            "current": count,
            "target": target,
            "progress": min(count / target, 1.0),
        }
    
    return {
        "total_questions": sum(coverage.values()),
        "clo_covered": sum(1 for v in coverage.values() if v > 0),
        "total_clo": 7,
        "details": details,
    }


def format_clo_weights(clo: str) -> Dict[str, Any]:
    """Format CLO weights cho prompt."""
    return {
        "clo": clo,
        "name": CLO_NAMES.get(clo, clo),
        "oga_weight": get_clo_weight_oga(clo),
        "tda_weight": get_clo_weight_tda(clo),
    }