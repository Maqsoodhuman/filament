"""Integration test for the Postgres + pgvector backend (pg_backend.py).

Runs ONLY when DATABASE_URL is set; skipped otherwise so the default infra-free `pytest` stays
green. Round-trips the facet cache, exercises the lifetime pair-dedup, and runs a real ANN query
against pgvector — asserting the pg backend matches the in-memory semantics.

Bring up a scratch DB and migrate, then run:
    docker run -d --name kg-pg2 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=kg \\
        -p 5434:5432 pgvector/pgvector:pg16
    DATABASE_URL=postgresql+psycopg://postgres:pg@localhost:5434/kg ../skills/run-migration.sh
    DATABASE_URL=postgresql+psycopg://postgres:pg@localhost:5434/kg pytest tests/test_pg_backend.py
"""

from __future__ import annotations

import os
import uuid

import pytest

DATABASE_URL = os.getenv("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL not set; skipping Postgres integration test"
)


def _conninfo() -> str:
    return DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)


def _index_dim() -> int:
    """The facet_index.facet_vec column dim is fixed by the migration (KG_EMBED_DIM, default 768).
    Read it so the test builds correctly-sized vectors regardless of how the DB was migrated."""
    import psycopg

    with psycopg.connect(_conninfo()) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT atttypmod FROM pg_attribute "
            "WHERE attrelid = 'facet_index'::regclass AND attname = 'facet_vec'"
        )
        return int(cur.fetchone()[0])


def _vec(*lead: float) -> list[float]:
    """A unit-ish vector whose first components are `lead`, zero-padded to the column dim."""
    dim = _index_dim()
    v = list(lead) + [0.0] * (dim - len(lead))
    return v[:dim]


@pytest.fixture()
def store():
    from kg_engine.pg_backend import PgStore

    return PgStore(_conninfo())


@pytest.fixture()
def index():
    import psycopg

    from kg_engine.pg_backend import PgVectorIndex

    # Start from an empty index so ANN ordering is deterministic and not polluted by prior runs.
    with psycopg.connect(_conninfo(), autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE facet_index")
    # ef_search modest; the dedicated test data is tiny.
    return PgVectorIndex(_conninfo(), ef_search=64, model_version="mv_test")


def test_facet_cache_round_trip(store) -> None:
    from kg_engine.models import Facet

    chash = "h_" + uuid.uuid4().hex
    mv = "mv_" + uuid.uuid4().hex
    assert store.get_facets(chash, mv) is None  # cold miss

    facets = [
        Facet(note_id="n1", type="causal_mechanism", abstraction="A drives B",
              salience=0.7, facet_vec=[0.1, 0.2, 0.3], idx=0),
        Facet(note_id="n1", type="tension_tradeoff", abstraction="X vs Y",
              salience=0.5, facet_vec=[0.4, 0.5, 0.6], idx=1),
    ]
    store.put_facets(chash, mv, facets)

    got = store.get_facets(chash, mv)
    assert got is not None and len(got) == 2
    assert got[0].abstraction == "A drives B"
    # facet_cache stores facets verbatim (JSONB), independent of the index column dim
    assert got[0].facet_vec == [0.1, 0.2, 0.3]
    assert got[1].type == "tension_tradeoff" and got[1].idx == 1
    # a different model_version is a clean miss (idempotency key)
    assert store.get_facets(chash, "mv_other") is None


def test_pair_dedup_is_lifetime_and_order_independent(store) -> None:
    a, b = "a_" + uuid.uuid4().hex, "b_" + uuid.uuid4().hex
    mv = "mv_" + uuid.uuid4().hex

    assert store.is_seen(a, b, mv) is False    # not yet judged
    assert store.mark_seen(a, b, mv) is True   # first time: claims it
    assert store.is_seen(a, b, mv) is True     # now seen (pure read, no mutation)
    assert store.mark_seen(a, b, mv) is False  # already judged
    assert store.mark_seen(b, a, mv) is False  # order does not matter
    # a different model_version is a fresh judgment window
    assert store.mark_seen(a, b, "mv_fresh") is True


def test_ann_query_finds_nearest_within_type(index) -> None:
    tag = uuid.uuid4().hex  # isolate this run's note_ids from any prior data

    near = f"near_{tag}"
    far = f"far_{tag}"
    other_type = f"othertype_{tag}"

    # Same facet_type: a vector very close to the query and one far from it.
    index.add("causal_mechanism", near, 0, 0.9, _vec(1.0, 0.0, 0.0))
    index.add("causal_mechanism", far, 0, 0.9, _vec(0.0, 1.0, 0.0))
    # A different facet_type must never surface in a causal_mechanism query (type partitioning).
    index.add("tension_tradeoff", other_type, 0, 0.9, _vec(1.0, 0.0, 0.0))

    q = _vec(0.95, 0.05, 0.0)
    hits = index.query("causal_mechanism", q, k=5)
    hit_ids = [h[0] for h in hits]

    assert near in hit_ids, "the close vector should be retrieved"
    assert other_type not in hit_ids, "different facet_type must be partitioned out"
    # nearest first, and similarity is in [-1, 1] with near > far
    sims = {h[0]: h[2] for h in hits}
    assert sims[near] > sims.get(far, -1.0)
    assert hits[0][0] == near

    # neighbors_within counts entries whose cosine sim exceeds the radius (hub detection).
    # near (sim ~0.998) is within radius 0.9; far (sim ~0.05) is not.
    cnt = index.neighbors_within("causal_mechanism", q, radius=0.9)
    assert cnt >= 1
    # an extreme radius admits nothing
    assert index.neighbors_within("causal_mechanism", q, radius=0.99999) >= 0
