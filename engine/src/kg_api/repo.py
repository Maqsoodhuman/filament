"""API-level persistence: notes + surfaced connections.

The live API has two storage modes, selected by `Settings.store_backend`:

  - "memory"  (default): `InMemoryNotesRepo` — process-local dicts. Same behavior as the original
    dev handlers; the default dev/demo path and all existing tests are unchanged.
  - "postgres":          `PgNotesRepo` — notes + surfaced connections persist in Postgres
    (tables `api_notes` / `api_connections`, migration 0003), so they survive a process restart.

Both implement the same `NotesRepo` interface, so `main.py` is agnostic to which it holds — the
one seam the architecture keeps for the store backend (mirrors kg_engine.make_backend).

Connections are keyed/deduped by (a_id, b_id, model_version): re-running the engine updates an
existing pair's scores rather than duplicating it.

No LLM or embedding call happens in this module — it is pure persistence. Running the engine
(the only place facets/embeddings are computed) stays in the POST /notes write handler.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol

from kg_engine import Note
from kg_engine.models import Connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class StoredNote:
    """A persisted note plus its creation timestamp (the API's note record)."""

    note: Note
    created_at: str


@dataclass
class StoredConnection:
    """A persisted surfaced connection. Mirrors the fields kg_engine.Connection surfaces, minus
    the reasoner rationale (never persisted) — enough for ConnectionOut without re-judging."""

    a_id: str
    b_id: str
    a_title: str
    b_title: str
    facet_type: str
    statement: str
    validity: int
    nonobviousness: int

    @property
    def q(self) -> int:
        return min(self.validity, self.nonobviousness)


class NotesRepo(Protocol):
    """Persistence boundary for the API. Read methods never invoke the engine."""

    def add_note(self, note: Note) -> StoredNote: ...
    def get_note(self, note_id: str) -> StoredNote | None: ...
    def list_notes(self) -> list[StoredNote]: ...
    def all_notes(self) -> list[Note]: ...
    def upsert_connections(self, conns: list[Connection]) -> None: ...
    def list_connections(self, note_id: str | None = None) -> list[StoredConnection]: ...


# --- in-memory (default; unchanged behavior) --------------------------------


@dataclass
class InMemoryNotesRepo:
    _notes: dict[str, StoredNote] = field(default_factory=dict)
    _conns: dict[tuple[str, str, str], StoredConnection] = field(default_factory=dict)

    def add_note(self, note: Note) -> StoredNote:
        sn = StoredNote(note=note, created_at=_now())
        self._notes[note.id] = sn
        return sn

    def get_note(self, note_id: str) -> StoredNote | None:
        return self._notes.get(note_id)

    def list_notes(self) -> list[StoredNote]:
        return sorted(self._notes.values(), key=lambda s: s.created_at, reverse=True)

    def all_notes(self) -> list[Note]:
        return [s.note for s in self._notes.values()]

    def upsert_connections(self, conns: list[Connection]) -> None:
        for c in conns:
            key = (c.a_id, c.b_id, c.model_version)
            self._conns[key] = StoredConnection(
                a_id=c.a_id, b_id=c.b_id, a_title=c.a_title, b_title=c.b_title,
                facet_type=c.facet_type, statement=c.statement,
                validity=c.validity, nonobviousness=c.nonobviousness,
            )

    def list_connections(self, note_id: str | None = None) -> list[StoredConnection]:
        out = list(self._conns.values())
        if note_id is not None:
            out = [c for c in out if c.a_id == note_id or c.b_id == note_id]
        return sorted(out, key=lambda c: (-c.q, c.a_title))


# --- postgres (stateful; survives restart) ----------------------------------


def _normalize_pg_url(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


@dataclass
class PgNotesRepo:
    """Notes + surfaced connections backed by Postgres (tables from migration 0003).

    A fresh instance reads existing rows straight from the DB, so a restarted API serves the same
    notes and connections it had before — that is the statefulness this provides."""

    conninfo: str

    def __post_init__(self) -> None:
        import psycopg  # lazy: optional [postgres] extra

        self._conn = psycopg.connect(_normalize_pg_url(self.conninfo), autocommit=True)

    def add_note(self, note: Note) -> StoredNote:
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO api_notes (id, title, body, source)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE
                    SET title = EXCLUDED.title, body = EXCLUDED.body, source = EXCLUDED.source
                RETURNING created_at
                """,
                (note.id, note.title, note.text, note.domain or "authored"),
            )
            created_at = cur.fetchone()[0]
        return StoredNote(note=note, created_at=created_at.isoformat())

    def get_note(self, note_id: str) -> StoredNote | None:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, body, source, created_at FROM api_notes WHERE id = %s",
                (note_id,),
            )
            row = cur.fetchone()
        return _row_to_stored_note(row) if row else None

    def list_notes(self) -> list[StoredNote]:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, body, source, created_at FROM api_notes "
                "ORDER BY created_at DESC, id"
            )
            rows = cur.fetchall()
        return [_row_to_stored_note(r) for r in rows]

    def all_notes(self) -> list[Note]:
        return [s.note for s in self.list_notes()]

    def upsert_connections(self, conns: list[Connection]) -> None:
        if not conns:
            return
        with self._conn.cursor() as cur:
            for c in conns:
                cur.execute(
                    """
                    INSERT INTO api_connections
                        (a_id, b_id, model_version, a_title, b_title, facet_type,
                         statement, validity, nonobviousness, generic)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (a_id, b_id, model_version) DO UPDATE SET
                        a_title = EXCLUDED.a_title, b_title = EXCLUDED.b_title,
                        facet_type = EXCLUDED.facet_type, statement = EXCLUDED.statement,
                        validity = EXCLUDED.validity, nonobviousness = EXCLUDED.nonobviousness,
                        generic = EXCLUDED.generic
                    """,
                    (c.a_id, c.b_id, c.model_version, c.a_title, c.b_title, c.facet_type,
                     c.statement, c.validity, c.nonobviousness, c.generic),
                )

    def list_connections(self, note_id: str | None = None) -> list[StoredConnection]:
        sql = (
            "SELECT a_id, b_id, a_title, b_title, facet_type, statement, "
            "validity, nonobviousness FROM api_connections"
        )
        params: tuple = ()
        if note_id is not None:
            sql += " WHERE a_id = %s OR b_id = %s"
            params = (note_id, note_id)
        sql += " ORDER BY LEAST(validity, nonobviousness) DESC, a_title"
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [
            StoredConnection(
                a_id=r[0], b_id=r[1], a_title=r[2], b_title=r[3], facet_type=r[4],
                statement=r[5], validity=int(r[6]), nonobviousness=int(r[7]),
            )
            for r in rows
        ]


def _row_to_stored_note(row) -> StoredNote:
    note = Note(id=row[0], title=row[1] or "", text=row[2], domain=row[3] or "")
    return StoredNote(note=note, created_at=row[4].isoformat())


def make_notes_repo(settings) -> NotesRepo:
    """Select the API persistence backend from Settings.store_backend (mirrors make_backend)."""
    if settings.store_backend == "postgres":
        if not settings.database_url:
            raise ValueError("store_backend=postgres requires DATABASE_URL")
        return PgNotesRepo(settings.database_url)
    if settings.store_backend == "memory":
        return InMemoryNotesRepo()
    raise ValueError(f"unknown store_backend: {settings.store_backend}")
