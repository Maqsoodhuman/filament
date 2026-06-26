"""Dramatiq broker + the `drain` actor (C4 — the Premium async substrate).

Design: the Postgres `jobs` table is the durable, transactional outbox (written in the same txn as
the note/trigger). Dramatiq+Redis is only the DISTRIBUTION layer — a `drain` message wakes a worker
to pull from the outbox with SELECT … FOR UPDATE SKIP LOCKED. At-least-once delivery is safe because
idempotency lives in the data layer (UNIQUE(content_hash,model_version) + pair_dedup), so a
redundant drain is a no-op. This reuses the same Worker/PgQueue as the Community SKIP-LOCKED path —
only the wake mechanism differs.

Run the workers as a separate process:   dramatiq kg_api.broker
"""

from __future__ import annotations

import dramatiq
from dramatiq.brokers.redis import RedisBroker

from kg_engine import Settings

# RedisBroker ships Retries + TimeLimit + Shutdown middleware by default — don't re-add them.
_settings = Settings()
broker = RedisBroker(url=_settings.redis_url)
dramatiq.set_broker(broker)


@dramatiq.actor(max_retries=5, time_limit=300_000, queue_name="interactive")
def drain() -> None:
    """Wake a worker to drain the durable PG jobs outbox. Off the HTTP path; dedup-safe."""
    from kg_api.queue import make_queue
    from kg_api.repo import make_notes_repo
    from kg_api.worker import Worker

    s = Settings()
    Worker(s, make_queue(s), make_notes_repo(s)).run_once(limit=50)
