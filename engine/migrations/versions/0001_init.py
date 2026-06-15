"""init: pgvector extension + users + notes (subset of db/schema.sql to prove the migration path)

Revision ID: 0001_init
Revises:
Create Date: 2026-06-15
"""
from alembic import op

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        """
        CREATE TABLE users (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            email       text UNIQUE NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE notes (
            id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id       uuid NOT NULL REFERENCES users(id),
            title         text NOT NULL DEFAULT '',
            body          text NOT NULL,
            source        text NOT NULL DEFAULT 'authored',
            content_hash  text NOT NULL,
            topical_vec   vector(1024),
            created_at    timestamptz NOT NULL DEFAULT now(),
            updated_at    timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX notes_dedup_idx ON notes (user_id, content_hash)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notes")
    op.execute("DROP TABLE IF EXISTS users")
