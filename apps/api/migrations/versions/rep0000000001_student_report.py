"""student report: chủ sở hữu trên meetings + nhận xét định tính trên reports

- meetings.student_id / workspace_id: biết buổi bảo vệ thuộc sinh viên & đồ án
  nào (thay heuristic so tên trong services/meeting_workspace.py). Backfill
  student_id cho phòng mock mentor từ mock_bookings.
- reports: nguồn, trạng thái AI tổng hợp, liên kết phiên Mock AI (unique),
  nhận xét định tính theo rubric (4 tiêu chí, mạnh/yếu/gợi ý, độ phủ CLO),
  snapshot hội thoại. Report cũ (điểm giả, không có chủ) giữ nguyên — không
  hiện với ai vì meeting của chúng không có student_id.
- rubric defense_sep490: bổ sung item_labels + mô tả 4 tiêu chí chất lượng.
  Chỉ điền phần còn thiếu, không ghi đè chỉnh sửa của admin.

Revision ID: rep0000000001
Revises: major000000001
Create Date: 2026-11-02
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'rep0000000001'
down_revision: Union[str, None] = 'major000000001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ITEM_LABELS = {
    "introduction": "Project Introduction",
    "pmp": "Project Management Plan",
    "srs": "Software Requirement (SRS)",
    "sdd": "Software Design (SDD)",
    "testing": "Testing (STD)",
    "user_guides": "User Guides",
    "implementation": "Implementation",
    "presentation": "Presentation Skills",
    "qa": "Q&A",
}

CRITERIA_DESCRIPTIONS = {
    "tinh_thuc_te": "Đồ án chạy được với người dùng thật? Đạt: chạy end-to-end, UI/UX dùng được, deploy được, dữ liệu thật. Chưa đạt: chỉ demo trên máy dev, hardcode, UI vỡ.",
    "tinh_giai_quyet_van_de": "Có tư duy phân tích? Đạt: phân tích nguyên nhân rõ, chọn giải pháp có trade-off, xử lý edge case. Chưa đạt: copy/paste không hiểu, không giải thích được vì sao chọn cách làm.",
    "br_chac": "Yêu cầu nghiệp vụ rõ, đầy đủ, nhất quán? Đạt: SRS/use case rõ, coverage đủ, map được BR → chức năng. Chưa đạt: BR mơ hồ, thiếu use case trọng yếu, tự bịa yêu cầu.",
    "giai_quyet_van_de_hien_tai": "Đồ án giải quyết pain-point thực tế (không làm lại cái đã có)? Đạt: nêu được pain-point, có khảo sát/so sánh, giá trị rõ. Chưa đạt: đề tài chung chung kiểu 'hệ thống quản lý X', không chỉ rõ vấn đề.",
}


def _patch_rubric() -> None:
    bind = op.get_bind()
    row = bind.execute(
        sa.text("SELECT id, config FROM rubrics WHERE key = 'defense_sep490'")
    ).fetchone()
    if row is None:
        return  # chưa seed → seed_rubrics.py đã có sẵn 2 phần này
    config = row.config if isinstance(row.config, dict) else json.loads(row.config)

    changed = False
    if not config.get("item_labels"):
        config["item_labels"] = ITEM_LABELS
        changed = True
    for criterion in config.get("quality_criteria") or []:
        desc = CRITERIA_DESCRIPTIONS.get(criterion.get("key"))
        if desc and not criterion.get("description"):
            criterion["description"] = desc
            changed = True

    if changed:
        # Cột config tạo bằng sa.JSON (json, không phải jsonb) → truyền chuỗi
        # JSON không ép kiểu, Postgres tự coerce theo kiểu cột.
        bind.execute(
            sa.text(
                "UPDATE rubrics SET config = :config, "
                "updated_at = timezone('utc', now()) WHERE id = :id"
            ),
            {"config": json.dumps(config, ensure_ascii=False), "id": row.id},
        )


def upgrade() -> None:
    # ── meetings: chủ buổi + đồ án ──
    op.add_column('meetings', sa.Column('student_id', sa.Integer(), nullable=True))
    op.add_column('meetings', sa.Column('workspace_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_meetings_student_id', 'meetings', 'users',
        ['student_id'], ['id'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_meetings_workspace_id', 'meetings', 'workspaces',
        ['workspace_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_meetings_student_id', 'meetings', ['student_id'])
    op.create_index('ix_meetings_workspace_id', 'meetings', ['workspace_id'])
    op.execute(
        "UPDATE meetings m SET student_id = b.student_id "
        "FROM mock_bookings b WHERE b.meeting_id = m.id AND m.student_id IS NULL"
    )

    # ── reports: nhận xét định tính + trạng thái tổng hợp ──
    op.add_column('reports', sa.Column('source', sa.String(length=20), nullable=False, server_default='ai_mock'))
    op.add_column('reports', sa.Column('generation_status', sa.String(length=20), nullable=False, server_default='ready'))
    op.add_column('reports', sa.Column('generation_error', sa.Text(), nullable=True))
    op.add_column('reports', sa.Column('mock_session_id', sa.Integer(), nullable=True))
    op.add_column('reports', sa.Column('document_id', sa.Integer(), nullable=True))
    op.add_column('reports', sa.Column('quality_criteria', sa.JSON(), nullable=True))
    op.add_column('reports', sa.Column('strengths', sa.JSON(), nullable=True))
    op.add_column('reports', sa.Column('action_items', sa.JSON(), nullable=True))
    op.add_column('reports', sa.Column('clo_breakdown', sa.JSON(), nullable=True))
    op.add_column('reports', sa.Column('transcript', sa.JSON(), nullable=True))
    op.add_column('reports', sa.Column('rubric_version', sa.String(length=20), nullable=True))
    op.add_column('reports', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE reports SET updated_at = created_at WHERE updated_at IS NULL")
    op.alter_column('reports', 'updated_at', nullable=False)
    op.create_foreign_key(
        'fk_reports_mock_session_id', 'reports', 'mock_chat_sessions',
        ['mock_session_id'], ['id'], ondelete='SET NULL',
    )
    op.create_unique_constraint('uq_reports_mock_session_id', 'reports', ['mock_session_id'])

    _patch_rubric()


def downgrade() -> None:
    # item_labels / description trong rubric giữ nguyên: key thừa vô hại và có
    # thể admin đã chỉnh sửa sau đó.
    op.drop_constraint('uq_reports_mock_session_id', 'reports', type_='unique')
    op.drop_constraint('fk_reports_mock_session_id', 'reports', type_='foreignkey')
    for col in (
        'updated_at', 'rubric_version', 'transcript', 'clo_breakdown', 'action_items',
        'strengths', 'quality_criteria', 'document_id', 'mock_session_id',
        'generation_error', 'generation_status', 'source',
    ):
        op.drop_column('reports', col)

    op.drop_index('ix_meetings_workspace_id', table_name='meetings')
    op.drop_index('ix_meetings_student_id', table_name='meetings')
    op.drop_constraint('fk_meetings_workspace_id', 'meetings', type_='foreignkey')
    op.drop_constraint('fk_meetings_student_id', 'meetings', type_='foreignkey')
    op.drop_column('meetings', 'workspace_id')
    op.drop_column('meetings', 'student_id')
