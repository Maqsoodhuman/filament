"""topical-vector cache: persist whole-note (topical) embeddings keyed by (content_hash,
embed_version).

Mirrors facet_cache (0002) but for the TOPICAL vector — the note-level embedding the engine uses
inversely (to reject same-topic pairs) and the Organize clustering reuses. Keyed by embed_version
(embed_model + dimension) NOT model_version, so a reason/verify prompt or q-threshold bump never
re-embeds the corpus (backend-guide D8). This closes the read-path re-embed cost (GET /clusters
previously re-embedded the whole corpus on every request).

Dimension defaults to 768 (nomic-embed-text); override KG_EMBED_DIM before running alembic for
Voyage (1024). 768-d and 1024-d topical vectors cannot share this column — a dimension change is a
re-embed migration, not an ALTER.

Revision ID: 0005_topical_cache
Revises: 0004_api_notes_tags
Create Date: 2026-06-26
"""
import os

from alembic import op

revision = "0005_topical_cache"
down_revision = "0004_api_notes_tags"
branch_labels = None
depends_on = None

_DIM = int(os.getenv("KG_EMBED_DIM", "768"))


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        f"""
        CREATE TABLE topical_cache (
            content_hash   text NOT NULL,
            embed_version  text NOT NULL,
            vec            vector({_DIM}) NOT NULL,
            PRIMARY KEY (content_hash, embed_version)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS topical_cache")
