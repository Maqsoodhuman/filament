"""API wiring tests — TestClient over all 7 endpoints, fake provider, no infra/network.

These assert HTTP status codes and that responses validate against the kg_api.schemas
shapes (TestClient already validates response_model on the way out; here we additionally
round-trip create -> list -> detail -> find-connections -> scan -> connections -> jobs).
Quality is NOT asserted here — that is the eval harness's job.
"""

from __future__ import annotations

import json
import pathlib

import pytest
from fastapi.testclient import TestClient

from kg_api.main import _created, _jobs, _notes, _tags, app
from kg_api.schemas import (
    ConnectionOut,
    JobOut,
    NoteDetail,
    NoteOut,
)


@pytest.fixture
def client() -> TestClient:
    # Isolate module-level dev state between tests (the dev handlers use globals).
    _notes.clear()
    _created.clear()
    _tags.clear()
    _jobs.clear()
    import kg_api.main as main

    main._engine = None
    with TestClient(app) as c:
        yield c


def _create(
    client: TestClient, *, title: str, body: str, source: str = "authored",
    tags: list[str] | None = None,
) -> dict:
    payload = {"title": title, "body": body, "source": source}
    if tags is not None:
        payload["tags"] = tags
    resp = client.post("/notes", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---- GET /health ----


def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---- POST /notes ----


def test_create_note_returns_noteout(client: TestClient) -> None:
    body = _create(client, title="Quorum sensing", body="threshold density colony switches cascade")
    note = NoteOut(**body)  # validates the contract shape
    assert note.id.startswith("n_")
    assert note.title == "Quorum sensing"
    assert note.body == "threshold density colony switches cascade"
    assert note.source == "authored"
    assert note.created_at


def test_note_tags_roundtrip(client: TestClient) -> None:
    # POST with tags -> they persist and come back on the NoteOut, in GET /notes and GET /notes/{id}.
    created = _create(
        client,
        title="Cournot",
        body="threshold density colony switches cascade",
        tags=["economics", "game-theory"],
    )
    note = NoteOut(**created)
    assert note.tags == ["economics", "game-theory"]

    detail = NoteDetail(**client.get(f"/notes/{created['id']}").json())
    assert detail.note.tags == ["economics", "game-theory"]

    listed = {n["id"]: NoteOut(**n) for n in client.get("/notes").json()}
    assert listed[created["id"]].tags == ["economics", "game-theory"]


def test_note_tags_default_empty(client: TestClient) -> None:
    # No tags supplied -> NoteOut.tags defaults to [] (the contract default).
    created = _create(client, title="A", body="threshold density colony switches cascade")
    assert NoteOut(**created).tags == []


def test_create_note_rejects_empty_body(client: TestClient) -> None:
    # NoteCreate.body has min_length=1 -> 422 validation error.
    resp = client.post("/notes", json={"title": "x", "body": ""})
    assert resp.status_code == 422


# ---- GET /notes ----


def test_list_notes(client: TestClient) -> None:
    a = _create(client, title="A", body="threshold density colony switches cascade")
    b = _create(client, title="B", body="threshold withdrawals confidence collapses cascade flip")
    resp = client.get("/notes")
    assert resp.status_code == 200
    items = [NoteOut(**n) for n in resp.json()]
    ids = {n.id for n in items}
    assert {a["id"], b["id"]} <= ids
    assert len(items) == 2


# ---- GET /notes/{id} ----


def test_get_note_detail(client: TestClient) -> None:
    created = _create(client, title="Quorum sensing", body="threshold density colony switches cascade")
    resp = client.get(f"/notes/{created['id']}")
    assert resp.status_code == 200
    detail = NoteDetail(**resp.json())
    assert detail.note.id == created["id"]
    assert isinstance(detail.connections, list)


def test_get_note_404(client: TestClient) -> None:
    resp = client.get("/notes/n_doesnotexist")
    assert resp.status_code == 404


# ---- POST /notes/{id}/find-connections ----


def test_find_connections_returns_done_job(client: TestClient) -> None:
    # Two structurally-similar, topically-distant notes -> the engine should surface a connection.
    _create(client, title="Quorum sensing", body="threshold density colony switches behavior cascade")
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    resp = client.post(f"/notes/{b['id']}/find-connections")
    assert resp.status_code == 200
    job = JobOut(**resp.json())
    assert job.job_id.startswith("j_")
    assert job.status == "done"
    assert job.surfaced_count is not None and job.surfaced_count >= 1


def test_find_connections_404(client: TestClient) -> None:
    resp = client.post("/notes/n_missing/find-connections")
    assert resp.status_code == 404


# ---- POST /scan ----


def test_scan_returns_done_job(client: TestClient) -> None:
    _create(client, title="Quorum sensing", body="threshold density colony switches behavior cascade")
    _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    resp = client.post("/scan", json={"full": True})
    assert resp.status_code == 200
    job = JobOut(**resp.json())
    assert job.status == "done"
    assert job.surfaced_count is not None and job.surfaced_count >= 0


def test_scan_default_body(client: TestClient) -> None:
    # ScanRequest.full defaults to False; empty body is valid.
    resp = client.post("/scan", json={})
    assert resp.status_code == 200
    JobOut(**resp.json())


# ---- GET /connections ----


def test_list_connections(client: TestClient) -> None:
    _create(client, title="Quorum sensing", body="threshold density colony switches behavior cascade")
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    resp = client.get("/connections")
    assert resp.status_code == 200
    conns = [ConnectionOut(**c) for c in resp.json()]
    assert len(conns) >= 1
    c = conns[0]
    assert c.q == min(c.validity, c.nonobviousness)
    assert c.kind in ("same mechanism", "same dynamic", "same topic")

    # filtered by note_id returns only connections touching that note
    filtered = client.get("/connections", params={"note_id": b["id"]})
    assert filtered.status_code == 200
    for raw in filtered.json():
        conn = ConnectionOut(**raw)
        assert b["id"] in (conn.a_id, conn.b_id)


# ---- GET /jobs/{id} ----


def test_get_job_roundtrip(client: TestClient) -> None:
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    job = client.post(f"/notes/{b['id']}/find-connections").json()
    resp = client.get(f"/jobs/{job['job_id']}")
    assert resp.status_code == 200
    fetched = JobOut(**resp.json())
    assert fetched.job_id == job["job_id"]
    assert fetched.status == "done"


def test_get_job_404(client: TestClient) -> None:
    resp = client.get("/jobs/j_missing")
    assert resp.status_code == 404


# ---- KG_SEED dev seed ----


def test_seed_populates_notes_on_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KG_SEED", "1")
    _notes.clear()
    _created.clear()
    _tags.clear()
    _jobs.clear()
    import kg_api.main as main

    main._engine = None
    golden = json.loads(
        (pathlib.Path(main.__file__).resolve().parents[2] / "data" / "golden" / "notes.json").read_text()
    )
    expected_ids = {n["id"] for n in golden["notes"]}
    domain_by_id = {n["id"]: n.get("domain", "") for n in golden["notes"]}
    with TestClient(app) as c:
        listed = c.get("/notes").json()
        ids = {n["id"] for n in listed}
        assert expected_ids <= ids
        # Seeded golden notes derive a single tag from their domain (sensible, non-empty default).
        for n in listed:
            if n["id"] in domain_by_id and domain_by_id[n["id"]]:
                assert n["tags"] == [domain_by_id[n["id"]]]
    # clean up so other tests start empty
    _notes.clear()
    _created.clear()
    _tags.clear()
    _jobs.clear()
    main._engine = None
