# Low-Level Design

> The code-level design that sits under `SYSTEM_DESIGN.md`: module boundaries, the interface
> contracts (Protocols), the data records, worker actor signatures, the error taxonomy, concurrency
> primitives, and the key algorithms in pseudocode. It is grounded in the **actual v0 interfaces**
> (`kg_engine/models.py`, `providers.py`, `index.py`, `store.py`, `router.py`) and marks every
> production change as **[Δ v0→prod]**. Conventions: Python 3.12, `from __future__ import
> annotations`, `mypy --strict`, dataclasses for internal records, Pydantic v2 for LLM/HTTP
> boundaries.

---

## 1. Module map & dependency direction

Dependencies point **inward** to `kg_engine` (ports & adapters). The engine never imports api/
workers/store-pg; adapters implement engine-defined Protocols.

```
kg_engine/                  the headless moat — pure, no I/O frameworks
  models.py                 records + LLM-boundary Pydantic schemas
  config.py                 Settings (pydantic-settings), model_version(), config_hash()
  ports.py        [Δ NEW]   all Protocols in one place: Provider, VectorIndex, Store, Queue,
                            NotesRepo, JobRepo, FeedbackRepo, ClusterRepo, RateGovernor, Clock
  router.py                 ModelRouter: (provider, role) → model; rate-governor hook
  extract.py reason.py verify.py retrieve.py    the 6 stage functions (pure given a router/index)
  pipeline.py               Engine.ingest / connect_note / q-gate (orchestration only)
  errors.py       [Δ NEW]   the exception taxonomy (retryable vs permanent)
  providers/      [Δ split] fake.py · ollama.py · anthropic.py  (async, structured output)

kg_store_pg/                adapters: implement the engine Protocols on Postgres/pgvector
  pool.py  pg_store.py  pg_index.py  pg_queue.py  repos.py  outbox.py

kg_api/                     FastAPI — HTTP boundary only, no LLM/embedding
  deps.py (get_current_user) · routes/ · schemas.py · ratelimit.py · sse.py

kg_workers/                 Dramatiq / SKIP-LOCKED actors
  broker.py · actors.py · relay.py · spend_gate.py · scheduler_tick.py
```

---

## 2. Core records (`models.py`) — unchanged from v0 unless marked

```python
def content_hash(text: str) -> str            # normalize ws+case → sha256

@dataclass class Note:    id: str; title: str; text: str; domain: str = ""
                          @property def chash(self) -> str
@dataclass class Facet:   note_id: str; type: str; abstraction: str; salience: float
                          facet_vec: list[float]; idx: int = -1
@dataclass class Candidate: a_id; b_id; facet_type; a_abstraction; b_abstraction; sim: float
@dataclass class Connection: a_id; b_id; a_title; b_title; facet_type; statement
                          validity: int; nonobviousness: int; generic: bool; model_version: str
                          @property def q -> int        # min(validity, nonobviousness)
                          @property def surfaced -> bool # (not generic) and q >= 3
```

**[Δ v0→prod] LLM-boundary schemas get `extra='forbid'`** so a hallucinated field fails validation
instead of being silently dropped (pydantic v2 defaults to `ignore`):

```python
class FacetOut(BaseModel):
    model_config = ConfigDict(extra="forbid")           # [Δ]
    type: FacetType                                      # [Δ] Literal enum, not str
    abstraction: str = Field(min_length=1)
    salience: float = Field(ge=0.0, le=1.0)

class ExtractionOut(BaseModel): facets: list[FacetOut] = Field(default_factory=list)
class ReasonOut(BaseModel):  model_config = ConfigDict(extra="forbid")
    connection: bool; shared_structure: str = ""; why: str = ""; statement: str = ""
class VerifyOut(BaseModel):  model_config = ConfigDict(extra="forbid")
    validity: int = Field(ge=1, le=5); nonobviousness: int = Field(ge=1, le=5)
    generic: bool = False; reason: str = ""
```

**New prod records** (payloads carry **IDs/refs, never note text** — privacy + Redis size):

