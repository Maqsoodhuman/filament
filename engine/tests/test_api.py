"""API wiring tests — TestClient over all 7 endpoints, fake provider, no infra/network.

The engine runs OFF the request path: POST /notes + triggers enqueue jobs and reads serve persisted
rows; a worker (drained here via main.run_worker_once) does the engine work. These tests assert HTTP
status codes, the schema shapes, the async (enqueue→drain→read) round-trip, and that user scoping
does not leak across tenants. Quality is the eval harness's job, not these.
"""

from __future__ import annotations

import json
import pathlib

import pytest
from fastapi.testclient import TestClient

import kg_api.main as main
from kg_api.main import app, run_worker_once
from kg_api.schemas import ConnectionOut, JobOut, NoteDetail, NoteOut


@pytest.fixture
def client() -> TestClient:
    # Reset the process singletons so each test starts with an empty repo + queue.
    main._repo_singleton = None
    main._queue_singleton = None
    main._cluster_state.clear()
    app.dependency_overrides.clear()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


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
    note = NoteOut(**body)
    assert note.id.startswith("n_")
    assert note.title == "Quorum sensing"
    assert note.body == "threshold density colony switches cascade"
    assert note.source == "authored"
    assert note.created_at


def test_note_tags_roundtrip(client: TestClient) -> None:
    created = _create(
        client, title="Cournot", body="threshold density colony switches cascade",
        tags=["economics", "game-theory"],
    )
    assert NoteOut(**created).tags == ["economics", "game-theory"]
    detail = NoteDetail(**client.get(f"/notes/{created['id']}").json())
    assert detail.note.tags == ["economics", "game-theory"]
    listed = {n["id"]: NoteOut(**n) for n in client.get("/notes").json()}
    assert listed[created["id"]].tags == ["economics", "game-theory"]


def test_note_tags_default_empty(client: TestClient) -> None:
    created = _create(client, title="A", body="threshold density colony switches cascade")
    assert NoteOut(**created).tags == []


def test_create_note_rejects_empty_body(client: TestClient) -> None:
    resp = client.post("/notes", json={"title": "x", "body": ""})
    assert resp.status_code == 422


# ---- engine off the HTTP path: enqueue → worker drains → reads serve persisted rows ----


def test_create_note_does_not_run_engine_on_write_path(client: TestClient) -> None:
    # Right after create, NO connections exist (the worker has not run) — proof the engine is off
    # the write path. They appear only after the worker drains the queue.
    _create(client, title="Quorum sensing", body="threshold density colony switches behavior cascade")
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    assert client.get("/connections").json() == []
    run_worker_once()
    conns = [ConnectionOut(**c) for c in client.get("/connections").json()]
    assert len(conns) >= 1
    assert b["id"] in {c.a_id for c in conns} | {c.b_id for c in conns}


def test_list_notes(client: TestClient) -> None:
    a = _create(client, title="A", body="threshold density colony switches cascade")
    b = _create(client, title="B", body="threshold withdrawals confidence collapses cascade flip")
    items = [NoteOut(**n) for n in client.get("/notes").json()]
    assert {a["id"], b["id"]} <= {n.id for n in items}
    assert len(items) == 2


def test_get_note_detail(client: TestClient) -> None:
    created = _create(client, title="Quorum sensing", body="threshold density colony switches cascade")
    detail = NoteDetail(**client.get(f"/notes/{created['id']}").json())
    assert detail.note.id == created["id"]
    assert isinstance(detail.connections, list)


def test_get_note_404(client: TestClient) -> None:
    assert client.get("/notes/n_doesnotexist").status_code == 404


# ---- POST /notes/{id}/find-connections ----


def test_find_connections_job_completes(client: TestClient) -> None:
    _create(client, title="Quorum sensing", body="threshold density colony switches behavior cascade")
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    run_worker_once()  # drain the connect jobs enqueued by create
    resp = client.post(f"/notes/{b['id']}/find-connections")
    assert resp.status_code == 200
    job = JobOut(**resp.json())
    assert job.job_id.startswith("j_")
    assert job.status == "done"  # stable idempotency key returns the already-drained job
    assert job.surfaced_count is not None and job.surfaced_count >= 1


def test_find_connections_queued_then_done(client: TestClient) -> None:
    # A fresh note's trigger is queued; after the worker drains it, the job is done.
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    job = JobOut(**client.post(f"/notes/{b['id']}/find-connections").json())
    assert job.status in ("queued", "done")
    run_worker_once()
    fetched = JobOut(**client.get(f"/jobs/{job.job_id}").json())
    assert fetched.status == "done"


def test_find_connections_404(client: TestClient) -> None:
    assert client.post("/notes/n_missing/find-connections").status_code == 404


# ---- POST /scan ----


def test_scan_completes(client: TestClient) -> None:
    _create(client, title="Quorum sensing", body="threshold density colony switches behavior cascade")
    _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    job = JobOut(**client.post("/scan", json={"full": True}).json())
    assert job.status == "queued"
    run_worker_once()
    fetched = JobOut(**client.get(f"/jobs/{job.job_id}").json())
    assert fetched.status == "done"
    assert fetched.surfaced_count is not None and fetched.surfaced_count >= 0


