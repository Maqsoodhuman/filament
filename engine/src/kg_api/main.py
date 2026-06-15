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

from kg_api.schemas import (
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
        notes.append(note)
    if notes:
        _eng().ingest(notes)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if os.getenv("KG_SEED") == "1":
        _seed_from_golden()
    yield


app = FastAPI(title="Knowledge Graph API", version="0.1.0", lifespan=lifespan)

# --- dev-only in-memory state (Phase 2 replaces with Postgres + workers) ---
_notes: dict[str, Note] = {}
_created: dict[str, str] = {}
_jobs: dict[str, JobOut] = {}
_engine: Engine | None = None


def _eng() -> Engine:
    global _engine
    if _engine is None:
        _engine = Engine(Settings())  # provider from env; fake by default
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
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/notes", response_model=NoteOut, status_code=201)
def create_note(payload: NoteCreate) -> NoteOut:
    nid = "n_" + uuid.uuid4().hex[:10]
    note = Note(id=nid, title=payload.title, text=payload.body, domain=payload.source)
    _notes[nid] = note
    _created[nid] = _now()
    _eng().ingest([note])  # dev: ingest inline. PROD: enqueue.
    return _note_out(note)


@app.get("/notes", response_model=list[NoteOut])
def list_notes() -> list[NoteOut]:
    return [_note_out(n) for n in sorted(_notes.values(), key=lambda x: _created.get(x.id, ""), reverse=True)]


@app.get("/notes/{note_id}", response_model=NoteDetail)
def get_note(note_id: str) -> NoteDetail:
    n = _notes.get(note_id)
    if n is None:
        raise HTTPException(404, "note not found")
    conns = [_conn_out(c) for c in _surfaced() if c.a_id == note_id or c.b_id == note_id]
    return NoteDetail(note=_note_out(n), connections=conns)


@app.post("/notes/{note_id}/find-connections", response_model=JobOut)
def find_connections(note_id: str) -> JobOut:
    if note_id not in _notes:
        raise HTTPException(404, "note not found")
    # PROD: enqueue a scoped job and return queued. DEV: run inline and report done.
    surfaced = [c for c in _surfaced() if c.a_id == note_id or c.b_id == note_id]
    job = JobOut(job_id="j_" + uuid.uuid4().hex[:10], status="done", surfaced_count=len(surfaced))
    _jobs[job.job_id] = job
    return job


@app.post("/scan", response_model=JobOut)
def scan(_req: ScanRequest) -> JobOut:
    surfaced = _surfaced()
    job = JobOut(job_id="j_" + uuid.uuid4().hex[:10], status="done", surfaced_count=len(surfaced))
    _jobs[job.job_id] = job
    return job


@app.get("/connections", response_model=list[ConnectionOut])
def list_connections(note_id: str | None = None) -> list[ConnectionOut]:
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


def _conn_out(c) -> ConnectionOut:
    return ConnectionOut(
        id="c_" + (c.a_id + c.b_id)[:16],
        a_id=c.a_id, b_id=c.b_id, a_title=c.a_title, b_title=c.b_title,
        facet_type=c.facet_type, kind=kind_for(c.facet_type),
        statement=c.statement, validity=c.validity, nonobviousness=c.nonobviousness, q=c.q,
    )
