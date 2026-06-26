"""API-level persistence: notes + surfaced connections, STRICTLY user-scoped (P0-2).

Two backends behind one `NotesRepo` interface, selected by `Settings.store_backend`:

  - "memory"   (default): `InMemoryNotesRepo` — process-local, thread-safe (the worker thread writes
    connections while request threads read). The dev/demo + fast-test path.
  - "postgres":           `PgNotesRepo` — notes + surfaced connections persist in Postgres
    (api_notes / api_connections, with user_id from migrations 0003/0004/0006), survive restart.

`user_id` (resolved by the auth chokepoint, kg_api.deps.get_current_user) is the leading scope on
EVERY method — a forgotten scope would leak another user's private corpus, so it is not optional.
Connections are keyed/deduped by (user_id, a_id, b_id, model_version).

No LLM/embedding call happens here — pure persistence. The engine runs only in kg_api.worker."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from kg_engine import Note
from kg_engine.models import Connection


def _now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class StoredNote:
    note: Note
    user_id: str
    created_at: str
    tags: list[str] = field(default_factory=list)


@dataclass
class StoredConnection:
    user_id: str
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
    """Persistence boundary. `user_id` scopes every method; read methods never invoke the engine."""

    def add_note(self, user_id: str, note: Note, tags: list[str] | None = None) -> StoredNote: ...
    def get_note(self, user_id: str, note_id: str) -> StoredNote | None: ...
    def list_notes(self, user_id: str) -> list[StoredNote]: ...
    def all_notes(self, user_id: str) -> list[Note]: ...
    def upsert_connections(self, user_id: str, conns: list[Connection]) -> None: ...
    def list_connections(self, user_id: str, note_id: str | None = None) -> list[StoredConnection]: ...


# --- in-memory (default; thread-safe) ---------------------------------------


@dataclass
class InMemoryNotesRepo:
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _notes: dict[str, StoredNote] = field(default_factory=dict)
    # (user_id, a_id, b_id, model_version) -> StoredConnection
    _conns: dict[tuple[str, str, str, str], StoredConnection] = field(default_factory=dict)

    def add_note(self, user_id: str, note: Note, tags: list[str] | None = None) -> StoredNote:
        sn = StoredNote(note=note, user_id=user_id, created_at=_now(), tags=list(tags or []))
        with self._lock:
            self._notes[note.id] = sn
        return sn

    def get_note(self, user_id: str, note_id: str) -> StoredNote | None:
        with self._lock:
            sn = self._notes.get(note_id)
        return sn if sn is not None and sn.user_id == user_id else None

    def list_notes(self, user_id: str) -> list[StoredNote]:
        with self._lock:
            mine = [s for s in self._notes.values() if s.user_id == user_id]
        return sorted(mine, key=lambda s: s.created_at, reverse=True)

    def all_notes(self, user_id: str) -> list[Note]:
        return [s.note for s in self.list_notes(user_id)]

    def upsert_connections(self, user_id: str, conns: list[Connection]) -> None:
        with self._lock:
            for c in conns:
                self._conns[(user_id, c.a_id, c.b_id, c.model_version)] = StoredConnection(
                    user_id=user_id, a_id=c.a_id, b_id=c.b_id, a_title=c.a_title, b_title=c.b_title,
                    facet_type=c.facet_type, statement=c.statement,
                    validity=c.validity, nonobviousness=c.nonobviousness,
                )

    def list_connections(self, user_id: str, note_id: str | None = None) -> list[StoredConnection]:
        with self._lock:
            out = [c for c in self._conns.values() if c.user_id == user_id]
        if note_id is not None:
            out = [c for c in out if note_id in (c.a_id, c.b_id)]
        return sorted(out, key=lambda c: (-c.q, c.a_title))


# --- postgres (stateful; survives restart) ----------------------------------


def _normalize_pg_url(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


@dataclass
class PgNotesRepo:
    """Notes + surfaced connections in Postgres (api_notes / api_connections, user-scoped by
    migration 0006, RLS by 0009).

    C2: a per-request `ConnectionPool` (not one shared connection) so concurrent API requests are
    safe. C6: every operation runs in a transaction that first sets the `app.current_user_id` GUC
    (via set_config(..., is_local=true)), so Postgres RLS fail-closes a forgotten scope — in
    addition to the explicit `WHERE user_id` on each query (defense in depth)."""

    conninfo: str

    def __post_init__(self) -> None:
        from psycopg_pool import ConnectionPool  # lazy: optional [postgres] extra

        # non-autocommit: pool.connection() opens a txn so SET LOCAL / set_config(local) holds.
        self._pool = ConnectionPool(
            _normalize_pg_url(self.conninfo), min_size=1, max_size=10, open=True
        )

    @contextmanager
    def _cursor(self, user_id: str):
        """A cursor inside a per-request transaction with the RLS tenant GUC set (parameterized via
        set_config, so no injection). Commits on clean exit, rolls back on error."""
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT set_config('app.current_user_id', %s, true)", (user_id,))
            yield cur

    def add_note(self, user_id: str, note: Note, tags: list[str] | None = None) -> StoredNote:
        tag_list = list(tags or [])
        with self._cursor(user_id) as cur:
            cur.execute(
                """
                INSERT INTO api_notes (id, user_id, title, body, source, tags)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE
                    SET title = EXCLUDED.title, body = EXCLUDED.body,
                        source = EXCLUDED.source, tags = EXCLUDED.tags
                WHERE api_notes.user_id = EXCLUDED.user_id
                RETURNING created_at
                """,
                (note.id, user_id, note.title, note.text, note.domain or "authored", tag_list),
            )
            created_at = cur.fetchone()[0]
        return StoredNote(note=note, user_id=user_id, created_at=created_at.isoformat(), tags=tag_list)

    def get_note(self, user_id: str, note_id: str) -> StoredNote | None:
        with self._cursor(user_id) as cur:
            cur.execute(
                "SELECT id, title, body, source, created_at, tags FROM api_notes "
                "WHERE id = %s AND user_id = %s",
                (note_id, user_id),
            )
            row = cur.fetchone()
        return _row_to_stored_note(row, user_id) if row else None

    def list_notes(self, user_id: str) -> list[StoredNote]:
        with self._cursor(user_id) as cur:
            cur.execute(
                "SELECT id, title, body, source, created_at, tags FROM api_notes "
                "WHERE user_id = %s ORDER BY created_at DESC, id",
                (user_id,),
            )
            rows = cur.fetchall()
        return [_row_to_stored_note(r, user_id) for r in rows]

    def all_notes(self, user_id: str) -> list[Note]:
        return [s.note for s in self.list_notes(user_id)]

    def upsert_connections(self, user_id: str, conns: list[Connection]) -> None:
        if not conns:
            return
        with self._cursor(user_id) as cur:
            for c in conns:
                cur.execute(
                    """
                    INSERT INTO api_connections
                        (user_id, a_id, b_id, model_version, a_title, b_title, facet_type,
                         statement, validity, nonobviousness, generic)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, a_id, b_id, model_version) DO UPDATE SET
                        a_title = EXCLUDED.a_title, b_title = EXCLUDED.b_title,
                        facet_type = EXCLUDED.facet_type, statement = EXCLUDED.statement,
                        validity = EXCLUDED.validity, nonobviousness = EXCLUDED.nonobviousness,
                        generic = EXCLUDED.generic
                    """,
                    (user_id, c.a_id, c.b_id, c.model_version, c.a_title, c.b_title, c.facet_type,
                     c.statement, c.validity, c.nonobviousness, c.generic),
                )

    def list_connections(self, user_id: str, note_id: str | None = None) -> list[StoredConnection]:
        sql = (
            "SELECT a_id, b_id, a_title, b_title, facet_type, statement, validity, nonobviousness "
            "FROM api_connections WHERE user_id = %s"
        )
        params: tuple = (user_id,)
        if note_id is not None:
            sql += " AND (a_id = %s OR b_id = %s)"
            params = (user_id, note_id, note_id)
        sql += " ORDER BY LEAST(validity, nonobviousness) DESC, a_title"
        with self._cursor(user_id) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [
            StoredConnection(
                user_id=user_id, a_id=r[0], b_id=r[1], a_title=r[2], b_title=r[3], facet_type=r[4],
                statement=r[5], validity=int(r[6]), nonobviousness=int(r[7]),
            )
            for r in rows
        ]


def _row_to_stored_note(row, user_id: str) -> StoredNote:
    note = Note(id=row[0], title=row[1] or "", text=row[2], domain=row[3] or "")
    tags = list(row[5]) if len(row) > 5 and row[5] is not None else []
    return StoredNote(note=note, user_id=user_id, created_at=row[4].isoformat(), tags=tags)


def make_notes_repo(settings) -> NotesRepo:
    """Select the API persistence backend from Settings.store_backend (mirrors make_backend)."""
    if settings.store_backend == "postgres":
        if not settings.database_url:
            raise ValueError("store_backend=postgres requires DATABASE_URL")
        return PgNotesRepo(settings.database_url)
    if settings.store_backend == "memory":
        return InMemoryNotesRepo()
    raise ValueError(f"unknown store_backend: {settings.store_backend}")