def test_scan_default_body(client: TestClient) -> None:
    resp = client.post("/scan", json={})
    assert resp.status_code == 200
    JobOut(**resp.json())


# ---- GET /connections ----


def test_list_connections(client: TestClient) -> None:
    _create(client, title="Quorum sensing", body="threshold density colony switches behavior cascade")
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    run_worker_once()
    conns = [ConnectionOut(**c) for c in client.get("/connections").json()]
    assert len(conns) >= 1
    c = conns[0]
    assert c.q == min(c.validity, c.nonobviousness)
    assert c.kind in ("same mechanism", "same dynamic", "same topic")
    for raw in client.get("/connections", params={"note_id": b["id"]}).json():
        conn = ConnectionOut(**raw)
        assert b["id"] in (conn.a_id, conn.b_id)


# ---- GET /jobs/{id} ----


def test_get_job_roundtrip(client: TestClient) -> None:
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    job = client.post(f"/notes/{b['id']}/find-connections").json()
    run_worker_once()
    fetched = JobOut(**client.get(f"/jobs/{job['job_id']}").json())
    assert fetched.job_id == job["job_id"]
    assert fetched.status == "done"


def test_get_job_404(client: TestClient) -> None:
    assert client.get("/jobs/j_missing").status_code == 404


def test_job_stream_emits_status(client: TestClient) -> None:
    # A3: the SSE stream emits the job's status; a drained job streams a terminal "done" event.
    b = _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    job = client.post(f"/notes/{b['id']}/find-connections").json()
    run_worker_once()
    with client.stream("GET", f"/jobs/{job['job_id']}/stream") as r:
        assert r.status_code == 200
        assert "text/event-stream" in r.headers["content-type"]
        for line in r.iter_lines():
            if line.startswith("data:"):
                evt = json.loads(line[len("data:"):].strip())
                assert evt["status"] == "done"
                break


# ---- tenancy: connections are strictly intra-user (P0-2) ----


def test_no_cross_tenant_leak(client: TestClient) -> None:
    # The auth chokepoint (get_current_user) is the SOLE source of user_id; overriding it is how a
    # request authenticates as a given user. Two users must never see each other's notes or
    # connections — the repo scopes every read by user_id. In-memory analogue of the prod RLS leak test.
    from kg_api.deps import AuthContext, get_current_user

    app.dependency_overrides[get_current_user] = lambda: AuthContext("u_alice")
    a = _create(client, title="Alice quorum", body="threshold density colony switches behavior cascade")
    _create(client, title="Alice runs", body="threshold withdrawals confidence collapses cascade flip")
    run_worker_once()
    assert len(client.get("/connections").json()) >= 1

    app.dependency_overrides[get_current_user] = lambda: AuthContext("u_bob")
    assert client.get("/notes").json() == []           # Bob sees none of Alice's notes
    assert client.get("/connections").json() == []      # nor her connections
    assert client.get(f"/notes/{a['id']}").status_code == 404  # nor by direct id


# ---- KG_SEED dev seed ----


def test_clusters_incremental_then_recluster(client: TestClient) -> None:
    # Organize: default is incremental — a newly added note joins an EXISTING section (membership
    # grows, the view stays stable). recluster=true rebuilds from scratch.
    from kg_api.schemas import ClusterOut

    _create(client, title="Quorum sensing", body="threshold density colony switches behavior cascade")
    _create(client, title="Bank runs", body="threshold withdrawals confidence collapses cascade flip")
    run_worker_once()
    first = [ClusterOut(**c) for c in client.get("/clusters").json()]
    assert first, "expected sections after the first (bootstrap) clustering"
    before_total = sum(c.note_count for c in first)

    # add a note, then read clusters again (incremental): the new note is assigned to a section
    _create(client, title="Cournot duopoly", body="threshold quantity competitors converge cascade output")
    run_worker_once()
    inc = [ClusterOut(**c) for c in client.get("/clusters").json()]
    assert sum(c.note_count for c in inc) >= before_total, "incremental assignment should not drop members"

    # explicit re-cluster rebuilds and still returns sections
    re = [ClusterOut(**c) for c in client.get("/clusters", params={"recluster": "true"}).json()]
    assert re, "recluster=true should return rebuilt sections"


def test_seed_populates_notes_on_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KG_SEED", "1")
    main._repo_singleton = None
    main._queue_singleton = None
    golden = json.loads(
        (pathlib.Path(main.__file__).resolve().parents[2] / "data" / "golden" / "notes.json").read_text()
    )
    expected_ids = {n["id"] for n in golden["notes"]}
    domain_by_id = {n["id"]: n.get("domain", "") for n in golden["notes"]}
    with TestClient(app) as c:
        listed = c.get("/notes").json()
        assert expected_ids <= {n["id"] for n in listed}
        for n in listed:
            if n["id"] in domain_by_id and domain_by_id[n["id"]]:
                assert n["tags"] == [domain_by_id[n["id"]]]
    main._repo_singleton = None
    main._queue_singleton = None
