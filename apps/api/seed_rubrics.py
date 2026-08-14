"""Seed rubrics chuẩn từ file .md sẵn có (idempotent theo key).

Chạy: python -m app.seed_rubrics
"""
from __future__ import annotations

import json
import logging

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.rubric import Rubric

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RUBRICS: list[dict] = [
    {
        "key": "code_review",
        "name": "Rubric Code Review (5 nhóm lỗi)",
        "scope": "code_review",
        "version": "1.0",
        "is_active": True,
        "config": {
            "categories": {
                "security": {"weight": 3, "label": "Bảo mật"},
                "logic_error": {"weight": 3, "label": "Logic/Bug"},
                "performance": {"weight": 2, "label": "Hiệu năng"},
                "code_smell": {"weight": 1, "label": "Code smell"},
                "convention": {"weight": 1, "label": "Convention"},
            },
            "severity_deduction": {
                "critical": 14, "high": 10, "medium": 6, "low": 3, "info": 1
            },
            "scope": {
                "allowed_extensions": [
                    ".py", ".js", ".ts", ".java", ".cs", ".go", ".rb",
                    ".php", ".c", ".cpp", ".h", ".jsx", ".tsx", ".html", ".css",
                ],
                "ignore_dirs": [
                    "node_modules", "dist", "build", "coverage", "target",
                    "__pycache__", ".next", "venv", ".venv", ".git",
                ],
            },
        },
    },
    {
        "key": "defense_sep490",
        "name": "SEP490 Capstone — Tiêu chí chấm bảo vệ",
        "scope": "defense",
        "version": "1.0",
        "is_active": True,
        "config": {
            "subject": {
                "code": "SEP490", "credits": 10, "scale": 10,
                "min_avg_to_pass": 5, "min_oga_to_pass": 5,
                "team_size": "4-5", "lang": "en",
            },
            "clo": [
                {"code": "CLO1", "desc": "Xác định vấn đề & lập SRS"},
                {"code": "CLO2", "desc": "Thiết kế giải pháp"},
                {"code": "CLO3", "desc": "Hiện thực + kiểm thử"},
                {"code": "CLO4", "desc": "Quản lý dự án"},
                {"code": "CLO5", "desc": "Viết báo cáo"},
                {"code": "CLO6", "desc": "Thuyết trình & giao tiếp"},
                {"code": "CLO7", "desc": "Thái độ chuyên nghiệp"},
            ],
            "artifacts": [
                {"key": "pmp", "label": "Project Management Plan"},
                {"key": "srs", "label": "SRS"},
                {"key": "sdd", "label": "SDD"},
                {"key": "std", "label": "Test Plan & STD"},
                {"key": "package", "label": "Software package & User guides"},
            ],
            "grading": {
                "oga": {
                    "weight": 50,
                    "items": {
                        "introduction": 4, "pmp": 8, "srs": 16, "sdd": 18,
                        "testing": 18, "user_guides": 4, "implementation": 32,
                    },
                },
                "tda": {
                    "weight": 50,
                    "items": {
                        "introduction": 5, "pmp": 5, "srs": 15, "sdd": 10,
                        "testing": 10, "user_guides": 5, "implementation": 35,
                        "presentation": 5, "qa": 10,
                    },
                },
            },
            "clo_map": {
                "CLO1": "srs", "CLO2": "sdd", "CLO3": "implementation+testing",
                "CLO4": "pmp", "CLO5": "user_guides+report", "CLO6": "presentation+qa",
                "CLO7": "attitude",
            },
            "quality_criteria": [
                {"key": "tinh_thuc_te", "label": "Tính thực tế", "levels": ["Đạt", "Khá", "Chưa đạt"]},
                {"key": "tinh_giai_quyet_van_de", "label": "Tính giải quyết vấn đề", "levels": ["Đạt", "Khá", "Chưa đạt"]},
                {"key": "br_chac", "label": "BR chắc", "levels": ["Đạt", "Khá", "Chưa đạt"]},
                {"key": "giai_quyet_van_de_hien_tai", "label": "Giải quyết 1 vấn đề hiện tại", "levels": ["Đạt", "Khá", "Chưa đạt"]},
            ],
            "pass_rules": {
                "fail_always": ["oga<5", "cheating"],
                "defer_round2": ["oga<5", "completed_uc<75%", "cannot_prove_self_made", "logic_errors>3", "show_stopper>1"],
                "redo": ["fail_round2", "oga<2"],
                "fail_individual": ["no_demo", "cannot_prove_self_made", "logic_errors>3", "show_stopper>1"],
            },
        },
    },
]


async def seed() -> None:
    """Seed chỉ tạo row nếu chưa tồn tại. DB là bản gốc — sửa data qua /admin."""
    async with async_session_maker() as db:
        for r in RUBRICS:
            existing = (await db.execute(select(Rubric).where(Rubric.key == r["key"]))).scalar_one_or_none()
            if existing:
                logger.info("skip (DB-first, exists): %s", r["key"])
                continue
            db.add(Rubric(**r))
            logger.info("seeded: %s", r["key"])
        await db.commit()
    logger.info("done")


if __name__ == "__main__":
    import asyncio
    asyncio.run(seed())
