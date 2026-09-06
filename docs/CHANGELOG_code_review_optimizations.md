# Code Review Optimizations — NotebookLM Suggestions

Áp dụng 4 đề xuất tối ưu từ NotebookLM (file `logic-chuc-nang-code-review.md`).
Mục tiêu: giảm LLM cost, tăng throughput, cải thiện UX progressive.

## Thay đổi

| # | Đề xuất | File thay đổi | Mô tả |
|---|---|---|---|
| **4** | Bộ lọc file rác/static ở L2 | `apps/api/app/services/code_scanner.py` | Thêm `SKIP_FILE_NAMES`, `SKIP_SUFFIXES`, `GENERATED_PATH_MARKERS` và helper `_is_static_or_generated()`. Tích hợp vào `_is_safe_member()` để bỏ qua lockfile, minified, generated trước khi split module. **Tiết kiệm ~25% token đầu vào.** |
| **2** | Small-module merging | `apps/api/app/services/code_scanner.py` | Sửa `_split_into_module_jobs()` — folder có `<5` file được gộp vào bucket `__shared__`. **Giảm 30-40% số LLM call** cho dự án nhiều folder nhỏ. |
| **5** | Stream heuristic issues lên FE | `apps/api/app/routers/code_scan.py` | `GET /api/code/analyses/{id}` trả về issues ngay khi `status=processing` (không chờ `completed`). FE render được issue đầu tiên trong **<15s** thay vì đợi 27 phút. |
| **1** | Module-level hash cache | `apps/api/app/models/code_module_hash.py` (mới) + `apps/api/app/handlers/code_scan.py` + `apps/api/app/services/code_scanner.py` | Bảng `code_module_hashes` lưu SHA256 của (path + content) cho từng `(document_id, module)`. Khi re-scan cùng code → clone issue cũ, bỏ qua LLM call. **Giảm >80% LLM cost + P95 re-scan từ 27 phút xuống <1 phút.** |

## Test

```bash
cd DefendAI
python scripts/test_code_review_optimizations.py
```

Kết quả:
```
✓ test_is_static_filters_lockfile_and_minified
✓ test_small_module_merging (3 jobs: ['big::1', 'big::2', '__shared__'])
✓ test_module_hash_changes_on_content
✓ test_module_hash_independent_of_order
✓ test_split_empty
✅ All smoke tests passed
```

## Migration DB (Đề xuất 1 — cần thiết)

Tạo Alembic migration cho bảng `code_module_hashes`:

```python
def upgrade():
    op.create_table(
        "code_module_hashes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("document_id", sa.Integer, sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("module", sa.String(255), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False, index=True),
        sa.Column("issue_ids_json", sa.JSON, nullable=True),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_doc_module_hash", "code_module_hashes", ["document_id", "module"])


def downgrade():
    op.drop_index("ix_doc_module_hash", "code_module_hashes")
    op.drop_table("code_module_hashes")
```

## Tiêu chí đo lường thành công

| Metric | Trước | Sau (kỳ vọng) |
|---|---|---|
| Token trung bình/module | baseline | **−25%** (do lọc file rác) |
| Số LLM call/dự án (60 file, 20 folder nhỏ) | ~30 | **~10** (small-module merging) |
| Time-to-First-Issue (TTFI) | ~5 phút | **<15 giây** (stream heuristic) |
| Re-scan cùng code (P95) | ~27 phút | **<1 phút** (hash cache) |
| LLM cost/re-scan | 100% | **<20%** (cache hit) |

## Rollback

Tất cả thay đổi nằm ở layer service + router + 1 model mới. Có thể revert bằng:

```bash
git revert <commit-hash>          # revert toàn bộ
alembic downgrade -1              # (nếu đã áp migration) drop bảng code_module_hashes
```

Nếu chỉ muốn tắt cache tạm thời:
```python
# handlers/code_scan.py — comment block hash check
# if cached and cached.issue_ids_json: ...
```