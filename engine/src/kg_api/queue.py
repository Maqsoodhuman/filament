"""Async substrate seam (backend-guide D1 / P0-1).

The engine NEVER runs on the HTTP request path. Handlers persist + `enqueue()` a job and return
`status="queued"`; a worker (kg_api.worker) drains the queue and runs the engine off-path.

Two adapters behind one `Queue` interface, selected by `KG_QUEUE`:
  memory   — in-process deque, dev/test. Drained by an embedded worker thread or a test hook.
  postgres — a `jobs` table drained with `SELECT … FOR UPDATE SKIP LOCKED` by a `kg_api.worker`
             process the self-hoster runs against their existing Postgres (zero new infra).

Idempotency lives in the DATA layer, not the broker: `enqueue` collapses a duplicate
`idempotency_key` to the existing job, so a double-click on "Find connections" is one job. Payloads
carry IDs/refs, never note text (privacy + size)."""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Job:
    job_id: str
    user_id: str
    type: str  # ingest | connect_note | scan
    payload: dict
    status: str = "queued"  # queued | running | done | error
    surfaced_count: int | None = None


def _new_job_id() -> str:
    return "j_" + uuid.uuid4().hex[:10]


class Queue(Protocol):
    def enqueue(self, user_id: str, type: str, payload: dict, idempotency_key: str) -> Job: ...
    def claim(self, limit: int = 1) -> list[Job]: ...
    def ack(self, job_id: str, status: str, surfaced_count: int | None = None) -> None: ...
    def get(self, job_id: str) -> Job | None: ...


@dataclass
class InMemoryQueue:
    """Thread-safe in-process queue. Used by the dev/test path; an embedded worker thread (or a
    test hook) drains it. Idempotency_key collapses duplicate enqueues to the existing job."""

    _lock: threading.Lock = field(default_factory=threading.Lock)
    _jobs: dict[str, Job] = field(default_factory=dict)
    _queued: list[str] = field(default_factory=list)
    _by_idem: dict[str, str] = field(default_factory=dict)

    def enqueue(self, user_id: str, type: str, payload: dict, idempotency_key: str) -> Job:
        with self._lock:
            existing = self._by_idem.get(idempotency_key)
            if existing is not None:
                return self._jobs[existing]
            job = Job(job_id=_new_job_id(), user_id=user_id, type=type, payload=payload)
            self._jobs[job.job_id] = job
            self._by_idem[idempotency_key] = job.job_id
            self._queued.append(job.job_id)
            return job

    def claim(self, limit: int = 1) -> list[Job]:
        with self._lock:
            claimed: list[Job] = []
            while self._queued and len(claimed) < limit:
                jid = self._queued.pop(0)
                job = self._jobs[jid]
                job.status = "running"
                claimed.append(job)
            return claimed

    def ack(self, job_id: str, status: str, surfaced_count: int | None = None) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = status
                job.surfaced_count = surfaced_count

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)


@dataclass
class PgQueue:
    """Postgres `jobs` table drained with SELECT … FOR UPDATE SKIP LOCKED (migration 0007).
    This is the Community-production substrate: a `kg_api.worker` process drains it against the
    same Postgres that is the system of record — durable and zero new infra."""

    conninfo: str

    def __post_init__(self) -> None:
        import psycopg  # lazy: optional [postgres] extra

        self._conn = psycopg.connect(self.conninfo, autocommit=True)

    def enqueue(self, user_id: str, type: str, payload: dict, idempotency_key: str) -> Job:
        import json

        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jobs (job_id, user_id, type, payload, idempotency_key, status)
                VALUES (%s, %s, %s, %s, %s, 'queued')
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING job_id, status, surfaced_count
                """,
                (_new_job_id(), user_id, type, json.dumps(payload), idempotency_key),
            )
            row = cur.fetchone()
            if row is None:  # duplicate idempotency_key → return the existing job
                cur.execute(
                    "SELECT job_id, status, surfaced_count FROM jobs WHERE idempotency_key = %s",
                    (idempotency_key,),
                )
                row = cur.fetchone()
        return Job(job_id=row[0], user_id=user_id, type=type, payload=payload,
                   status=row[1], surfaced_count=row[2])

    def claim(self, limit: int = 1) -> list[Job]:
        with self._conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs SET status = 'running', locked_at = now()
                WHERE job_id IN (
                    SELECT job_id FROM jobs WHERE status = 'queued'
                    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT %s
                )
                RETURNING job_id, user_id, type, payload
                """,
                (limit,),
            )
            rows = cur.fetchall()
        return [Job(job_id=r[0], user_id=r[1], type=r[2], payload=r[3], status="running")
                for r in rows]

    def ack(self, job_id: str, status: str, surfaced_count: int | None = None) -> None:
        with self._conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET status = %s, surfaced_count = %s, updated_at = now() "
                "WHERE job_id = %s",
                (status, surfaced_count, job_id),
            )

    def get(self, job_id: str) -> Job | None:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT job_id, user_id, type, payload, status, surfaced_count "
                "FROM jobs WHERE job_id = %s",
                (job_id,),
            )
            r = cur.fetchone()
        if r is None:
            return None
        return Job(job_id=r[0], user_id=r[1], type=r[2], payload=r[3], status=r[4],
                   surfaced_count=r[5])


@dataclass
class DramatiqQueue:
    """Premium substrate (C4): the PG `jobs` table is the durable transactional outbox; enqueue
    also sends a Dramatiq `drain` message so a worker wakes immediately. If Redis is down the job is
    still durably queued (a scheduled tick/poll drains it later) — durability never depends on the
    broker. claim/ack/get delegate to the PG outbox."""

    pg: PgQueue

    def enqueue(self, user_id: str, type: str, payload: dict, idempotency_key: str) -> Job:
        job = self.pg.enqueue(user_id, type, payload, idempotency_key)
        try:
            from kg_api.broker import drain

            drain.send()
        except Exception:  # noqa: BLE001 — broker down: the outbox row persists, drained later
            pass
        return job

    def claim(self, limit: int = 1) -> list[Job]:
        return self.pg.claim(limit)

    def ack(self, job_id: str, status: str, surfaced_count: int | None = None) -> None:
        self.pg.ack(job_id, status, surfaced_count)

    def get(self, job_id: str) -> Job | None:
        return self.pg.get(job_id)


def make_queue(settings) -> Queue:
    """Select the async substrate from KG_QUEUE (mirrors make_backend / make_notes_repo)."""
    if settings.queue_backend in ("postgres", "redis"):
        if not settings.database_url:
            raise ValueError(f"KG_QUEUE={settings.queue_backend} requires DATABASE_URL (outbox)")
        from kg_engine.pipeline import _normalize_pg_url

        pg = PgQueue(_normalize_pg_url(settings.database_url))
        return DramatiqQueue(pg) if settings.queue_backend == "redis" else pg
    if settings.queue_backend == "memory":
        return InMemoryQueue()
    raise ValueError(f"unknown KG_QUEUE backend: {settings.queue_backend}")
