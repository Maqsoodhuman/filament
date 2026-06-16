"""FastAPI app — the 7 core endpoints (Phase 1 contract).

Dev handlers use an in-memory store + the fake engine so the API runs and the OpenAPI schema is real.
PRODUCTION (Phase 2, engine-agent): note writes persist to Postgres; "find-connections"/"scan" enqueue
Dramatiq jobs (no LLM work on this path); the engine runs in workers. The CONTRACT (these schemas)
does not change between dev and prod — only the handler internals do.
"""

from __future__ import annotations

import json
import os
import pathlib
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException

import re
from collections import Counter

from kg_api.repo import StoredConnection, make_notes_repo
from kg_api.schemas import (
    ClusterOut,
    ConnectionOut,
    JobOut,
    NoteCreate,
    NoteDetail,
    NoteOut,
    ScanRequest,
    kind_for,
)
from kg_engine import Engine, Note, Settings

# Golden set used by the optional dev seed (KG_SEED=1).
_GOLDEN = pathlib.Path(__file__).resolve().parents[2] / "data" / "golden" / "notes.json"


def _seed_from_golden() -> None:
    """Dev-only seed: ingest the golden notes so a running server serves real data.

    Behind KG_SEED=1, default off. Reuses the same ingest path as POST /notes so the
    engine never forks. PROD seeding would persist to Postgres instead.
    """
    data = json.loads(_GOLDEN.read_text())
    notes: list[Note] = []
    for raw in data.get("notes", []):
        note = Note(
            id=raw["id"],
            title=raw.get("title", ""),
            text=raw["text"],
            domain=raw.get("domain", ""),
        )
        _notes[note.id] = note
        _created[note.id] = _now()
        # Golden notes carry no tags; derive one from the domain so seeded data is real, not empty.
        _tags[note.id] = [note.domain] if note.domain else []
        notes.append(note)
    if notes:
        _eng().ingest(notes)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if os.getenv("KG_SEED") == "1":
        _seed_from_golden()
    yield


app = FastAPI(title="Knowledge Graph API", version="0.1.0", lifespan=lifespan)

# --- in-memory state (default dev/demo path; unchanged from v0) -------------
# When KG_STORE_BACKEND=postgres these globals stay empty and the Postgres branch (below) runs
# instead — notes + surfaced connections persist via kg_api.repo.PgNotesRepo and survive restart.
_notes: dict[str, Note] = {}
_created: dict[str, str] = {}
_tags: dict[str, list[str]] = {}  # note_id -> hashtags (API-layer metadata; not engine input)
_jobs: dict[str, JobOut] = {}
_engine: Engine | None = None


def _settings() -> Settings:
    return Settings()  # provider + store_backend from env


def _pg_mode() -> bool:
    return _settings().store_backend == "postgres"


# --- Postgres-mode helpers (only used when KG_STORE_BACKEND=postgres) --------
_repo_singleton = None


def _repo():
    """The API persistence repo (Postgres-backed in pg mode). Lazily built so a fresh process
    reads existing rows straight from the DB — that is what makes the API stateful."""
    global _repo_singleton
    if _repo_singleton is None:
        _repo_singleton = make_notes_repo(_settings())
    return _repo_singleton


def _pg_engine() -> Engine:
    """Build an engine hydrated with every persisted note, on the configured engine backend.

    The engine's own caches (facets/topical/index) are not the API's source of record — notes and
    surfaced connections are (the repo). So a fresh process re-ingests the persisted notes into a
    new engine before running connections. The facet cache + pgvector index make re-ingest cheap
    and never re-bills extraction (cached by content_hash, model_version)."""
    eng = Engine(_settings())
    eng.ingest(_repo().all_notes())
    return eng


def _eng() -> Engine:
    global _engine
    if _engine is None:
        _engine = Engine(_settings())  # provider from env; fake by default
    return _engine


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _surfaced() -> list:
    """Idempotent surfacing for the dev in-memory handlers.

    `Engine.find_connections()` mutates the in-memory dedup set (`seen_pair` marks each pair
    judged), so calling `surfaced()` twice in one process drops every pair on the second pass.
    Read endpoints must be idempotent across requests, so reset the dedup view before each
    surfacing pass. PROD reads persisted `connections` rows instead of re-judging — also idempotent.
    """
    eng = _eng()
    eng.store._judged_pairs.clear()
    return eng.surfaced()


