"""Postgres + pgvector backing for the store and the vector index.

`PgStore` and `PgVectorIndex` implement the exact same interfaces as `InMemoryStore`
(store.py) and `InMemoryVectorIndex` (index.py), so the Engine is agnostic to which one it
holds. They are the production target for the v0 in-memory backend; selected via
`Settings.store_backend == "postgres"` (see config.py / pipeline.py).

Semantics are mirrored 1:1 with the in-memory versions:
  - facets cached by (content_hash, model_version)            -> facet_cache table
  - a pair judged at most once ever per model_version         -> pair_dedup table (normalized a<=b)
  - type-partitioned abstraction-space ANN, cosine            -> facet_index table (HNSW)

pgvector's `<=>` is cosine DISTANCE; the in-memory index speaks cosine SIMILARITY, so every
query converts `sim = 1 - distance`. `neighbors_within(radius)` mirrors the in-memory contract:
count entries whose cosine SIM exceeds `radius` — implemented as a bounded ANN scan plus a
distance-threshold filter (`<=> <= 1 - radius`). `ef_search` is honored per-query via SET LOCAL
inside the transaction. Tables come from migration 0002 (see migrations/versions)."""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np

from .models import Facet

# psycopg + pgvector are optional (the [postgres] extra). Import lazily-friendly but at module
# load so a misconfigured backend fails loudly rather than silently degrading.
import psycopg
from pgvector.psycopg import register_vector

# A generous default bound for neighbors_within's ANN scan; the in-memory version is exact, so we
# pull enough candidates that the threshold filter matches in-memory behavior on realistic corpora.
_NEIGHBOR_SCAN_LIMIT = 1000


@dataclass
class PgStore:
    """Facet cache + lifetime pair dedup, backed by Postgres. Mirrors InMemoryStore.

    `conninfo` is a libpq/psycopg connection string. `ef_search` is carried for parity with the
    index (unused here)."""

    conninfo: str

    def __post_init__(self) -> None:
        self._conn = psycopg.connect(self.conninfo, autocommit=True)
        register_vector(self._conn)

    # -- facet cache: keyed by (content_hash, model_version) ----------------

    def get_facets(self, chash: str, model_version: str) -> list[Facet] | None:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT facets FROM facet_cache WHERE content_hash = %s AND model_version = %s",
                (chash, model_version),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return [_facet_from_dict(d) for d in row[0]]

    def put_facets(self, chash: str, model_version: str, facets: list[Facet]) -> None:
        payload = json.dumps([_facet_to_dict(f) for f in facets])
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO facet_cache (content_hash, model_version, facets)
                VALUES (%s, %s, %s)
                ON CONFLICT (content_hash, model_version) DO UPDATE SET facets = EXCLUDED.facets
                """,
                (chash, model_version, payload),
            )

    # -- lifetime per-pair dedup --------------------------------------------

    def seen_pair(self, a_id: str, b_id: str, model_version: str) -> bool:
        """Atomically claim a pair: returns True if it was already judged this model_version.
        Normalizes (a,b) so order does not matter, matching the in-memory set semantics."""
        lo, hi = sorted((a_id, b_id))
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pair_dedup (a_id, b_id, model_version)
                VALUES (%s, %s, %s)
                ON CONFLICT (a_id, b_id, model_version) DO NOTHING
                """,
                (lo, hi, model_version),
            )
            # rowcount == 0 means the row already existed -> the pair was seen before.
            return cur.rowcount == 0


@dataclass
class PgVectorIndex:
    """Type-partitioned abstraction-space ANN index, backed by pgvector HNSW. Mirrors
    InMemoryVectorIndex. `ef_search` tunes recall per query (SET LOCAL hnsw.ef_search)."""

    conninfo: str
    ef_search: int = 100
    model_version: str = ""

    def __post_init__(self) -> None:
        self._conn = psycopg.connect(self.conninfo, autocommit=True)
        register_vector(self._conn)

    @staticmethod
    def _set_ef_search(cur, value: int) -> None:
        # SET LOCAL does not accept bind parameters; the value is coerced to int (never
        # user-controlled text), so inlining it is safe. Scoped to the surrounding transaction.
        cur.execute(f"SET LOCAL hnsw.ef_search = {int(value)}")

    def add(self, facet_type: str, note_id: str, facet_idx: int, salience: float,
            vec: list[float]) -> None:
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO facet_index
                    (facet_type, note_id, facet_idx, salience, facet_vec, model_version)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (facet_type, note_id, facet_idx, float(salience), _to_vec(vec),
                 self.model_version),
            )

    def query(self, facet_type: str, vec: list[float], k: int) -> list[tuple[str, int, float]]:
        """Up to k (note_id, facet_idx, cosine_sim) neighbors within the same facet type.
        HNSW ANN via `<=>` (cosine distance); converted to similarity."""
        q = _to_vec(vec)
        with self._conn.transaction(), self._conn.cursor() as cur:
            self._set_ef_search(cur, self.ef_search)
            cur.execute(
                """
                SELECT note_id, facet_idx, 1.0 - (facet_vec <=> %s) AS sim
                FROM facet_index
                WHERE facet_type = %s
                ORDER BY facet_vec <=> %s
                LIMIT %s
                """,
                (q, facet_type, q, k),
            )
            rows = cur.fetchall()
        return [(r[0], int(r[1]), float(r[2])) for r in rows]

    def neighbors_within(self, facet_type: str, vec: list[float], radius: float) -> int:
        """Count entries whose cosine sim exceeds `radius` — used for hub/genericness detection.
        Bounded ANN scan + distance-threshold filter (cosine dist <= 1 - radius)."""
        q = _to_vec(vec)
        max_dist = 1.0 - radius
        with self._conn.transaction(), self._conn.cursor() as cur:
            self._set_ef_search(cur, max(self.ef_search, _NEIGHBOR_SCAN_LIMIT))
            cur.execute(
                """
                SELECT count(*) FROM (
                    SELECT facet_vec <=> %s AS dist
                    FROM facet_index
                    WHERE facet_type = %s
                    ORDER BY facet_vec <=> %s
                    LIMIT %s
                ) t
                WHERE t.dist <= %s
                """,
                (q, facet_type, q, _NEIGHBOR_SCAN_LIMIT, max_dist),
            )
            row = cur.fetchone()
        return int(row[0])


# -- serialization helpers ---------------------------------------------------


def _facet_to_dict(f: Facet) -> dict:
    return {
        "note_id": f.note_id,
        "type": f.type,
        "abstraction": f.abstraction,
        "salience": f.salience,
        "facet_vec": list(f.facet_vec),
        "idx": f.idx,
    }


def _facet_from_dict(d: dict) -> Facet:
    return Facet(
        note_id=d["note_id"],
        type=d["type"],
        abstraction=d["abstraction"],
        salience=d["salience"],
        facet_vec=list(d.get("facet_vec", [])),
        idx=d.get("idx", -1),
    )


def _to_vec(vec: list[float]) -> np.ndarray:
    # pgvector.psycopg's register_vector adapts a numpy float array to the `vector` type, so the
    # `<=>` operator resolves; a bare Python list is sent as float8[] and fails to match.
    return np.asarray(vec, dtype=np.float32)
