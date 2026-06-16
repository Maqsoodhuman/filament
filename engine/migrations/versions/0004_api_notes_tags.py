"""api_notes.tags: persist note hashtags for the live API (kg_api.repo.PgNotesRepo).

Tags are API-layer metadata (the editor saves them; the Organize map will later use them). The
engine never sees tags — they are not an input to extraction/reasoning/verification. Stored as a
Postgres text[] so a note's `["economics", "game-theory"]` round-trips without a join table; this
mirrors the in-memory path (StoredNote.tags / kg_api.main._tags). Defaults to an empty array so
existing rows and seeded golden notes are valid without backfill.

Revision ID: 0004_api_notes_tags
Revises: 0003_api_tables
Create Date: 2026-06-15
"""
from alembic import op

revision = "0004_api_notes_tags"
down_revision = "0003_api_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE api_notes ADD COLUMN tags text[] NOT NULL DEFAULT '{}'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE api_notes DROP COLUMN IF EXISTS tags")
