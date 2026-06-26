"""observability (C5/D9): pipeline_runs + stage_events + per-pair cost columns.

The gating product metrics are SQL over rows the system already writes; completed-connection rows
are blind to retries/timeouts/partial pipelines, so a privacy-contained Postgres stage_events table
closes that gap without standing up an OTel collector (deferred behind KG_OBSERVABILITY=postgres|otel).

Revision ID: 0008_observability
Revises: 0007_jobs
Create Date: 2026-06-26
"""
from alembic import op

revision = "0008_observability"
down_revision = "0007_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE pipeline_runs (
            run_id        text PRIMARY KEY,
            job_id        text,
            user_id       text NOT NULL,
            status        text NOT NULL DEFAULT 'running',  -- running | done | error
            model_version text,
            surfaced      int,
            started_at    timestamptz NOT NULL DEFAULT now(),
            finished_at   timestamptz
        )
        """
    )
    op.execute(
        """
        CREATE TABLE stage_events (
            id            bigserial PRIMARY KEY,
            run_id        text,
            stage         text NOT NULL,                    -- ingest | connect | scan
            status        text NOT NULL,                    -- started | ok | error | retry
            attempt       smallint NOT NULL DEFAULT 1,
            latency_ms    int,
            model_version text,
            created_at    timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX stage_events_run_idx ON stage_events (run_id)")
    op.execute("CREATE INDEX pipeline_runs_user_idx ON pipeline_runs (user_id, started_at DESC)")
    # per-pair cost/tokens on the surfaced-connection rows (null until a metered provider reports)
    op.execute("ALTER TABLE api_connections ADD COLUMN cost_usd numeric(10,6)")
    op.execute("ALTER TABLE api_connections ADD COLUMN tokens_in int")
    op.execute("ALTER TABLE api_connections ADD COLUMN tokens_out int")


def downgrade() -> None:
    op.execute("ALTER TABLE api_connections DROP COLUMN IF EXISTS tokens_out")
    op.execute("ALTER TABLE api_connections DROP COLUMN IF EXISTS tokens_in")
    op.execute("ALTER TABLE api_connections DROP COLUMN IF EXISTS cost_usd")
    op.execute("DROP TABLE IF EXISTS stage_events")
    op.execute("DROP TABLE IF EXISTS pipeline_runs")
