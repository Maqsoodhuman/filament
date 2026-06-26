"""user-scope the live API tables (P0-2): add user_id to api_notes / api_connections.

Connections are STRICTLY intra-user, so user_id is the leading scope on every query. Existing rows
default to 'u_local' (the Community single-tenant id) so the migration is safe without backfill.
The api_connections primary key gains user_id as its leading column (dedup is per
(user_id, a_id, b_id, model_version)).

Revision ID: 0006_api_user_id
Revises: 0005_topical_cache
Create Date: 2026-06-26
"""
from alembic import op

revision = "0006_api_user_id"
down_revision = "0005_topical_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE api_notes ADD COLUMN user_id text NOT NULL DEFAULT 'u_local'")
    op.execute("CREATE INDEX api_notes_user_idx ON api_notes (user_id, created_at DESC)")

    op.execute("ALTER TABLE api_connections ADD COLUMN user_id text NOT NULL DEFAULT 'u_local'")
    op.execute("ALTER TABLE api_connections DROP CONSTRAINT api_connections_pkey")
    op.execute(
        "ALTER TABLE api_connections "
        "ADD PRIMARY KEY (user_id, a_id, b_id, model_version)"
    )
    op.execute("CREATE INDEX api_connections_user_idx ON api_connections (user_id, a_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS api_connections_user_idx")
    op.execute("ALTER TABLE api_connections DROP CONSTRAINT api_connections_pkey")
    op.execute("ALTER TABLE api_connections ADD PRIMARY KEY (a_id, b_id, model_version)")
    op.execute("ALTER TABLE api_connections DROP COLUMN IF EXISTS user_id")
    op.execute("DROP INDEX IF EXISTS api_notes_user_idx")
    op.execute("ALTER TABLE api_notes DROP COLUMN IF EXISTS user_id")
