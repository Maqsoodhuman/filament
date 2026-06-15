"""engine backend: facet vector index + facet cache + lifetime pair dedup.

These three tables back kg_engine.pg_backend (PgStore + PgVectorIndex). They mirror the
in-memory semantics exactly:
  - facet_cache  : facets cached by (content_hash, model_version)         (InMemoryStore._facets)
  - pair_dedup   : a pair judged at most once per model_version           (InMemoryStore._judged_pairs)
  - facet_index  : the type-partitioned abstraction-space ANN index       (InMemoryVectorIndex)

The vector dimension is fixed at migration time (HNSW needs a typed column). It defaults to 768
(nomic-embed-text); override with KG_EMBED_DIM before running alembic for Voyage (1024) etc.
This is the engine's own backend store; it is independent of the notes/users FK graph in
db/schema.sql so the index can be keyed by the engine's opaque string note_id.

Revision ID: 0002_engine_backend
Revises: 0001_init
Create Date: 2026-06-15
"""
import os

from alembic import op

revision = "0002_engine_backend"
down_revision = "0001_init"
branch_labels = None
depends_on = None

_DIM = int(os.getenv("KG_EMBED_DIM", "768"))


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Facet cache: JSONB blob of the note's extracted facets (incl. embeddings), keyed exactly like
    # InMemoryStore — (content_hash, model_version). Idempotent re-extraction / model bumps fall out
    # of the composite PK.
    op.execute(
        """
        CREATE TABLE facet_cache (
            content_hash   text NOT NULL,
            model_version  text NOT NULL,
            facets         jsonb NOT NULL,
            created_at     timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (content_hash, model_version)
        )
        """
    )

    # Lifetime per-pair dedup: a pair is judged at most once ever per model_version. a_id/b_id are
    # stored normalized (a_id <= b_id) so (a,b) and (b,a) collapse to one row.
    op.execute(
        """
        CREATE TABLE pair_dedup (
            a_id           text NOT NULL,
            b_id           text NOT NULL,
            model_version  text NOT NULL,
            created_at     timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (a_id, b_id, model_version)
        )
        """
    )

    # Type-partitioned abstraction-space ANN index. One logical HNSW per facet_type via a partial
    # filter on facet_type in the query; the HNSW index covers facet_vec (cosine).
    op.execute(
        f"""
        CREATE TABLE facet_index (
            id             bigserial PRIMARY KEY,
            facet_type     text NOT NULL,
            note_id        text NOT NULL,
            facet_idx      int NOT NULL,
            salience       real NOT NULL,
            facet_vec      vector({_DIM}) NOT NULL,
            model_version  text NOT NULL DEFAULT ''
        )
        """
    )
    op.execute(
        "CREATE INDEX facet_index_hnsw ON facet_index "
        "USING hnsw (facet_vec vector_cosine_ops)"
    )
    op.execute("CREATE INDEX facet_index_type_idx ON facet_index (facet_type)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS facet_index")
    op.execute("DROP TABLE IF EXISTS pair_dedup")
    op.execute("DROP TABLE IF EXISTS facet_cache")
