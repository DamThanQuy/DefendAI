"""
Migration: Create messages table and migrate data

This migration:
1. Creates the new `messages` table (ChatGPT-style)
2. Migrates data from `workspace_chats`
3. Creates conversations table if not exists
4. Updates indexes for performance
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision = 'create_messages_table'
down_revision = None  # Adjust to your latest migration
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    
    # 1. Check if messages table already exists
    tables = sa.inspect(conn).get_table_names()
    if 'messages' in tables:
        print("Table 'messages' already exists, skipping creation.")
        return
    
    # 2. Create conversations table (if not exists)
    op.execute("""
        CREATE TABLE IF NOT EXISTS workspace_conversations (
            id SERIAL PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
            conversation_id VARCHAR(50) NOT NULL,
            name VARCHAR(100) NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE(workspace_id, conversation_id)
        )
    """)
    
    # 3. Create messages table
    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.String(50), nullable=True),
        sa.Column('role', sa.String(20), nullable=False),  # system, user, assistant
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('citations', sa.Text(), nullable=True),  # JSON string
        sa.Column('tokens', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, default='completed'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('persona', sa.String(50), nullable=False, default='theory'),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=sa.func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
    )
    
    # 4. Create indexes
    op.create_index('ix_messages_workspace_id', 'messages', ['workspace_id'])
    op.create_index('ix_messages_conversation_id', 'messages', ['conversation_id'])
    op.create_index('ix_messages_created_at', 'messages', ['created_at'])
    op.create_index('ix_messages_role', 'messages', ['role'])
    
    # 5. Migrate data from workspace_chats
    # First, create default conversation for NULL conversation_id
    op.execute("""
        INSERT INTO workspace_conversations (workspace_id, conversation_id, name)
        SELECT DISTINCT workspace_id, 'default', 'Đoạn mặc định'
        FROM workspace_chats
        WHERE conversation_id IS NULL
        ON CONFLICT (workspace_id, conversation_id) DO NOTHING
    """)
    
    # Migrate completed messages
    op.execute("""
        INSERT INTO messages (workspace_id, conversation_id, role, content, citations, tokens, status, persona, created_at)
        SELECT 
            workspace_id,
            COALESCE(conversation_id, 'default'),
            CASE 
                WHEN question IS NOT NULL AND answer IS NOT NULL THEN 'user'
                WHEN answer IS NOT NULL THEN 'assistant'
                ELSE 'user'
            END,
            CASE 
                WHEN question IS NOT NULL THEN question
                ELSE COALESCE(answer, '')
            END,
            citations::text,
            LENGTH(COALESCE(question, '') + COALESCE(answer, '')) / 4,
            status,
            persona,
            created_at
        FROM workspace_chats
        WHERE status = 'completed'
        ORDER BY created_at ASC
    """)
    
    # Migrate failed messages
    op.execute("""
        INSERT INTO messages (workspace_id, conversation_id, role, content, error, status, persona, created_at)
        SELECT 
            workspace_id,
            COALESCE(conversation_id, 'default'),
            'user',
            question,
            error,
            status,
            persona,
            created_at
        FROM workspace_chats
        WHERE status IN ('failed', 'processing')
        ORDER BY created_at ASC
    """)
    
    # 6. Add summary column for old messages (optional optimization)
    op.add_column('messages', sa.Column('summary', sa.Text(), nullable=True))
    
    print(f"Migrated messages from workspace_chats")


def downgrade():
    # Drop messages table
    op.drop_table('messages')
    
    # Drop conversations table
    op.drop_table('workspace_conversations')
    
    # Note: workspace_chats is preserved for rollback safety
