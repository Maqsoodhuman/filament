"""Cross-tenant leak test (C3) — the real merge gate for the privacy positioning.

Runs ONLY with DATABASE_URL + KG_STORE_BACKEND=postgres (CI integration job); skipped on the
infra-free default. Asserts PgNotesRepo never returns one tenant's notes/connections to another —
the primary control (chokepoint-sourced user_id + WHERE scope), with RLS as fail-closed insurance.
Fake-provider unit tests can NEVER catch a tenancy leak; this is what testcontainers Postgres is for.
"""

from __future__ import annotations

import os
import uuid

import pytest

from kg_engine import Note
from kg_engine.models import Connection

DATABASE_URL = os.getenv("DATABASE_URL")
PG_MODE = os.getenv("KG_STORE_BACKEND") == "postgres"

pytestmark = pytest.mark.skipif(
    not (DATABASE_URL and PG_MODE),
    reason="needs DATABASE_URL + KG_STORE_BACKEND=postgres",
)


def _repo():
    from kg_api.repo import PgNotesRepo

    return PgNotesRepo(DATABASE_URL)


def _conn(a: str, b: str, mv: str) -> Connection:
    return Connection(
        a_id=a, b_id=b, a_title="A", b_title="B", facet_type="causal_mechanism",
        statement="x", validity=4, nonobviousness=4, generic=False, model_version=mv,
    )


def test_repo_scopes_every_read_by_user() -> None:
    repo = _repo()
    alice, bob = f"u_alice_{uuid.uuid4().hex[:6]}", f"u_bob_{uuid.uuid4().hex[:6]}"
    na = "n_" + uuid.uuid4().hex[:10]
    nb = "n_" + uuid.uuid4().hex[:10]
    mv = "mv_" + uuid.uuid4().hex[:6]

    repo.add_note(alice, Note(id=na, title="Alice", text="alice secret corpus"), ["a"])
    repo.add_note(bob, Note(id=nb, title="Bob", text="bob secret corpus"), ["b"])
    repo.upsert_connections(alice, [_conn(na, na + "x", mv)])

    # Each user sees ONLY their own
    assert [s.note.id for s in repo.list_notes(alice)] == [na]
    assert [s.note.id for s in repo.list_notes(bob)] == [nb]
    # Bob cannot fetch Alice's note by id, nor see her connections
    assert repo.get_note(bob, na) is None
    assert repo.list_connections(bob) == []
    assert len(repo.list_connections(alice)) == 1
