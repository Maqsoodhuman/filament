"""Integration test: the live API is STATEFUL on Postgres (KG_STORE_BACKEND=postgres).

Runs ONLY when DATABASE_URL is set AND KG_STORE_BACKEND=postgres; skipped otherwise so the default
infra-free `pytest` stays green. Proves that notes and their surfaced connections persist and are
returned after a FRESH repo instance — i.e. they survive a process restart.

This test exercises the fake provider (96-dim embeddings), so the facet_index column must be
migrated at that dim — KG_EMBED_DIM=96 on the migration (it defaults to 768 for nomic-embed-text).

Bring up a scratch DB and migrate, then run:
    docker run -d --name kg-pg4 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=kg \\
        -p 5435:5432 pgvector/pgvector:pg16
    DATABASE_URL=postgresql+psycopg://postgres:pg@localhost:5435/kg \\
        KG_EMBED_DIM=96 ../skills/run-migration.sh
    DATABASE_URL=postgresql+psycopg://postgres:pg@localhost:5435/kg \\
        KG_STORE_BACKEND=postgres pytest tests/test_api_pg.py
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

DATABASE_URL = os.getenv("DATABASE_URL")
PG_MODE = os.getenv("KG_STORE_BACKEND") == "postgres"

pytestmark = pytest.mark.skipif(
    not (DATABASE_URL and PG_MODE),
    reason="needs DATABASE_URL + KG_STORE_BACKEND=postgres; skipping Postgres API integration test",
)


def _conninfo() -> str:
    return DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)


@pytest.fixture(autouse=True)
def _clean_db():
    """Start each test from empty API tables (engine backend tables too, so dedup/index don't
    carry stale rows from prior runs)."""
    import psycopg

    with psycopg.connect(_conninfo(), autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE api_connections, api_notes")
        cur.execute("TRUNCATE facet_index, facet_cache, pair_dedup")
    yield


def _fresh_client() -> TestClient:
    """A client whose repo is rebuilt from scratch — simulates a process restart: the new repo
    reads existing rows straight from Postgres."""
    import kg_api.main as main

    main._repo_singleton = None
    main._engine = None
    return TestClient(main.app)


def _create(client: TestClient, *, title: str, body: str, source: str = "authored") -> dict:
    resp = client.post("/notes", json={"title": title, "body": body, "source": source})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_notes_and_connections_persist_across_restart() -> None:
    # Two structurally-similar, topically-distant notes -> the fake engine surfaces a connection.
    with _fresh_client() as c:
        a = _create(c, title="Quorum sensing",
                    body="threshold density colony switches behavior cascade")
        b = _create(c, title="Bank runs",
                    body="threshold withdrawals confidence collapses cascade flip")
        # connection is judged + persisted on the POST /notes write path
        conns = c.get("/connections").json()
        assert len(conns) >= 1, "engine should surface at least one connection"
        before_ids = {n["id"] for n in c.get("/notes").json()}
        assert {a["id"], b["id"]} <= before_ids

    # --- simulate a restart: brand-new repo + engine, no in-process state carried over ---
    with _fresh_client() as c2:
        notes = c2.get("/notes").json()
        ids = {n["id"] for n in notes}
        assert {a["id"], b["id"]} <= ids, "notes must survive restart"

        # note bodies/sources round-tripped, not lost
        detail = c2.get(f"/notes/{a['id']}").json()
        assert detail["note"]["body"] == "threshold density colony switches behavior cascade"
        assert detail["note"]["source"] == "authored"

        # surfaced connections survive restart and are returned from Postgres (no re-judge needed)
        conns2 = c2.get("/connections").json()
        assert len(conns2) >= 1, "connections must survive restart"
        c0 = conns2[0]
        assert c0["q"] == min(c0["validity"], c0["nonobviousness"])
        assert c0["q"] >= 3, "only q>=3 surfaces"
        assert c0["kind"] in ("same mechanism", "same dynamic", "same topic")

        # detail view + filter both read the persisted connections
        assert len(detail["connections"]) >= 1
        filtered = c2.get("/connections", params={"note_id": b["id"]}).json()
        assert filtered, "filter by note_id returns the persisted connection"
        for raw in filtered:
            assert b["id"] in (raw["a_id"], raw["b_id"])


def test_get_missing_note_404_in_pg_mode() -> None:
    with _fresh_client() as c:
        assert c.get("/notes/n_doesnotexist").status_code == 404
        assert c.post("/notes/n_doesnotexist/find-connections").status_code == 404