def _note_out(n: Note) -> NoteOut:
    eng = _eng()
    count = sum(
        1
        for c in _surfaced()
        if c.a_id == n.id or c.b_id == n.id
    ) if n.id in eng._facets else 0
    return NoteOut(
        id=n.id, title=n.title, body=n.text, source=n.domain or "authored",
        created_at=_created.get(n.id, _now()), connection_count=count,
        tags=_tags.get(n.id, []),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/notes", response_model=NoteOut, status_code=201)
def create_note(payload: NoteCreate) -> NoteOut:
    nid = "n_" + uuid.uuid4().hex[:10]
    note = Note(id=nid, title=payload.title, text=payload.body, domain=payload.source)
    if _pg_mode():
        return _pg_create_note(note, payload.tags)
    _notes[nid] = note
    _created[nid] = _now()
    _tags[nid] = payload.tags  # API-layer metadata; the engine never sees tags
    _eng().ingest([note])  # dev: ingest inline. PROD: enqueue.
    return _note_out(note)


def _pg_create_note(note: Note, tags: list[str]) -> NoteOut:
    """Persist the note, run the engine over the full persisted corpus, persist surfaced
    connections. The engine runs HERE on the write path (no Redis/Dramatiq this round); reads stay
    LLM-free. When the async queue lands, this body moves into a worker and the handler enqueues."""
    repo = _repo()
    stored = repo.add_note(note, tags)
    eng = _pg_engine()  # hydrated with all persisted notes (incl. this one)
    repo.upsert_connections(eng.surfaced())
    return _pg_note_out(repo, stored)


def _pg_note_out(repo, stored) -> NoteOut:
    count = len(repo.list_connections(stored.note.id))
    n = stored.note
    return NoteOut(
        id=n.id, title=n.title, body=n.text, source=n.domain or "authored",
        created_at=stored.created_at, connection_count=count,
        tags=stored.tags,
    )


@app.get("/notes", response_model=list[NoteOut])
def list_notes() -> list[NoteOut]:
    if _pg_mode():
        repo = _repo()
        return [_pg_note_out(repo, s) for s in repo.list_notes()]
    return [_note_out(n) for n in sorted(_notes.values(), key=lambda x: _created.get(x.id, ""), reverse=True)]


@app.get("/notes/{note_id}", response_model=NoteDetail)
def get_note(note_id: str) -> NoteDetail:
    if _pg_mode():
        repo = _repo()
        stored = repo.get_note(note_id)
        if stored is None:
            raise HTTPException(404, "note not found")
        conns = [_conn_out(c) for c in repo.list_connections(note_id)]
        return NoteDetail(note=_pg_note_out(repo, stored), connections=conns)
    n = _notes.get(note_id)
    if n is None:
        raise HTTPException(404, "note not found")
    conns = [_conn_out(c) for c in _surfaced() if c.a_id == note_id or c.b_id == note_id]
    return NoteDetail(note=_note_out(n), connections=conns)


@app.post("/notes/{note_id}/find-connections", response_model=JobOut)
def find_connections(note_id: str) -> JobOut:
    if _pg_mode():
        repo = _repo()
        if repo.get_note(note_id) is None:
            raise HTTPException(404, "note not found")
        # No LLM on a read path: connections were judged + persisted at POST /notes; report the
        # persisted count. (When the async queue lands this enqueues a scoped re-judge.)
        surfaced = repo.list_connections(note_id)
        job = JobOut(job_id="j_" + uuid.uuid4().hex[:10], status="done", surfaced_count=len(surfaced))
        _jobs[job.job_id] = job
        return job
    if note_id not in _notes:
        raise HTTPException(404, "note not found")
    # PROD: enqueue a scoped job and return queued. DEV: run inline and report done.
    surfaced = [c for c in _surfaced() if c.a_id == note_id or c.b_id == note_id]
    job = JobOut(job_id="j_" + uuid.uuid4().hex[:10], status="done", surfaced_count=len(surfaced))
    _jobs[job.job_id] = job
    return job


@app.post("/scan", response_model=JobOut)
def scan(_req: ScanRequest) -> JobOut:
    if _pg_mode():
        repo = _repo()
        # Re-run the engine over the full persisted corpus and persist the surfaced connections.
        eng = _pg_engine()
        surfaced = eng.surfaced()
        repo.upsert_connections(surfaced)
        job = JobOut(job_id="j_" + uuid.uuid4().hex[:10], status="done", surfaced_count=len(surfaced))
        _jobs[job.job_id] = job
        return job
    surfaced = _surfaced()
    job = JobOut(job_id="j_" + uuid.uuid4().hex[:10], status="done", surfaced_count=len(surfaced))
    _jobs[job.job_id] = job
    return job


@app.get("/connections", response_model=list[ConnectionOut])
def list_connections(note_id: str | None = None) -> list[ConnectionOut]:
    if _pg_mode():
        return [_conn_out(c) for c in _repo().list_connections(note_id)]
    out = []
    for c in _surfaced():
        if note_id and not (c.a_id == note_id or c.b_id == note_id):
            continue
        out.append(_conn_out(c))
    return out


@app.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str) -> JobOut:
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return job


