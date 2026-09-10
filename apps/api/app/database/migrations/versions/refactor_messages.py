"""
Migration: Refactor workspace_chats → messages table (ChatGPT-style)

Lý do:
- ChatGPT lưu flat messages, không phải Q&A pairs
- Hỗ trợ multi-turn conversation linh hoạt
- Dễ dàng implement summary/scrollback
- Token tracking per-message cho context window management

Changes:
1. Tạo bảng messages (conversation_id, role, content, tokens, created_at)
2. Migrates data từ workspace_chats → messages
3. Drop workspace_chats (hoặc giữ lại để rollback)
4. Update API endpoints để dùng messages thay vì chats
"""

from alembic import op
import sqlalchemy as sa

# Revision identifiers
revision = 'refactor_messages'
down_revision = None  # Adjust to your latest migration
branch_labels = None
depends_on = None

def upgrade():
    # 1. Tạo bảng messages mới
    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('conversation_id', sa.String(50), nullable=False, index=True),
        sa.Column('workspace_id', sa.Integer(), nullable=False, index=True),
        sa.Column('role', sa.String(20), nullable=False),  # 'system', 'user', 'assistant'
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tokens', sa.Integer(), nullable=True),  # token estimation
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
    )
    
    # 2. Migrate data từ workspace_chats
    # System message (nếu có)
    op.execute("""
        INSERT INTO messages (conversation_id, workspace_id, role, content, created_at)
        SELECT 
            COALESCE(conversation_id, 'default'),
            workspace_id,
            'system',
            'Bạn là trợ lý học thuật trả lời câu hỏi về đồ án tốt nghiệp.',
            created_at
        FROM workspace_chats
        WHERE persona IS NOT NULL
        GROUP BY workspace_id, conversation_id
    """)
    
    # User và Assistant messages
    op.execute("""
        INSERT INTO messages (conversation_id, workspace_id, role, content, created_at)
        SELECT 
            COALESCE(conversation_id, 'default'),
            workspace_id,
            CASE WHEN id % 2 = 1 THEN 'user' ELSE 'assistant' END,
            CASE WHEN id % 2 = 1 THEN question ELSE COALESCE(answer, '') END,
            created_at
        FROM workspace_chats
        WHERE status = 'completed'
        ORDER BY created_at
    """)
    
    # 3. Tính tokens cho mỗi message (estimate: 4 chars ≈ 1 token)
    op.execute("""
        UPDATE messages 
        SET tokens = LENGTH(content) / 4
        WHERE tokens IS NULL
    """)
    
    # 4. Drop old table (comment out nếu muốn giữ để rollback)
    # op.drop_table('workspace_chats')

def downgrade():
    # Restore workspace_chats nếu cần
    # op.create_table('workspace_chats', ...)
    pass
