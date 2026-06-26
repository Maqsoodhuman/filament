"""async substrate: the `jobs` table = the Postgres SKIP LOCKED queue (P0-1, KG_QUEUE=postgres).

Handlers persist + enqueue a job here and return status=queued; a `kg_api.worker` process drains it
with SELECT … FOR UPDATE SKIP LOCKED and runs the engine off the HTTP path. idempotency_key is
UNIQUE so a double-click on "Find connections" collapses to one job (data-layer idempotency).

Revision ID: 0007_jobs
Revises: 0006_api_user_id
Create Date: 2026-06-26
"""
from alembic import op

revision = "0007_jobs"
down_revision = "0006_api_user_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE jobs (
            job_id          text PRIMARY KEY,
            user_id         text NOT NULL,
            type            text NOT NULL,
            payload         jsonb NOT NULL,
            idempotency_key text NOT NULL UNIQUE,
            status          text NOT NULL DEFAULT 'queued',
            surfaced_count  int,
            locked_at       timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX jobs_queue_idx ON jobs (status, created_at) WHERE status = 'queued'"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS jobs")