```python
FacetType = Literal["causal_mechanism","tension_tradeoff","selection_incentive",
                    "temporal_dynamic","abstract_pattern"]
JobType   = Literal["ingest","connect_note","scan","import_chunk","cluster","digest"]
JobStatus = Literal["queued","dispatched","running","done","error","dead"]

@dataclass class JobSpec:
    type: JobType; user_id: UUID; payload: dict           # {"note_id": ...} etc — refs only
    idempotency_key: str                                  # see §6
@dataclass class AuthContext:                             # the SOLE source of user_id
    user_id: UUID; edition: Literal["community","premium"]
@dataclass class FeedbackEvent:
    user_id: UUID; a_note_id: UUID; b_note_id: UUID; facet_type: FacetType
    abstraction: str; axis: Literal["useful","wrong","obvious","surface_match"]
    provenance: "Provenance"                              # immutable snapshot at vote time
```

---

## 3. The interface contracts (`ports.py`)

Existing v0 Protocols, **made `async` for prod** (sync `httpx`/`anthropic` in an async route blocks
the loop). Adapters live in `kg_store_pg`/`providers`.

```python
# --- model provider (v0: sync chat_json/embed) -----------------------------------
class Provider(Protocol):                                 # [Δ] async + typed structured output
    async def chat_struct[T: BaseModel](self, system: str, user: str,
                                        model: str, schema: type[T]) -> T: ...
    async def embed(self, texts: list[str], model: str) -> list[list[float]]: ...
# fake.py validates against the SAME schema → it is a contract test for the prompts.

# --- vector index (v0 exact signatures) ------------------------------------------
class VectorIndex(Protocol):
    async def add(self, user_id: UUID, facet_type: str, note_id: str,
                  facet_idx: int, salience: float, vec: list[float]) -> None: ...   # [Δ] user_id
    async def query(self, user_id: UUID, facet_type: str, vec: list[float],
                    k: int) -> list[tuple[str, int, float]]: ...                    # (note_id, idx, sim)
    async def neighbors_within(self, user_id: UUID, facet_type: str,
                               vec: list[float], radius: float) -> int: ...         # hub count

# --- store: facet cache + topical cache + lifetime dedup -------------------------
class Store(Protocol):
    async def get_facets(self, chash: str, extract_version: str) -> list[Facet] | None: ...
    async def put_facets(self, chash: str, extract_version: str, facets: list[Facet]) -> None: ...
    async def get_topical(self, chash: str, embed_version: str) -> list[float] | None: ...  # [Δ NEW] D8
    async def put_topical(self, chash: str, embed_version: str, vec: list[float]) -> None: ... # [Δ NEW]
    # [Δ] v0 seen_pair (read-AND-mutate) is SPLIT so reads stay idempotent without the
    #     _judged_pairs.clear() hack at main.py:137:
    async def is_seen(self, user_id: UUID, a: str, b: str, model_version: str) -> bool: ...
    async def mark_seen(self, user_id: UUID, a: str, b: str, model_version: str) -> bool: ...
        # returns False if the pair already existed (ON CONFLICT DO NOTHING) → caller no-ops

# --- async substrate seam (the D1 decision, in code) -----------------------------
class Queue(Protocol):                                    # pg adapter | redis(dramatiq) adapter
    async def enqueue(self, conn: Connection, job: JobSpec) -> UUID: ...
        # MUST insert into `jobs` in the SAME txn as the caller's write (outbox) — takes the txn conn
    async def claim(self, types: list[JobType], limit: int) -> list[JobSpec]: ...   # pg: SKIP LOCKED
    async def ack(self, job_id: UUID, status: JobStatus, surfaced: int | None) -> None: ...

class NotesRepo(Protocol):   # user-scoped CRUD (RLS-backed); reads NEVER touch the engine
    async def add(self, ctx: AuthContext, note: Note, tags: list[str]) -> StoredNote: ...
    async def get(self, ctx: AuthContext, note_id: UUID) -> StoredNote | None: ...
    async def list(self, ctx: AuthContext, page: Cursor) -> Page[StoredNote]: ...   # [Δ] paginated
class FeedbackRepo(Protocol): async def append(self, ev: FeedbackEvent) -> None: ...  # append-only
class RateGovernor(Protocol):
    async def acquire(self, provider: str, model: str, est_tokens: int) -> None: ...  # token bucket / semaphore
class Clock(Protocol): def now(self) -> datetime: ...     # injected → deterministic tests
```

---

## 4. Worker actors (`kg_workers/actors.py`)

One actor per stage; the per-candidate reason→verify fans out with `anyio`. **Every actor re-checks
the cache/dedup before any paid call** (idempotency contract).

