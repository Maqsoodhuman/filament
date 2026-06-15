# Knowledge Graph — Backend Engineering Guide

This is the authoritative backend guide for taking the `kg_engine` v0 engine to the planned FastAPI + Dramatiq + Postgres/pgvector production system. It resolves the five specialist reviews into one decisive direction.

---

## 1. Finalized backend package list

| Concern | Chosen package | One-line why |
|---|---|---|
| Deps mgmt / lockfile | **uv** (`>=0.5`) + keep `setuptools` build backend | 10–100x faster, PEP 621-native, universal `uv.lock` makes Fly + laptop byte-reproducible — mandatory for a deploy-gated eval pipeline. |
| Config | **pydantic-settings** (`>=2.4`) | You already ship pydantic v2; gives typed coercion, fail-fast validation at boot, `env_prefix='KG_'`, and `SecretStr` for the API key. |
| HTTP client | **httpx.AsyncClient** (`>=0.27`) + structured `httpx.Timeout` | Async (won't block the FastAPI loop) with per-phase timeouts and connection limits, one long-lived client per provider. |
| Retry | **stamina** (wraps tenacity) | Safe-by-default declarative retry on transient errors only; tenacity directly if you need fine control. |
| Queue / workers | **dramatiq[redis,watch]** (`~1.17`) | Right altitude for ~6 I/O-bound stages with existing idempotency keys; simpler ops than Celery, more durable than RQ/arq. |
| Rate governor | **Redis token bucket** (hand-rolled Lua) in the model_router seam | Anthropic enforces *simultaneous* RPM/ITPM/OTPM + `Retry-After`; needs a cluster-wide token-aware governor, not per-worker limits. |
| Scheduler | **External Fly scheduled-machine cron → `tick` actor** | Most boring leader-safe option; avoids per-replica double-fire. (APScheduler 4 + Postgres jobstore is the in-process fallback.) |
| DB driver | **psycopg[binary,pool]** (`3.2.x`) | Async + sync (CLI/eval), built-in pool, `COPY`, pgvector-native `register_vector_async`; driver QPS is irrelevant when LLM latency dominates. |
| Migrations | **Alembic** (`>=1.13`) | Standard; hand-write the HNSW/partition/`CREATE INDEX CONCURRENTLY` migrations (autogenerate can't diff them). |
| Pooling | **psycopg_pool.AsyncConnectionPool** (5–10/process) | Small per-process pools sized to LLM-bounded concurrency, not Fly Postgres' low `max_connections`; PgBouncer transaction mode only if process count grows. |
| Vector store | **pgvector** ext `0.8.x` + **pgvector-python** `0.3.x` (HNSW) | 0.8 iterative scans fix the filter+ANN under-return that your recall moat cannot afford; single system of record at this scale. |
| Structured output | **Native** Anthropic `output_config.format` / `messages.parse()` + Ollama `format=Model.model_json_schema()` | Constrain JSON at the provider; retire the "Return ONLY raw JSON" hack + `_loads_lenient`. (instructor only if you want one retry/validation seam across both.) |
| Provider routing | **Keep the hand-rolled `ModelRouter`** | Two providers + embeddings fallback + deterministic fake — litellm's OpenAI-shaped breadth is the wrong fit; the seam is ~58 lines and testable. |
| Eval | **Keep `eval.py` as source of truth** + thin pytest CI gate | Cross-domain-recall-vs-garbage is your domain metric, not something promptfoo/deepeval compute; just gate it. |
| Observability | **OpenTelemetry/OpenLLMetry → Logfire** + **sentry-sdk** (`>=2.x`, FastAPI + Dramatiq) | Per-stage spans tagged with model/prompt version + cost; Logfire is OTel-native and pydantic-native; Sentry for worker exceptions + release health. |
| Auth | **Clerk** (JWT) verified with **PyJWT[crypto]** (`>=2.9`) behind one `get_current_user` | Cross-origin Vercel↔Fly split → stateless JWT at the API edge + seat/org for per-seat pricing; one dependency keeps the native-swap path mechanical. |
| Rate limiting (HTTP) | **SlowAPI** (`>=0.1.9`) backed by Redis | Stops trigger-endpoint abuse across Fly machines; the real cost control is the worker-side spend ceiling, not this. |
| Testing | **pytest** + **pytest-asyncio** + **testcontainers[postgres]** + **respx/vcrpy** | Keep infra-free fake-provider tests as the default; add real pgvector + recorded-provider HTTP for the two new seams. |
| Type checker | **mypy --strict** (`>=1.11`) | The `(provider, role)` router table KeyErrors at runtime for unknown pairs — a checker + exhaustiveness assert catches it. |
| Lint/format | **ruff** (target-version `py312`, rules incl. `I`, `UP`) | One tool for lint + format + import-sort + pyupgrade. |
| Deploy | **Fly.io** (api/workers + **Managed Postgres**) + **Vercel** (frontend) + persistent Redis (Upstash/AOF) | api/worker split maps to two Fly apps sharing Redis; use *Managed* PG (not self-run `fly pg`) and persistent Redis or Dramatiq's durability guarantees evaporate. |

---

## 2. Changes to our v0 (prioritized — most important first)

1. **[CHANGE — #1 correctness risk] Move the store, index, cache, and dedup out of memory into Postgres/pgvector before anything else.** Dramatiq+Redis is at-least-once and *will* redeliver on worker crash. The in-memory `InMemoryStore.seen_pair` set does not survive a restart or span concurrent workers, so the "judge each pair at most once, ever" guarantee — and your double-billing protection — evaporates the moment you deploy. Enforce idempotency at the **data layer**: a `UNIQUE(content_hash, model_version)` constraint with `INSERT … ON CONFLICT DO NOTHING`, and a dedup table keyed `UNIQUE(user_id, least(a_id,b_id), greatest(a_id,b_id), model_version)`. Derive the Dramatiq `message_id` deterministically from `(job_type, content_hash, model_version)` so a double-click on "Find connections" collapses to one job. Nothing else matters if this is wrong.

2. **[CHANGE] Make the provider layer and pipeline async.** Port `OllamaProvider`/`AnthropicProvider` to `httpx.AsyncClient` + `anthropic.AsyncAnthropic`, and make the `Provider` Protocol `async`. The current sync `httpx.Client(timeout=120.0)` blocks the FastAPI event loop and serializes every reason+verify round-trip. At the API edge, never call the engine directly in an async route — push it to a Dramatiq worker (LLM work is off the HTTP path anyway). Fan out the embarrassingly-parallel per-candidate reason/verify with `anyio.create_task_group()` + a `CapacityLimiter` (1–2 for local Ollama's single GPU, higher for Anthropic).

3. **[CHANGE] Fold the retrieval/gate knobs into the version/cache key.** `model_version()` hashes model names + `PROMPT_VERSION` but **not** `q_threshold`, `top_k`, `salience_floor`, `topical_reject`, `hub_radius`, or the embedding *dimension*. Changing a threshold today silently serves stale cached connections and stamps them with an unchanged version — which quietly breaks ARCHITECTURE.md's "every threshold/K change is gated and reproducible" promise. Add a `config_hash` (or fold these into `model_version()`) **before any production data accumulates** — backfilling provenance later is painful. Also make `PROMPT_VERSION` per-stage so a verify-prompt tweak doesn't invalidate cached extractions.

4. **[CHANGE] Constrain structured output at the provider; stop prompt-and-salvage.** Switch the Anthropic path to `output_config.format` / `messages.parse()` with your Pydantic models, and the Ollama path from `format:"json"` to `format=Model.model_json_schema()`. Set `model_config = ConfigDict(extra='forbid')` on `VerifyOut`/`FacetOut` (pydantic v2 defaults to `extra='ignore'`, so a hallucinated field silently vanishes). Keep `_loads_lenient` only as a defensive fallback for stubborn local models. Make the `FakeProvider` emit objects that validate against these same models so a schema change breaks tests immediately.

5. **[ADD] Cluster-wide token-aware rate governor in the model_router seam.** A shared Redis token bucket per `(provider, model)` that respects Anthropic's `anthropic-ratelimit-*` / `Retry-After` headers, plus a Redis concurrency semaphore (1–2) for local Ollama. Without this, scaling worker replicas overshoots Anthropic's simultaneous limits and triggers a self-amplifying 429 storm that message-level retries only worsen.

6. **[ADD] Config → pydantic-settings; deps → uv + committed `uv.lock`; mypy --strict + ruff + eval in CI.** Migrate the hand-rolled `@dataclass`/`os.getenv` config (a bad `KG_TOP_K` currently raises a bare `ValueError` at import). Commit a lockfile so workers and laptops resolve identical numpy/httpx/pydantic. Gate CI on ruff, `mypy --strict`, fast fake-provider pytest, and a separate eval job that blocks merge on precision regression.

7. **[ADD] Bulk import via the Anthropic Batches API with explicit backpressure.** Route mass import through a fan-out → submit Message Batches → persist `batch_id` → scheduled poller → reap → enqueue-downstream state machine (50% off, ~1h, never on the interactive path). Use a separate concurrency-capped `bulk` queue so imports can't starve interactive "Find connections" jobs, and enforce per-import/per-user spend ceilings + adaptive-K **before** enqueuing LLM work. Add `dramatiq-abort` so a user can cancel a runaway Scan, and a DLQ→Postgres persistence middleware with a depth alarm. Keep payloads as IDs/refs, not full note text (Redis OOM + privacy).

8. **[ADD] Observability, auth, retries, structured logging.** OTel/OpenLLMetry spans per stage (model_version, prompt_hash, tokens, q, surfaced) → Logfire; Sentry for worker exceptions with `before_send` scrubbing note bodies. Clerk JWT behind one `get_current_user`. `structlog` with bound context (user_id, note_id, model_version, role) — never log note text or keys.

9. **[KEEP] What's already right:** the `ModelRouter` seam (don't reach for litellm); LangGraph reserved as optional (the pipeline is a fixed DAG, not an agent loop); `(content_hash, model_version)` cache keying; the deterministic infra-free `FakeProvider`; numpy in-memory `VectorIndex` for v0 (the Protocol is a clean drop-in for pgvector); `pg_trgm` alongside pgvector; the independent skeptical verifier; promoting to Qdrant only at a documented trigger (single tenant >~1–5M vectors, or p99 ANN budget breach after tuning).

> Note on model IDs: pin `claude-sonnet-4-6` and the bare alias **`claude-haiku-4-5`** (drop the date suffix `claude-haiku-4-5-20251001` in `config.py`). Premium Opus is `claude-opus-4-8` if you route the reason stage to Opus. There is **no Anthropic embeddings endpoint** — your `AnthropicProvider.embed` correctly raises `NotImplementedError`; Premium must wire Voyage (1024-d) or keep Ollama/nomic (768-d) for the embed role.

---

## 3. Best-practice patterns (the ones that matter for THIS system)

### Idempotency & retries on LLM calls
Three retry layers exist and **compound multiplicatively** if you let them all fire — a single bad job becomes dozens of paid calls. Assign non-overlapping responsibilities:
- **HTTP transient (429/5xx/timeouts/transport):** stamina/tenacity (Ollama + embedding paths) with exponential jitter, honoring `Retry-After`; the Anthropic SDK retries its own calls (`max_retries`, default 2) — set it deliberately.
- **Message-level:** Dramatiq `Retries` middleware with bounded `max_retries` + `min/max_backoff`.
- **Permanent (schema-invalid output, oversized content):** raise a **non-retryable** exception so the message dead-letters immediately instead of hot-looping.

Every actor must re-check the `(content_hash, model_version)` cache / dedup before any paid call and no-op on a hit. Cap wall-clock with per-actor `TimeLimit` so a hung Ollama call can't pin a worker.

### pgvector HNSW tuning
Bias for recall — your moat is finding topically-distant-but-structurally-similar facets. Build the index at **`m=24–32`, `ef_construction=128–200`** (above the 16/64 defaults), and tune **`ef_search` at runtime via `SET LOCAL`** (start 100–200), well above `top_k=20`. **The non-negotiable fix:** with the default `ef_search=40`, the HNSW scan returns ~40 candidates *before* your `user_id`+`facet_type`+`salience`+`topical` filters run, so a tenant matching 10% of rows silently yields ~4 results when you asked for 20. Use pgvector 0.8 **`hnsw.iterative_scan = relaxed_order`** so the graph keeps walking until it has K post-filter survivors. Index with `vector_cosine_ops` and query with `<=>` (your numpy code normalizes + dots = cosine — a `<->` query won't use the index and breaks fake-vs-prod parity). Embedding dimension must be an explicit schema/partition dimension (768-d Community vs 1024-d Premium cannot share one HNSW index). Add an ANN-recall@20-vs-brute-force metric to `eval.py`.

### Structured-output validation
Constrain at the provider (above), then validate every response through the Pydantic model **inside the provider** (not after, where `_loads_lenient` returns a raw dict). `extra='forbid'` on strict schemas. The fake provider validating against the same models turns it into a contract test for the schemas.

### Multi-tenant isolation (correctness, not just privacy — connections are STRICTLY intra-user)
Defense-in-depth: `user_id` on every table, leading column of every composite index, the partition/filter key on every query — **and** Postgres Row-Level Security keyed on `SET app.current_user_id` per request, so a forgotten `WHERE` fails closed. The auth `get_current_user` dependency is the *sole* source of `user_id`; the same chokepoint feeds the GUC. (If you adopt PgBouncer transaction mode: set the RLS GUC and `ef_search` with `SET LOCAL` inside the query transaction and disable psycopg3 prepared statements.) Fake-provider tests will never catch a cross-tenant leak — this is what testcontainers + RLS policies are for.

### The model_router seam
Keep it thin and hand-rolled. Add explicit validation + an **exhaustiveness assert** so a typo in `KG_PROVIDER` fails with a friendly error instead of a deep `KeyError`; add the missing `embed` entries for `fake`/`anthropic`. This is the single place to enforce provider-specific rate limits (token bucket for Anthropic, semaphore for Ollama) and the local↔Claude parity the product depends on.

### The eval deploy-gate
`run_eval()` must exit non-zero with **two independent thresholds** — `genuine_recalled/genuine_total >= floor` AND `garbage_surfaced <= ceiling` (a single "precision" number hides regressions) — plus precision ≥ 75% per ARCHITECTURE.md §8. Run it in CI on any change to prompts/models/thresholds/K, against **both** the fake provider (wiring smoke test) and at least one real local model (quality check). Store each `eval_run` with `model_version` + `config_hash`. A model-id bump must bust `model_version()` and re-run the golden set before promotion (catches silent verifier-calibration drift).

---

## 4. Project layout

```
knowledge-graph/
├── pyproject.toml            # PEP 621 [project]; setuptools backend; extras: postgres, anthropic, api, worker, dev
├── uv.lock                   # committed — byte-reproducible across Fly + laptop
├── alembic.ini
├── migrations/               # Alembic; HNSW / partition / CONCURRENTLY hand-written, non-transactional
│   └── versions/
├── src/
│   ├── kg_engine/            # the headless engine — runs identically on Ollama and Claude
│   │   ├── config.py             # pydantic-settings BaseSettings; SecretStr; model_version()+config_hash
│   │   ├── models.py             # LLM-boundary schemas (FacetOut/ReasonOut/VerifyOut, extra='forbid')
│   │   ├── pipeline.py           # extract→embed→index→retrieve→reason→verify→q-gate (fixed DAG)
│   │   ├── router.py             # ModelRouter seam + exhaustiveness assert + rate-governor hook
│   │   ├── providers/            # async: fake.py, ollama.py, anthropic.py (structured output + retries)
│   │   ├── index.py              # VectorIndex Protocol: add/query/neighbors_within
│   │   ├── store.py              # Store Protocol: is_seen()/mark_seen() split (no read-mutate)
│   │   ├── ratelimit.py          # Redis token bucket (per provider,model) + Ollama semaphore
│   │   ├── logging.py            # structlog bound-context setup
│   │   └── telemetry.py          # OTel/OpenLLMetry span helpers (per-stage, cost attrs)
│   ├── kg_store_pg/          # production persistence impls of the engine Protocols
│   │   ├── pg_index.py           # pgvector HNSW; neighbors_within = bounded ANN + distance threshold
│   │   ├── pg_store.py           # facets/connections/dedup; ON CONFLICT; COPY bulk path
│   │   ├── pool.py               # psycopg_pool.AsyncConnectionPool; per-request RLS GUC
│   │   └── tables.py             # SQLAlchemy 2.0 Core table defs (Alembic metadata source)
│   ├── kg_api/               # FastAPI service (HTTP write path only — no LLM work here)
│   │   ├── main.py               # lifespan: open httpx client / pool / Dramatiq broker
│   │   ├── deps.py               # get_current_user (Clerk JWT) → user_id (sole tenancy source)
│   │   ├── routes/               # triggers ("Find connections"/"Scan"): enqueue + return job_id
│   │   ├── ratelimit.py          # SlowAPI (Redis-backed) on trigger/auth routes
│   │   └── schemas.py            # request/response Pydantic models (size caps, facet_type enums)
│   └── kg_workers/           # Dramatiq actors
│       ├── broker.py             # Redis broker + middleware: Retries, TimeLimit, Shutdown, Prometheus, DLQ→PG
│       ├── pipeline_actors.py    # one actor per stage; group for per-candidate reason/verify fan-out
│       ├── batch_import.py       # fan-out → submit Batches → persist batch_id → poll → reap
│       ├── spend_gate.py         # per-import/per-user ceiling + adaptive-K (checked pre-enqueue)
│       └── scheduler_tick.py     # actor enqueued by external Fly cron (re-scan/digest/DLQ sweep)
├── eval/
│   ├── eval.py               # source of truth: cross-domain recall vs garbage-rate (+ ANN recall@20)
│   ├── golden/               # labeled JSON set
│   └── gate.py               # CI wrapper: exits non-zero on recall floor / garbage ceiling / precision<75%
├── tests/
│   ├── test_pipeline.py      # fast default loop — Settings(provider='fake'), no infra
│   ├── integration/          # testcontainers[postgres]: HNSW recall, partition prune, RLS, ON CONFLICT
│   └── providers/            # respx/vcrpy cassettes (scrub Authorization + note text)
├── fly.api.toml  fly.worker.toml
└── .github/workflows/ci.yml  # ruff · mypy --strict · pytest(fake) · eval gate · testcontainers
```

Two Fly deployables (`kg_api`, `kg_workers`) sharing Redis + Managed Postgres; one scheduler responsibility lives behind an external Fly cron, not in every worker replica.

---

## 5. Top risks / gotchas (backend-specific, with mitigations)

- **At-least-once delivery double-bills / double-surfaces.** In-memory dedup doesn't survive restarts or concurrent workers. → Postgres `UNIQUE` constraints + `ON CONFLICT`; deterministic `message_id`; every actor re-checks cache before paid calls. (Highest-priority migration risk.)
- **HNSW post-filter under-return silently degrades recall** — the exact failure your moat can't afford. → pgvector 0.8 `iterative_scan = relaxed_order`, `ef_search` ≫ K; never assume filter+ANN compose for free. Measure recall@20 in the eval harness.
- **Cache key omits retrieval/gating config + embedding dimension.** Threshold/K/dimension changes serve stale results under an unchanged version stamp. → Add `config_hash` before data accumulates; make embedding dimension an explicit schema dimension (768-d and 1024-d cannot share an HNSW index).
- **Anthropic's three simultaneous rate limits (RPM/ITPM/OTPM) + per-worker throttling = 429 storm on scale-out.** → Single shared Redis token bucket per `(provider, model)`; honor `Retry-After`, don't just back off blindly.
- **Unbounded one-task-per-note import floods the broker, starves interactive jobs, blows the spend ceiling, and can OOM small Redis.** → Chunked Batches submission, dedicated low-concurrency `bulk` queue, pre-enqueue spend/adaptive-K gate, payloads as IDs not note text.
- **Async/event-loop mismatch.** Sync `httpx.Client` + `anthropic.Anthropic()` in an async FastAPI route blocks every concurrent request — invisible in current sync fake-provider tests. → Async providers + run engine only in workers / threadpool.
- **Tenancy leak at the SQL layer.** One forgotten `WHERE user_id=?` leaks another user's private corpus (a correctness bug per the strict-intra-user spec). → RLS fail-closed + single auth-sourced `user_id`. Fake tests never catch this.
- **Cosine/L2 opclass mismatch** breaks fake-vs-prod parity: a `<->` query against a `vector_cosine_ops` index skips the index and returns different neighbors than the numpy baseline. → `vector_cosine_ops` + `<=>`, asserted in integration tests.
- **`CREATE INDEX CONCURRENTLY` can't run in Alembic's default transaction** → non-transactional migration / autocommit, raise `maintenance_work_mem`, build HNSW after bulk load.
- **Three compounding retry layers** → non-overlapping responsibilities; schema-invalid/oversized = non-retryable → dead-letter, don't loop.
- **DLQ lives in Redis and can vanish on flush/restart; in-process APScheduler fires N times across replicas.** → DLQ→Postgres middleware + depth alarm; single external-cron `tick` actor (or Postgres-jobstore lock).
- **Private note text leaks into Sentry breadcrumbs / OTel span attrs / logs / vcr cassettes** — fatal for the privacy-trust positioning. → Decide redaction *before* turning telemetry on: Sentry `before_send`, span attribute allowlists, no full-prompt logging, vcr `filter_headers`/`before_record`.
- **Prompt-cache silent misses + minimum-prefix floor.** Caching is a strict prefix match (any byte change — interpolated note text or timestamp — gives `cache_read_input_tokens: 0`), and the minimum cacheable prefix is **4096 tokens on Haiku 4.5 / Opus, 2048 on Sonnet 4.6** — a shorter system block silently never caches. → Stable rubric first with the `cache_control` breakpoint after it, volatile note text in the user turn; verify cached-token counts in traces.
- **Batches are async (≤24h) and results expire after 29 days.** → Real, separate fast-lane vs batch code paths; never block an HTTP request on a batch poll; reap within retention.
- **Self-run `fly pg` is not managed; default Redis is ephemeral.** → Fly Managed Postgres (or Neon/Crunchy) for the private-data system of record; persistent Redis (Upstash/AOF) or Dramatiq's durability guarantees are void.

---

## 6. References (deduped, highest-value)

**Python foundations**
- uv — https://docs.astral.sh/uv/ · pydantic-settings — https://docs.pydantic.dev/latest/concepts/pydantic_settings/
- httpx async/timeouts — https://www.python-httpx.org/async/ , https://www.python-httpx.org/advanced/timeouts/
- AnyIO task groups — https://anyio.readthedocs.io/en/stable/tasks.html · stamina — https://stamina.hynek.me/ · tenacity — https://tenacity.readthedocs.io/
- structlog — https://www.structlog.org/ · mypy strict — https://mypy.readthedocs.io/en/stable/existing_code.html

**Queue & orchestration**
- Dramatiq (middleware, pipelines/groups, rate limiters, DLQ) — https://dramatiq.io/ , https://dramatiq.io/advanced.html
- Brandur — idempotency keys & transactionally-staged job drains — https://brandur.org/idempotency-keys , https://brandur.org/job-drain
- APScheduler 4 — https://apscheduler.readthedocs.io/

**Postgres + pgvector**
- pgvector (HNSW params, opclasses, iterative scans) — https://github.com/pgvector/pgvector
- pgvector 0.8 release (iterative scans / filtering) — https://www.postgresql.org/about/news/pgvector-080-released-2952
- Filtered-vector query optimization (HNSW + filter composition) — https://www.clarvo.ai/blog/optimizing-filtered-vector-queries-from-tens-of-seconds-to-single-digit-milliseconds-in-postgresql
- psycopg 3 (async, pool, PgBouncer) — https://www.psycopg.org/psycopg3/docs/ · Alembic — https://alembic.sqlalchemy.org/ · RLS — https://www.postgresql.org/docs/current/ddl-rowsecurity.html

**Anthropic / LLM**
- Structured outputs (`output_config.format` / `messages.parse`) — https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Message Batches (50% off, 100k/batch, ~1h, 29-day retention) — https://platform.claude.com/docs/en/build-with-claude/batch-processing
- Prompt caching (prefix invariant, per-model minimums, TTL/economics) — https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Rate limits (simultaneous RPM/ITPM/OTPM, `anthropic-ratelimit-*`, `Retry-After`) — https://docs.anthropic.com/en/api/rate-limits
- Ollama structured outputs (`format` = JSON Schema) — https://docs.ollama.com/capabilities/structured-outputs
- instructor (if adopting one cross-provider seam) — https://python.useinstructor.com/integrations/ollama/

**API / ops / observability**
- FastAPI security + lifespan — https://fastapi.tiangolo.com/tutorial/security/ , https://fastapi.tiangolo.com/advanced/events/
- Clerk JWT verification (non-Next services) — https://clerk.com/docs/backend-requests/handling/manual-jwt
- Logfire (OTel-native, pydantic) — https://logfire.pydantic.dev · OpenLLMetry→Langfuse — https://www.traceloop.com/docs/openllmetry/integrations/langfuse
- Sentry FastAPI + Dramatiq + data scrubbing — https://docs.sentry.io/platforms/python/integrations/fastapi/ , https://docs.sentry.io/platforms/python/integrations/dramatiq/ , https://docs.sentry.io/platforms/python/data-management/sensitive-data/
- testcontainers-python — https://testcontainers-python.readthedocs.io/ · respx — https://lundberg.github.io/respx/ · vcrpy — https://vcrpy.readthedocs.io/
- Fly Managed Postgres + secrets — https://fly.io/docs/mpg/ , https://fly.io/docs/apps/secrets/ · SlowAPI — https://slowapi.readthedocs.io/
