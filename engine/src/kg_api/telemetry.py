"""Observability seam (C5 / D9): per-job pipeline_runs + stage_events.

Day-1 observability is SQL over rows we already write — no OTel collector (deferred behind
KG_OBSERVABILITY=otel). The worker records one pipeline_run + a stage_event per job so the
false-match-rate / latency / retry canaries are queryable. Privacy-contained: only ids, stage,
status, latency, and model_version are stored — never note text.

`make_recorder` returns a no-op unless KG_OBSERVABILITY=postgres on the Postgres backend, so the
default in-memory dev/test path stays infra-free."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Protocol


class Recorder(Protocol):
    def record(self, job, model_version: str, status: str, latency_ms: int,
               surfaced: int | None) -> None: ...


@dataclass
class NullRecorder:
    """In-memory dev/test default — keeps the last few records for inspection, writes nothing."""

    events: list[dict] = field(default_factory=list)

    def record(self, job, model_version: str, status: str, latency_ms: int,
               surfaced: int | None) -> None:
        self.events.append(
            {"job": job.job_id, "type": job.type, "status": status, "latency_ms": latency_ms}
        )
        if len(self.events) > 100:
            self.events.pop(0)


@dataclass
class PgRecorder:
    conninfo: str

    def __post_init__(self) -> None:
        import psycopg

        self._conn = psycopg.connect(self.conninfo, autocommit=True)

    def record(self, job, model_version: str, status: str, latency_ms: int,
               surfaced: int | None) -> None:
        run_id = "run_" + uuid.uuid4().hex[:12]
        stage = "scan" if job.type == "scan" else "connect"
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pipeline_runs (run_id, job_id, user_id, status, model_version,
                                           surfaced, finished_at)
                VALUES (%s, %s, %s, %s, %s, %s, now())
                """,
                (run_id, job.job_id, job.user_id, status, model_version, surfaced),
            )
            cur.execute(
                """
                INSERT INTO stage_events (run_id, stage, status, latency_ms, model_version)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (run_id, stage, "ok" if status == "done" else "error", latency_ms, model_version),
            )


def make_recorder(settings) -> Recorder:
    if (
        settings.observability == "postgres"
        and settings.store_backend == "postgres"
        and settings.database_url
    ):
        from kg_engine.pipeline import _normalize_pg_url

        return PgRecorder(_normalize_pg_url(settings.database_url))
    return NullRecorder()