```python
@actor(queue="default", max_retries=5, time_limit=120_000)
async def ingest(note_id: str) -> None:
    note = await notes.get_raw(note_id)
    facets = await store.get_facets(note.chash, S.extract_version) \
             or await _extract_and_cache(note)               # Stage 1 (cached)
    topical = await store.get_topical(note.chash, S.embed_version) \
              or await _embed_topical_and_cache(note)         # Stage 2 (cached) — D8
    await index.add_all(note.user_id, facets)                 # Stage 3 index
    await queue.enqueue_self(JobSpec("connect_note", note.user_id, {"note_id": note_id}, ...))

@actor(queue="default", max_retries=5, time_limit=300_000)
async def connect_note(note_id: str) -> int:
    cands = retrieve.candidates_for_note(...)                 # Stage 3 prune (pure, no LLM)
    async with anyio.create_task_group() as tg:
        lim = CapacityLimiter(S.reason_concurrency)           # 1–2 Ollama / higher Anthropic
        for c in cands:
            if await store.is_seen(uid, c.a_id, c.b_id, mv): continue
            tg.start_soon(_judge_one, c, lim)                 # reason → verify → gate → persist
    return surfaced_count

async def _judge_one(c: Candidate, lim: CapacityLimiter) -> None:
    async with lim:
        if not await store.mark_seen(uid, c.a_id, c.b_id, mv): return   # lost the race → no-op
        await gov.acquire("anthropic", reason_model, est)
        r = await router.reason(c, a, b)                      # ReasonOut
        if not r.connection or not r.statement.strip(): return
        await gov.acquire("anthropic", verify_model, est)
        v = await router.verify(r.statement, a, b)            # VerifyOut — NEVER gets r.why/rationale
        conn = Connection(..., validity=v.validity, nonobviousness=v.nonobviousness, generic=v.generic)
        await connections.upsert(conn)                        # surfaced = (not generic) and q>=3
```

**Decorrelation is a type-level invariant:** `verify()` takes `(statement, note_a, note_b)` — there
is no parameter through which the reasoner's `why`/`shared_structure` could reach it.

---

## 5. Error taxonomy (`errors.py`)

The three retry layers (HTTP / message / permanent) only stay non-overlapping if exceptions are
typed and Dramatiq's retry predicate keys off them.

```python
class KGError(Exception): ...
class TransientError(KGError): ...        # 429/5xx/timeout/transport → retry (stamina + Dramatiq)
class RateLimited(TransientError): retry_after: float | None
class PermanentError(KGError): ...        # NON-retryable → dead-letter immediately, no hot-loop
class SchemaInvalid(PermanentError): ...  # provider returned output that fails the Pydantic model
class OversizedContent(PermanentError): ...
class TenancyError(KGError): ...          # user_id mismatch — fail closed, never swallow

def should_retry(e: Exception) -> bool: return isinstance(e, TransientError)
```

---

## 6. Idempotency & dedup (the load-bearing keys)

```python
# job collapse (double-click "Find connections" → one job):
idempotency_key = sha256(f"{job_type}:{content_hash_or_note_id}:{model_version}")
#   → UNIQUE(jobs.idempotency_key); deterministic Dramatiq message_id = same string

# lifetime per-pair dedup (judge a pair at most once ever, per model_version):
mark_seen(uid, a, b, mv):
    INSERT INTO pair_dedup(user_id, lo, hi, model_version)        -- lo=least(a,b), hi=greatest(a,b)
    VALUES (...) ON CONFLICT DO NOTHING RETURNING 1;             -- None ⇒ already seen ⇒ caller no-ops

# extraction / topical caches — keyed independently so a verify-prompt bump doesn't re-extract/re-embed:
facet_cache   PK (content_hash, extract_version)                 -- per-stage version
topical_cache PK (content_hash, embed_version)                   -- embed_model+dim ONLY (D8)
```

`extract_version`, `embed_version`, and `model_version` are **separate** so each cache invalidates
only on changes that affect *it* (the §2/config.py D3+D8 fix — `model_version` folds prompts+config
but the topical cache must NOT use it).

---

## 7. Key algorithms (pseudocode)

**(a) Postgres-queue claim (Community substrate):**
```sql
UPDATE jobs SET status='running', locked_at=now(), attempts=attempts+1
WHERE id IN (
  SELECT id FROM jobs WHERE status='queued' AND run_after<=now()
  ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT $batch
) RETURNING *;
```

