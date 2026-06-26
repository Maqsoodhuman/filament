"""The worker — the ONLY place the engine runs (backend-guide P0-1).

It drains the queue (kg_api.queue) and runs the connection pipeline off the HTTP path, scoped to a
single user's persisted corpus, then upserts the surfaced connections. Run it as a process:

    python -m kg_api.worker            # drains KG_QUEUE forever (Community: the PG SKIP LOCKED queue)

In the dev/test (memory) path the API can also run it embedded in a background thread (see
kg_api.main), but it is still off the request handler — handlers only enqueue.

Idempotency is data-layer: a fresh per-job engine on the Postgres backend re-checks the facet/
topical caches and the pair_dedup table before any paid call, so redelivery is a cheap no-op."""

from __future__ import annotations

import threading
from dataclasses import dataclass

from kg_api.queue import Job, Queue, make_queue
from kg_api.repo import NotesRepo, make_notes_repo
from kg_engine import Engine, Settings


@dataclass
class Worker:
    settings: Settings
    queue: Queue
    repo: NotesRepo

    def __post_init__(self) -> None:
        from kg_api.telemetry import make_recorder

        self.recorder = make_recorder(self.settings)

    def _build_engine(self, user_id: str) -> Engine:
        """A user-scoped engine hydrated from that user's persisted notes. On the Postgres backend
        the facet/topical caches + pair_dedup make this cheap and never re-bill (content_hash,
        model_version keyed). Connections are STRICTLY intra-user — only this user's notes enter."""
        eng = Engine(self.settings)
        eng.ingest(self.repo.all_notes(user_id))
        return eng

    def process(self, job: Job) -> int:
        eng = self._build_engine(job.user_id)
        surfaced = eng.surfaced()
        self.repo.upsert_connections(job.user_id, surfaced)
        if job.type == "connect_note":
            nid = job.payload.get("note_id")
            return sum(1 for c in surfaced if nid in (c.a_id, c.b_id))
        return len(surfaced)

    def run_once(self, limit: int = 10) -> int:
        """Claim and process up to `limit` jobs. Returns how many were processed."""
        import time

        jobs = self.queue.claim(limit)
        mv = self.settings.model_version()
        for job in jobs:
            t0 = time.monotonic()
            try:
                count = self.process(job)
                self.queue.ack(job.job_id, "done", count)
                self.recorder.record(job, mv, "done", int((time.monotonic() - t0) * 1000), count)
            except Exception:  # noqa: BLE001 — a bad job must not kill the worker loop
                self.queue.ack(job.job_id, "error", None)
                self.recorder.record(job, mv, "error", int((time.monotonic() - t0) * 1000), None)
        return len(jobs)

    def run_forever(self, poll_seconds: float = 0.1, stop: threading.Event | None = None) -> None:
        stop = stop or threading.Event()
        while not stop.is_set():
            if self.run_once() == 0:
                stop.wait(poll_seconds)


def main() -> int:
    settings = Settings()
    worker = Worker(settings, make_queue(settings), make_notes_repo(settings))
    print(f"kg_api.worker draining queue={settings.queue_backend} store={settings.store_backend}")
    worker.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
