"""The Engine: orchestrates the full pipeline and is the public entrypoint.

    ingest(notes)        extract (cached) -> embed abstraction + topical -> index
    find_connections()   per note: retrieve candidates -> reason -> independent verify -> q>=3 gate
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .config import Settings
from .extract import extract_facets
from .index import InMemoryVectorIndex
from .models import Candidate, Connection, Facet, Note
from .reason import reason_pair
from .retrieve import candidates_for_note
from .router import ModelRouter
from .store import InMemoryStore
from .verify import verify_pair


def _normalize_pg_url(url: str) -> str:
    """psycopg wants a libpq URL; the alembic/migration tooling uses a SQLAlchemy URL with the
    +psycopg driver suffix. Strip the suffix so the same DATABASE_URL works for both."""
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def make_backend(settings: Settings) -> tuple[Any, Any]:
    """Build (store, index) for the configured backend. Default 'memory' keeps the infra-free
    path unchanged; 'postgres' returns the pgvector-backed implementations. The Engine treats
    both identically — this is the one seam the architecture keeps (ARCHITECTURE.md §4)."""
    if settings.store_backend == "postgres":
        if not settings.database_url:
            raise ValueError("store_backend=postgres requires DATABASE_URL")
        from .pg_backend import PgStore, PgVectorIndex  # lazy: optional [postgres] extra

        conninfo = _normalize_pg_url(settings.database_url)
        mv = settings.model_version()
        return (
            PgStore(conninfo),
            PgVectorIndex(conninfo, ef_search=settings.ef_search, model_version=mv),
        )
    if settings.store_backend == "memory":
        return InMemoryStore(), InMemoryVectorIndex()
    raise ValueError(f"unknown store_backend: {settings.store_backend}")


@dataclass
class Engine:
    settings: Settings = field(default_factory=Settings)
    store: Any = None
    index: Any = None

    def __post_init__(self) -> None:
        self.router = ModelRouter(self.settings)
        if self.store is None or self.index is None:
            store, index = make_backend(self.settings)
            if self.store is None:
                self.store = store
            if self.index is None:
                self.index = index
        self._notes: dict[str, Note] = {}
        self._facets: dict[str, list[Facet]] = {}
        self._topical: dict[str, list[float]] = {}
        self.mv = self.settings.model_version()

    # -- ingest -------------------------------------------------------------

    def ingest(self, notes: list[Note]) -> None:
        for note in notes:
            self._notes[note.id] = note

            cached = self.store.get_facets(note.chash, self.mv)
            if cached is not None:
                facets = [Facet(**{**f.__dict__, "note_id": note.id}) for f in cached]
            else:
                facets = extract_facets(note, self.router)
                if facets:
                    vecs = self.router.embed([f.abstraction for f in facets])
                    for f, v in zip(facets, vecs):
                        f.facet_vec = v
                self.store.put_facets(note.chash, self.mv, facets)

            self._facets[note.id] = facets
            self._topical[note.id] = self.router.embed([note.text])[0]
            for f in facets:
                self.index.add(f.type, note.id, f.idx, f.salience, f.facet_vec)

    # -- connect ------------------------------------------------------------

    def find_connections(self) -> list[Connection]:
        results: list[Connection] = []
        for note_id, facets in self._facets.items():
            cands = candidates_for_note(
                note_id, facets, self.index, self._topical, self.settings
            )
            for cand in cands:
                if self.store.seen_pair(cand.a_id, cand.b_id, self.mv):
                    continue
                self._fill_neighbor_abstraction(cand)
                conn = self._judge(cand)
                if conn is not None:
                    results.append(conn)
        results.sort(key=lambda c: (-c.q, c.a_title))
        return results

    def surfaced(self) -> list[Connection]:
        return [c for c in self.find_connections() if c.surfaced]

    # -- internals ----------------------------------------------------------

    def _fill_neighbor_abstraction(self, cand: Candidate) -> None:
        for f in self._facets.get(cand.b_id, []):
            if f.type == cand.facet_type:
                cand.b_abstraction = f.abstraction
                return

    def _judge(self, cand: Candidate) -> Connection | None:
        a, b = self._notes[cand.a_id], self._notes[cand.b_id]
        r = reason_pair(cand, a, b, self.router)
        if not r.connection or not r.statement.strip():
            return None
        v = verify_pair(r.statement, a, b, self.router)
        return Connection(
            a_id=a.id,
            b_id=b.id,
            a_title=a.title,
            b_title=b.title,
            facet_type=cand.facet_type,
            statement=r.statement.strip(),
            validity=v.validity,
            nonobviousness=v.nonobviousness,
            generic=v.generic,
            model_version=self.mv,
        )