**(b) Outbox relay (Premium dual-write fix, §11.3 of SYSTEM_DESIGN):**
```
loop:  rows = SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 500  -- committed only
       for r in rows: dramatiq_actor.send(r.id); UPDATE jobs SET status='dispatched' WHERE id=r.id
       wait on LISTEN kg_jobs  (or 1s poll)
# at-least-once to Redis is safe: actor re-checks cache/dedup → redelivery is a no-op
```

**(c) Retrieve pruning (Stage 3, pure — ports the v0 `retrieve.py` order exactly):**
```
for f in facets:
  if f.salience < salience_floor:                                continue   # (b)
  if index.neighbors_within(uid, f.type, f.vec, hub_radius) > hub_quarantine: continue  # (c) hub
  for (nb_id, _, sim) in index.query(uid, f.type, f.vec, top_k):
     if nb_id == note_id:                                        continue   # (a) self
     if cos(topical[note_id], topical[nb_id]) >= topical_reject: continue   # (d) same-topic reject
     keep best-sim Candidate per normalized pair
return top (max_surfaced_per_note + 3) by sim
```

**(d) HNSW query under filter (pgvector adapter):**
```sql
SET LOCAL hnsw.ef_search = $ef;                 -- ≫ k, recall-biased
SET LOCAL hnsw.iterative_scan = relaxed_order;  -- keep walking until k POST-filter survivors
SELECT note_id, facet_idx, 1 - (facet_vec <=> $q) AS sim   -- cosine SIM = 1 - cosine DISTANCE
FROM note_facets
WHERE user_id=$uid AND facet_type=$t            -- RLS also enforces user_id (defense in depth)
ORDER BY facet_vec <=> $q LIMIT $k;             -- <=> (cosine), never <-> (L2) → matches numpy baseline
```

**(e) Rate governor (Premium token bucket, Redis Lua — one atomic refill+take per `(provider,model)`):**
```
acquire(p, m, est):  loop:
  allowed = redis.eval(BUCKET_LUA, key=p:m, args=[rate, burst, est, now])
  if allowed: return
  sleep(retry_after_from_headers or backoff)    # honor anthropic-ratelimit-* / Retry-After
# Ollama path: a Redis semaphore of size 1–2 instead of a token bucket (single GPU)
```

---

## 8. Sequence: `POST /notes` → first surfaced connection

```
Client → kg_api: POST /notes (JWT)
kg_api: get_current_user → AuthContext(user_id)            # sole tenancy source
kg_api: BEGIN; notes.add(ctx, note); queue.enqueue(txn, JobSpec ingest)  # OUTBOX: one txn
kg_api → Client: 201 {note_id, job_id, status:"queued"}    # boundary — no LLM
[relay] jobs row → Redis (Premium)  |  worker SKIP-LOCKED claims (Community)
worker.ingest: facets (cache?) → topical (cache?) → index.add → enqueue connect_note
worker.connect_note: retrieve → ∀ candidate: is_seen? → reason → verify(no rationale) → q≥3? upsert
worker.ack(job, done, surfaced_count); writes stage_events rows
Client polls GET /jobs/{id} → done; GET /connections?note_id= → reads persisted rows (no LLM)
```

---

## 9. Concurrency & determinism rules

- **Async everywhere below the API**; `anyio.CapacityLimiter` caps provider fan-out (config:
  `reason_concurrency`). Per-actor `TimeLimit` unpins a hung call.
- **`Clock` is injected** — no `datetime.now()` / `random` in engine code, so tests and the eval
  harness are deterministic (mirrors the fake provider's determinism).
- **Pools are small** (5–10/proc, LLM-bounded, not QPS-bounded); RLS GUC + `ef_search` set with
  `SET LOCAL` *inside* the query txn; prepared statements off under txn-mode PgBouncer.
- **The `FakeProvider` validates against the prod Pydantic schemas**, so a schema change breaks the
  fast infra-free test suite immediately (contract test).

---

## 10. Testing seams (what each layer's test proves)

| Layer | Test | Catches |
|---|---|---|
| Engine (fake provider) | `pytest` wiring, no infra | pipeline shape, gate logic, schema contract |
| `kg_store_pg` | testcontainers Postgres | HNSW recall@20, partition prune, `ON CONFLICT` dedup, **cross-tenant RLS leak** |
| providers | respx/vcr cassettes (scrub auth + note text) | provider parsing, structured-output, retry classification |
| Queue | both adapters against one `Queue` contract test | PG-vs-Redis parity, outbox at-least-once → dedup no-op |
| Eval | `eval.py` golden + messy floor | precision ≥75%, garbage cut, recall@20 — the **deploy gate** |
```
