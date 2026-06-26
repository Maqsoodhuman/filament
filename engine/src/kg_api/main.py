"""FastAPI app — the 7 core endpoints (Phase 1 contract), now production-shaped (P0).

Invariant: the engine NEVER runs on an HTTP request path. Handlers resolve user_id via the auth
chokepoint (deps.get_current_user — the sole tenancy source), persist to the repo, and ENQUEUE a
job; triggers return status="queued". A worker (kg_api.worker) drains the queue off-path and runs
the engine. Reads serve persisted rows (no engine, no LLM/embedding).

Backends are seams: KG_STORE_BACKEND (memory|postgres) and KG_QUEUE (memory|postgres). The default
memory profile (with an embedded worker) is the dev/test path; postgres is the production target.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import threading
import uuid
from collections import Counter
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

from kg_api.deps import AuthContext, get_current_user
from kg_api.queue import make_queue
from kg_api.repo import StoredNote, make_notes_repo
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
from kg_api.worker import Worker
from kg_engine import Engine, Note, Settings

_GOLDEN = pathlib.Path(__file__).resolve().parents[2] / "data" / "golden" / "notes.json"


def _settings() -> Settings:
    return Settings()


def _now() -> str:
    return datetime.now(UTC).isoformat()


# --- process singletons (repo + queue), resettable in tests ------------------
_repo_singleton = None
_queue_singleton = None


def _repo():
    global _repo_singleton
    if _repo_singleton is None:
        _repo_singleton = make_notes_repo(_settings())
    return _repo_singleton


def _queue():
    global _queue_singleton
    if _queue_singleton is None:
        _queue_singleton = make_queue(_settings())
    return _queue_singleton


def _worker() -> Worker:
    return Worker(_settings(), _queue(), _repo())


def run_worker_once(limit: int = 50) -> int:
    """Drain the queue synchronously. Used by the live embedded worker and by tests (the engine
    still runs OFF the request handler — this is the worker, not a route)."""
    return _worker().run_once(limit)


def _enqueue(user_id: str, job_type: str, note_id: str | None, *, stable: bool) -> str:
    mv = _settings().model_version()
    if stable and note_id is not None:
        idem = f"{job_type}:{user_id}:{note_id}:{mv}"  # double-click collapses to one job
    else:
        idem = f"{job_type}:{user_id}:{uuid.uuid4().hex}"  # always a fresh job (e.g. scan)
    return _queue().enqueue(user_id, job_type, {"note_id": note_id}, idem).job_id


# --- lifespan: optional dev seed + optional embedded worker thread -----------


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if os.getenv("KG_SEED") == "1":
        _seed_from_golden()
    stop = threading.Event()
    thread: threading.Thread | None = None
    if os.getenv("KG_EMBEDDED_WORKER") == "1":
        # Dev single-process convenience: drain the in-process queue in a background thread.
        # Still OFF the request handler. PROD runs `python -m kg_api.worker` as a separate process.
        thread = threading.Thread(target=_worker().run_forever, kwargs={"stop": stop}, daemon=True)
        thread.start()
    try:
        yield
    finally:
        stop.set()
        if thread is not None:
            thread.join(timeout=2.0)


def _seed_from_golden() -> None:
    """Dev-only seed (KG_SEED=1): persist the golden notes for the local user + enqueue connect
    jobs, reusing the same path as POST /notes so the engine never forks."""
    uid = _settings().local_user_id
    data = json.loads(_GOLDEN.read_text())
    repo = _repo()
    for raw in data.get("notes", []):
        note = Note(id=raw["id"], title=raw.get("title", ""), text=raw["text"],
                    domain=raw.get("domain", ""))
        tags = [note.domain] if note.domain else []
        repo.add_note(uid, note, tags)
        _enqueue(uid, "connect_note", note.id, stable=True)


app = FastAPI(title="Knowledge Graph API", version="0.1.0", lifespan=lifespan)


# --- output mappers ----------------------------------------------------------


def _note_out(repo, stored: StoredNote) -> NoteOut:
    n = stored.note
    count = len(repo.list_connections(stored.user_id, n.id))
    return NoteOut(
        id=n.id, title=n.title, body=n.text, source=n.domain or "authored",
        created_at=stored.created_at, connection_count=count, tags=stored.tags,
    )


def _conn_out(c) -> ConnectionOut:
    # Works for kg_engine.Connection and repo.StoredConnection (same field surface + .q).
    return ConnectionOut(
        id="c_" + (c.a_id + c.b_id)[:16],
        a_id=c.a_id, b_id=c.b_id, a_title=c.a_title, b_title=c.b_title,
        facet_type=c.facet_type, kind=kind_for(c.facet_type),
        statement=c.statement, validity=c.validity, nonobviousness=c.nonobviousness, q=c.q,
    )


# --- endpoints ---------------------------------------------------------------


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/notes", response_model=NoteOut, status_code=201)
def create_note(payload: NoteCreate, ctx: AuthContext = Depends(get_current_user)) -> NoteOut:
    nid = "n_" + uuid.uuid4().hex[:10]
    note = Note(id=nid, title=payload.title, text=payload.body, domain=payload.source)
    repo = _repo()
    stored = repo.add_note(ctx.user_id, note, payload.tags)
    # No engine on the write path — enqueue and let the worker connect this note.
    _enqueue(ctx.user_id, "connect_note", nid, stable=True)
    return _note_out(repo, stored)


@app.get("/notes", response_model=list[NoteOut])
def list_notes(ctx: AuthContext = Depends(get_current_user)) -> list[NoteOut]:
    repo = _repo()
    return [_note_out(repo, s) for s in repo.list_notes(ctx.user_id)]


@app.get("/notes/{note_id}", response_model=NoteDetail)
def get_note(note_id: str, ctx: AuthContext = Depends(get_current_user)) -> NoteDetail:
    repo = _repo()
    stored = repo.get_note(ctx.user_id, note_id)
    if stored is None:
        raise HTTPException(404, "note not found")
    conns = [_conn_out(c) for c in repo.list_connections(ctx.user_id, note_id)]
    return NoteDetail(note=_note_out(repo, stored), connections=conns)


@app.post("/notes/{note_id}/find-connections", response_model=JobOut)
def find_connections(note_id: str, ctx: AuthContext = Depends(get_current_user)) -> JobOut:
    if _repo().get_note(ctx.user_id, note_id) is None:
        raise HTTPException(404, "note not found")
    job_id = _enqueue(ctx.user_id, "connect_note", note_id, stable=True)
    job = _queue().get(job_id)
    return JobOut(job_id=job_id, status=job.status, surfaced_count=job.surfaced_count)


@app.post("/scan", response_model=JobOut)
def scan(_req: ScanRequest, ctx: AuthContext = Depends(get_current_user)) -> JobOut:
    job_id = _enqueue(ctx.user_id, "scan", None, stable=False)
    job = _queue().get(job_id)
    return JobOut(job_id=job_id, status=job.status, surfaced_count=job.surfaced_count)


@app.get("/connections", response_model=list[ConnectionOut])
def list_connections(
    note_id: str | None = None, ctx: AuthContext = Depends(get_current_user)
) -> list[ConnectionOut]:
    return [_conn_out(c) for c in _repo().list_connections(ctx.user_id, note_id)]


@app.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, ctx: AuthContext = Depends(get_current_user)) -> JobOut:
    job = _queue().get(job_id)
    if job is None or job.user_id != ctx.user_id:
        raise HTTPException(404, "job not found")
    return JobOut(job_id=job.job_id, status=job.status, surfaced_count=job.surfaced_count)


@app.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str, ctx: AuthContext = Depends(get_current_user)) -> StreamingResponse:
    """Real-time progress (A3): Server-Sent Events streaming the job's status until done/error, so
    the import/scan UI shows live progress instead of polling. One-way → SSE, not WebSockets."""
    import asyncio

    async def events() -> AsyncIterator[str]:
        for _ in range(1200):  # ~2 min ceiling
            job = _queue().get(job_id)
            if job is None or job.user_id != ctx.user_id:
                yield f"data: {json.dumps({'status': 'error'})}\n\n"
                return
            yield f"data: {json.dumps({'status': job.status, 'surfaced_count': job.surfaced_count})}\n\n"
            if job.status in ("done", "error"):
                return
            await asyncio.sleep(0.1)

    return StreamingResponse(events(), media_type="text/event-stream")


# --- clusters (Organize tab) -------------------------------------------------

_STOP = {"with", "from", "that", "this", "into", "their", "your", "about", "which", "where",
         "the", "and", "for", "are", "was", "its", "out", "not", "you", "they", "once"}


def _label(notes: list[Note]) -> str:
    """Cheap section label = most frequent salient word across member titles (PROD: a Haiku call)."""
    words: Counter[str] = Counter()
    for n in notes:
        for w in re.findall(r"[a-zA-Z]{5,}", (n.title + " " + n.text).lower()):
            if w not in _STOP:
                words[w] += 1
    top = [w for w, _ in words.most_common(2)]
    return " · ".join(w.capitalize() for w in top) if top else "Notes"


_BAND = 0.92  # multi-section membership: join any section whose centroid is within band*best

# Persisted cluster state per user so the Organize view is STABLE: a new note is assigned to an
# existing section incrementally (default); a full re-cluster only runs on the explicit trigger.
# In-memory here (dev); the Postgres target persists to note_clusters (follow-up).
_cluster_state: dict[str, dict] = {}


def _cluster_full(ids: list[str], vecs, k: int, iters: int = 12):
    """Full k-means + multi-section membership. Returns (centroids, membership{idx:[ids]})."""
    import numpy as np

    x = np.asarray(vecs, dtype=np.float32)
    x = x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-9)
    centers = [0]
    while len(centers) < k:
        d = 1 - (x @ x[centers].T).max(axis=1)
        centers.append(int(np.argmax(d)))
    c = x[centers].copy()
    for _ in range(iters):
        assign = np.argmax(x @ c.T, axis=1)
        for j in range(k):
            m = x[assign == j]
            if len(m):
                c[j] = m.mean(axis=0)
                c[j] /= np.linalg.norm(c[j]) + 1e-9
    sims = x @ c.T
    best = sims.max(axis=1)
    membership: dict[int, list[str]] = {}
    for i, nid in enumerate(ids):
        for j in range(len(c)):
            if sims[i, j] >= _BAND * best[i]:
                membership.setdefault(j, []).append(nid)
        if not any(nid in g for g in membership.values()):
            membership.setdefault(int(np.argmax(sims[i])), []).append(nid)
    return c, membership


def _assign_incremental(centroids, vec) -> list[int]:
    """Assign one note to its nearest existing section(s) — no re-clustering, so sections stay put."""
    import numpy as np

    v = np.asarray(vec, dtype=np.float32)
    v = v / (np.linalg.norm(v) + 1e-9)
    sims = centroids @ v
    best = float(sims.max())
    js = [j for j in range(len(centroids)) if float(sims[j]) >= _BAND * best]
    return js or [int(np.argmax(sims))]


@app.get("/clusters", response_model=list[ClusterOut])
def list_clusters(
    recluster: bool = Query(False),
    ctx: AuthContext = Depends(get_current_user),
) -> list[ClusterOut]:
    """Organize sections (topical k-means). DEFAULT is INCREMENTAL: a new note is assigned to its
    nearest existing section so the view stays stable (existing sections + labels don't move).
    `recluster=true` rebuilds sections from scratch — the explicit "Re-cluster" action. Topical
    vectors are cache-backed (P0-3), so no embedding call happens here."""
    repo = _repo()
    notes = repo.all_notes(ctx.user_id)
    if not notes:
        return []
    eng = Engine(_settings())
    eng.ingest(notes)
    notes_by_id = {n.id: n for n in notes}
    ids = [nid for nid in notes_by_id if nid in eng._topical]
    if not ids:
        return []

    state = _cluster_state.get(ctx.user_id)
    if recluster or state is None:
        k = max(1, min(4, len(ids)))
        centroids, membership = _cluster_full(ids, [eng._topical[i] for i in ids], k)
        labels = {
            j: (_label([notes_by_id[x] for x in m]) if len(m) > 1 else notes_by_id[m[0]].title)
            for j, m in membership.items()
        }
        state = {"centroids": centroids, "membership": membership, "labels": labels, "seen": set(ids)}
        _cluster_state[ctx.user_id] = state
    else:
        # incremental: only notes not seen before join their nearest section; labels stay fixed
        for nid in [i for i in ids if i not in state["seen"]]:
            for j in _assign_incremental(state["centroids"], eng._topical[nid]):
                state["membership"].setdefault(j, []).append(nid)
            state["seen"].add(nid)

    out = []
    for j, gids in sorted(state["membership"].items(), key=lambda kv: -len(kv[1])):
        present = [g for g in gids if g in notes_by_id]
        if not present:
            continue
        label = state["labels"].get(j) or (
            _label([notes_by_id[x] for x in present]) if len(present) > 1
            else notes_by_id[present[0]].title
        )
        out.append(ClusterOut(id=f"cl_{j}", label=label, note_ids=present, note_count=len(present)))
    return out
