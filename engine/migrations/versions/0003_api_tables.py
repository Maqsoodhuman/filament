"""api tables: persisted notes + surfaced connections for the live API (kg_api.repo).

These back kg_api.repo.PgNotesRepo so the running API is stateful on Postgres: notes and
surfaced connections survive a process restart when KG_STORE_BACKEND=postgres. They mirror the
in-memory API state (kg_api.main globals + the engine's surfaced() output) 1:1.

Naming: these are PREFIXED `api_` rather than reusing the `notes`/`connections` tables in
0001_init / db/schema.sql on purpose. Those are the multi-user product schema (uuid PKs, user_id
FKs, vector columns). The live engine works with opaque STRING note ids (`n_xxxx`) and is not yet
user-scoped, so the API persistence layer keeps its own minimal, string-keyed tables — exactly the
pattern migration 0002 already uses for `facet_index` (text note_id, independent of the FK graph).
When the product wires in real users, these collapse into the schema.sql tables; until then they
keep the in-memory and Postgres API paths behaviorally identical.

Columns are kept minimal per the task: notes carry id/title/body/source/created_at; connection
rows carry the scored fields and are keyed/deduped by (a_id, b_id, model_version).

Revision ID: 0003_api_tables
Revises: 0002_engine_backend
Create Date: 2026-06-15
"""
from alembic import op

revision = "0003_api_tables"
down_revision = "0002_engine_backend"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE api_notes (
            id          text PRIMARY KEY,
            title       text NOT NULL DEFAULT '',
            body        text NOT NULL,
            source      text NOT NULL DEFAULT 'authored',
            created_at  timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX api_notes_created_idx ON api_notes (created_at DESC)")

    # Surfaced connections, keyed/deduped by (a_id, b_id, model_version). a_id/b_id are stored as
    # the engine emits them (a_title/b_title come along so reads need no note join). Re-running the
    # engine ON CONFLICT-updates the scores rather than duplicating a pair.
    op.execute(
        """
        CREATE TABLE api_connections (
            a_id            text NOT NULL,
            b_id            text NOT NULL,
            model_version   text NOT NULL,
            a_title         text NOT NULL DEFAULT '',
            b_title         text NOT NULL DEFAULT '',
            facet_type      text NOT NULL,
            statement       text NOT NULL,
            validity        smallint NOT NULL,
            nonobviousness  smallint NOT NULL,
            generic         boolean NOT NULL DEFAULT false,
            created_at      timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (a_id, b_id, model_version)
        )
        """
    )
    op.execute("CREATE INDEX api_connections_a_idx ON api_connections (a_id)")
    op.execute("CREATE INDEX api_connections_b_idx ON api_connections (b_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS api_connections")
    op.execute("DROP TABLE IF EXISTS api_notes")