_STOP = {"with", "from", "that", "this", "into", "their", "your", "about", "which", "where",
         "the", "and", "for", "are", "was", "its", "out", "not", "you", "they", "once"}


def _label(notes: list[Note]) -> str:
    """Cheap section label = most frequent salient word across member titles (PROD: a Haiku call)."""
    words = Counter()
    for n in notes:
        for w in re.findall(r"[a-zA-Z]{5,}", (n.title + " " + n.text).lower()):
            if w not in _STOP:
                words[w] += 1
    top = [w for w, _ in words.most_common(2)]
    return " · ".join(w.capitalize() for w in top) if top else "Notes"


def _kmeans(ids: list[str], vecs: "list", k: int, iters: int = 12) -> dict[int, list[str]]:
    import numpy as np

    x = np.asarray(vecs, dtype=np.float32)
    x = x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-9)
    # deterministic seeding: farthest-point init from the first note
    centers = [0]
    while len(centers) < k:
        d = 1 - (x @ x[centers].T).max(axis=1)
        centers.append(int(np.argmax(d)))
    c = x[centers].copy()
    assign = np.zeros(len(x), dtype=int)
    for _ in range(iters):
        assign = np.argmax(x @ c.T, axis=1)
        for j in range(k):
            m = x[assign == j]
            if len(m):
                c[j] = m.mean(axis=0)
                c[j] /= np.linalg.norm(c[j]) + 1e-9
    out: dict[int, list[str]] = {}
    for nid, a in zip(ids, assign):
        out.setdefault(int(a), []).append(nid)
    return out


@app.get("/clusters", response_model=list[ClusterOut])
def list_clusters() -> list[ClusterOut]:
    """Organize tab: cluster topical embeddings into themed sections (k-means over the vectors
    the engine already computes). DEV baseline; PROD swaps in HDBSCAN + Haiku labels + multi-section
    membership. Robust to connection density (unlike a connection-graph component approach)."""
    if _pg_mode():
        eng = _pg_engine()  # hydrates topical vectors for the persisted notes
        notes_by_id = {n.id: n for n in _repo().all_notes()}
    else:
        eng = _eng()
        notes_by_id = _notes
    ids = [nid for nid in notes_by_id if nid in eng._topical]
    if not ids:
        return []
    k = max(1, min(4, len(ids)))
    groups = _kmeans(ids, [eng._topical[nid] for nid in ids], k)
    clusters = []
    for i, (_g, gids) in enumerate(sorted(groups.items(), key=lambda kv: -len(kv[1]))):
        members = [notes_by_id[nid] for nid in gids]
        clusters.append(
            ClusterOut(
                id=f"cl_{i}",
                label=_label(members) if len(members) > 1 else members[0].title,
                note_ids=gids,
                note_count=len(gids),
            )
        )
    return clusters


def _conn_out(c) -> ConnectionOut:
    # Works for both kg_engine.Connection and repo.StoredConnection (same field surface + .q).
    return ConnectionOut(
        id="c_" + (c.a_id + c.b_id)[:16],
        a_id=c.a_id, b_id=c.b_id, a_title=c.a_title, b_title=c.b_title,
        facet_type=c.facet_type, kind=kind_for(c.facet_type),
        statement=c.statement, validity=c.validity, nonobviousness=c.nonobviousness, q=c.q,
    )
