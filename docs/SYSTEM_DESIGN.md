# Production System Design

> The production-grade system design for the cross-source synthesis instrument. It sits **below**
> `BACKEND_PIPELINE.md` (which gives the consensus decisions D1–D9 and the component pipeline) and
> goes concrete: deployment topology, the data model (DDL, keys, indexes, RLS), end-to-end request
> and job flows, the async state machine, scaling math, failure modes, security, cost governance,
> and SLOs. Where it touches schema, it evolves `engine/db/schema.sql` with the consensus
> corrections (noted inline as **[Δ]**).

---

## 1. System context & topology

```
                         ┌──────────────────────────── Premium (hosted) ────────────────────────────┐
   Browser ── HTTPS ──>  Vercel (Next.js BFF)  ──>  Fly: kg_api (FastAPI, N replicas)
                          marketing+app, thin CRUD       • auth chokepoint (Clerk JWT)
                          NO LLM/embedding work           • validate, rate-limit, ENQUEUE only
                                                          │
                                          enqueue(job ref, not text)
                                                          ▼
                                              Redis  ── Dramatiq broker ──>  Fly: kg_workers (M replicas)
                                              (Upstash/AOF)   • interactive queue   • stage actors (extract→…→gate)
                                                              • bulk queue          • model_router + token governor
                                                              • DLQ→Postgres        • anyio fan-out per candidate
                                                          │                              │
                       external Fly cron ──> tick actor ──┘                              ▼
                       (scan / digest / DLQ sweep)                          Anthropic API (Haiku/Sonnet)
                                                                            Voyage embeddings (or local)
                                          ┌───────────────────────────────────────────┐
                                          ▼                                             ▼
                         Fly Managed Postgres 16 + pgvector (HNSW, pg_trgm)     S3 / Cloudflare R2
                         single system of record · RLS · per-tenant filter      raw import blobs + audit trail
                                          │
                              Sentry (scrubbed)  ·  stage_events table  ·  (OTel→Logfire deferred)

                         ┌──────────────────────────── Community (self-host) ───────────────────────┐
   Browser/localhost ─>  Next.js (local)  ──>  kg_api (1 process, KG_AUTH=none, loopback)
                                                  • enqueue to Postgres queue (SKIP LOCKED)
                                                          ▼
                                          `kg-engine worker` (2nd local process, drains PG queue)
                                                  • model_router → Ollama (local GPU)
                                                          ▼
                                          Postgres + pgvector (local)   ·   filesystem blobs
                         No Redis · No Clerk · No Voyage · No scheduler/digest · on-demand only
```

**Same code, two profiles.** Every box that differs between editions is a seam
(`KG_QUEUE`, `KG_AUTH`, `KG_PROVIDER`, `KG_EMBED_*`, `KG_BULK_LANE`, `KG_OBSERVABILITY`). The API
contract, the engine pipeline, and the data model are identical; only the *substrate behind the
seams* and the *trigger* (button vs cron) change.

**Two deployables** (Premium): `kg_api` (stateless, scale on request volume) and `kg_workers`
(scale on queue depth). The scheduler is **one external Fly cron** firing a `tick` actor — never an
in-process beat per replica (that double-fires).

---

## 2. Data model

Postgres 16 + pgvector (HNSW) + pg_trgm, one system of record. **Connections are strictly
intra-user** — `user_id` is the leading column of every composite index and a filter on every
query, backed by RLS. Embedding dimension is a **profile parameter** `$EMBED_DIM` (768 local /
1024 Voyage); 768-d and 1024-d data **cannot share an HNSW index**, so a dimension change is a
re-embed migration, not an `ALTER`.

```sql
-- ── identity & tenancy ──────────────────────────────────────────────────────
CREATE TABLE users (                       -- Community: a single fixed local row
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE NOT NULL,
  edition     text NOT NULL DEFAULT 'premium',     -- community | premium
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── notes: the stable home (notes never physically move) ─────────────────────
CREATE TABLE notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  title         text NOT NULL DEFAULT '',
  body          text NOT NULL,
  source        text NOT NULL DEFAULT 'authored',  -- authored | readwise | kindle | notion | ...
  content_hash  text NOT NULL,                      -- drives idempotent re-extraction on edit
  tags          text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
  -- [Δ] topical_vec MOVED OUT to topical_cache (D8) — was inline vector(1024) here
);
CREATE INDEX        notes_user_idx  ON notes (user_id, created_at DESC);
CREATE UNIQUE INDEX notes_dedup_idx ON notes (user_id, content_hash);   -- same content, dedup

-- ── extraction cache: content-keyed, billed ONCE per unique content ──────────
-- An overlapping import (same highlight in Kindle + Readwise) reuses this, never re-bills.
CREATE TABLE facet_cache (
  content_hash    text NOT NULL,
  extract_version text NOT NULL,            -- [Δ] per-stage version, not the global model_version
  facets          jsonb NOT NULL,           -- [{type, abstraction, salience}]
  PRIMARY KEY (content_hash, extract_version)
);

-- [Δ] topical-vector cache keyed by (content_hash, embed_version) ONLY — never model_version,
-- or a verify-prompt/threshold bump would re-embed the whole library (D8).
CREATE TABLE topical_cache (
  content_hash  text NOT NULL,
  embed_version text NOT NULL,              -- embed_model + dimension
  vec           vector(/*$EMBED_DIM*/ 1024) NOT NULL,
  PRIMARY KEY (content_hash, embed_version)
);

-- ── matchable facet index: user-scoped, abstraction-space, HNSW, type-partitioned ──
CREATE TABLE note_facets (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id),
  note_id       uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  facet_type    text NOT NULL,
  abstraction   text NOT NULL,
  salience      real NOT NULL,
  facet_vec     vector(/*$EMBED_DIM*/ 1024) NOT NULL,
  embed_version text NOT NULL
) PARTITION BY LIST (facet_type);           -- 5 partitions; ~5× smaller search + causal-to-causal only
CREATE INDEX note_facets_hnsw ON note_facets
  USING hnsw (facet_vec vector_cosine_ops) WITH (m = 32, ef_construction = 200);
CREATE INDEX note_facets_user_type_idx ON note_facets (user_id, facet_type, salience);

-- ── judged connections (the graph edges) ─────────────────────────────────────
CREATE TABLE connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id),
  a_note_id         uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  b_note_id         uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  facet_type        text NOT NULL,
  statement         text NOT NULL,
  validity          smallint NOT NULL,
  nonobviousness    smallint NOT NULL,
  generic           boolean  NOT NULL DEFAULT false,
  q                 smallint GENERATED ALWAYS AS (LEAST(validity, nonobviousness)) STORED,
  surfaced          boolean  NOT NULL,      -- sub-q3 kept hidden for tuning, never shown
  model_version     text NOT NULL,          -- folds extractor/reasoner/verifier + prompts + config_hash
  prompt_hash       text NOT NULL,
  cost_usd          numeric(10,6),          -- [Δ] per-pair cost/tokens for the cost canary (D9)
  tokens_in         int, tokens_out int,
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- [Δ] lifetime per-pair dedup keyed by model_version (folds prompt+config), not prompt_hash alone
CREATE UNIQUE INDEX connections_pair_ver_idx ON connections
  (user_id, LEAST(a_note_id,b_note_id), GREATEST(a_note_id,b_note_id), model_version);
CREATE INDEX connections_surfaced_idx ON connections (user_id, surfaced, q DESC);

-- ── [Δ] feedback spine: append-only EVENT LOG, the moat (D7) ──────────────────
-- Anchored to the STABLE pair + facet abstraction, NOT a FK to the version-bound connection row,
-- so a threshold tune (new model_version → new connection rows) never orphans a label.
CREATE TABLE feedback_events (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id),
  a_note_id       uuid NOT NULL,            -- normalized least/greatest
  b_note_id       uuid NOT NULL,
  facet_type      text NOT NULL,
  abstraction     text NOT NULL,            -- the matched facet abstraction at vote time
  axis            text NOT NULL,            -- useful | wrong(→validity) | obvious(→nonobv) | surface_match
  connection_id   uuid,                     -- SOFT, non-FK reference for debugging only
  -- immutable provenance snapshot at vote time (reproducibility):
  model_version   text NOT NULL, config_hash text NOT NULL, prompt_hash text NOT NULL,
  validity_at     smallint, nonobviousness_at smallint, q_at smallint,
  surfaced_at     boolean, generic_at boolean,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_pair_idx ON feedback_events (user_id, a_note_id, b_note_id, facet_type);

-- ── Organize tab: clusters are computed VIEWS, multi-membership, never move notes ─
CREATE TABLE note_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  notebook text NOT NULL DEFAULT 'default',
  label text NOT NULL, is_manual boolean NOT NULL DEFAULT false,
  embed_version text NOT NULL                -- [Δ] versioned by embedder, recomputed by worker
);
CREATE TABLE note_cluster_members (
  cluster_id uuid REFERENCES note_clusters(id) ON DELETE CASCADE,
  note_id    uuid REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_id, note_id)
);

-- ── async jobs: doubles as the Community PG queue (SKIP LOCKED) ────────────────
CREATE TABLE jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  type            text NOT NULL,            -- ingest | connect_note | scan | import_chunk | digest | cluster
  status          text NOT NULL DEFAULT 'queued',  -- queued|running|done|error|dead
  idempotency_key text NOT NULL,            -- (type, content_hash|note_id, model_version) — collapses double-click
  payload         jsonb NOT NULL,           -- IDs/refs only, never note text
  attempts        smallint NOT NULL DEFAULT 0,
  surfaced_count  int,
  run_after       timestamptz NOT NULL DEFAULT now(),
  locked_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX jobs_idem_idx ON jobs (idempotency_key);
CREATE INDEX jobs_queue_idx ON jobs (status, run_after) WHERE status = 'queued';

-- ── observability + eval spine (D9) ───────────────────────────────────────────
CREATE TABLE pipeline_runs ( id uuid PRIMARY KEY, job_id uuid, user_id uuid NOT NULL,
  started_at timestamptz, finished_at timestamptz, status text, model_version text );
CREATE TABLE stage_events ( id bigserial PRIMARY KEY, run_id uuid, stage text,
  status text,                              -- started | ok | error | retry
  attempt smallint, latency_ms int, model_version text, created_at timestamptz DEFAULT now() );
CREATE TABLE prompt_versions ( version text PRIMARY KEY, stage text, body text, created_at timestamptz );
CREATE TABLE eval_runs ( id bigserial PRIMARY KEY, model_version text, config_hash text,
  precision real, recall real, garbage_rate real, ann_recall_at20 real, created_at timestamptz );

-- ── imports / bulk lane (D5) ──────────────────────────────────────────────────
CREATE TABLE imports ( id uuid PRIMARY KEY, user_id uuid NOT NULL, source text, total int,
  processed int DEFAULT 0, spend_usd numeric(10,6) DEFAULT 0, lane text DEFAULT 'sync',  -- sync|batch
  batch_id text, status text DEFAULT 'running', created_at timestamptz DEFAULT now() );
```

**RLS — Premium fail-closed insurance (after the chokepoint + leak test, D6):**
```sql
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;          -- + every user-scoped table
CREATE POLICY tenant_isolation ON notes
  USING (user_id = current_setting('app.current_user_id')::uuid);
-- The GUC is set with `SET LOCAL app.current_user_id = $1` INSIDE the query transaction ONLY,
-- so it cannot survive a pooled-connection checkout. Prepared statements OFF under txn-mode pooling.
```

---

## 3. End-to-end flows

The HTTP boundary is the dotted line: **everything above it is sync and cheap; everything below is
async and off the request path.** No LLM/embedding call ever crosses upward.

### 3.1 Authored note (and the editor edit case)
1. `POST /notes` → API resolves `user_id` (chokepoint) → persist note row, compute `content_hash`.
2. Enqueue `ingest(note_id)` with `idempotency_key=(ingest, content_hash, model_version)`. Return `201` + `job_id`. **(boundary)**
3. Worker `ingest`: facet cache hit on `content_hash`? reuse : extract (Haiku/Ollama) → cache. Topical cache hit on `(content_hash, embed_version)`? reuse : embed → cache. Upsert `note_facets` (HNSW). Emit `stage_events`.
4. **Edit** = new `content_hash` → cache miss → re-extract + re-embed + neighborhood-scoped re-match; old-hash facets/connections tombstoned. **Debounced on save-settle**, not per keystroke.

### 3.2 "Find connections" (the explicit trigger)
1. `POST /notes/{id}/find-connections` → enqueue `connect_note(note_id)`. Return `job_id, status=queued`. **(boundary)**
2. Worker: candidates = HNSW top-K within each facet_type, same user → prune (salience floor → hub quarantine → topical reject). For each survivor not in the lifetime dedup table:
3. Reason (Sonnet) → statement + rationale. If `NO_CONNECTION`, mark pair seen, stop.
4. Verify (separate Sonnet, **statement + 2 notes only, never the rationale**) → validity, nonobviousness, generic.
5. q-gate: `q≥3 and not generic` → `INSERT … ON CONFLICT DO NOTHING` into `connections` (surfaced=true). Record cost/tokens. Mark pair seen.
6. Frontend polls `GET /jobs/{id}` → `done` + `surfaced_count`; reads `GET /connections?note_id=`.

### 3.3 "Scan library" (incremental)
Enqueue `scan` → fan out `connect_note` for every note changed since `last_scan_at` (not the whole corpus). Bounded by per-user spend ceiling + adaptive-K.

### 3.4 Bulk import
1. `POST /imports` (file refs / OAuth) → blobs to S3/R2 → `normalize` → dedup by `content_hash`.
2. **Fast-lane:** the few hundred newest/highest-salience notes go through the **interactive** queue at verifier-high / teaser-q≥4 → first verified insight surfaces in ~2–3 min (the activation metric).
3. **Bulk:** the rest ride the dedicated low-concurrency **bulk** queue (`KG_BULK_LANE=sync`), so imports never starve interactive "Find connections". Spend ceiling throttles over **time**; **coverage-not-K invariant** — must reach full corpus eventually, never silently drop-K.
4. *(Premium, deferred)* `KG_BULK_LANE=batch`: submit Anthropic Message Batches → persist `batch_id` → cron poller reaps → enqueue downstream. Never for the BYO-key privacy tier.

### 3.5 Premium background scan + weekly digest
External Fly cron → `tick` actor: per active user, enqueue an incremental `scan`; weekly, aggregate the week's surfaced connections → digest email. **This burst fan-out across ~1000 users is exactly why Premium uses Redis+Dramatiq, not the PG queue** (priority, abort, rate-limit, no contention with pgvector).

### 3.6 Feedback (the flywheel)
`POST /connections/{id}/feedback {axis, reason}` → append a `feedback_events` row with the immutable provenance snapshot. Optimistic UI. Read-back (day 1) = the per-cohort/per-facet **downvote-rate precision-decay alarm** via a materialized view; per-cohort threshold tuning later; re-ranker is v2.

---

## 4. Async substrate & job state machine

```
queued ──(worker claims: SKIP LOCKED / Dramatiq dequeue)──> running
running ──ok──> done            running ──transient error──> queued (retry, bounded, backoff)
running ──permanent error (schema-invalid / oversized)──> dead (DLQ→Postgres, no hot-loop)
running ──abort (user cancels scan)──> done(cancelled)      [dramatiq-abort]
```

- **Idempotency** is data-layer, not broker: every actor **re-checks the cache/dedup before any
  paid call** and no-ops on a hit. `idempotency_key` (and the deterministic Dramatiq `message_id`)
  collapse a double-click into one job. This is what makes at-least-once delivery safe.
- **Three retry layers, non-overlapping** (or they compound into dozens of paid calls):
  HTTP-transient (stamina/SDK, honor `Retry-After`) · message-level (Dramatiq `Retries`, bounded) ·
  permanent → **non-retryable → DLQ** immediately. Per-actor `TimeLimit` unpins a hung Ollama call.
- **Two queues** (Premium): `interactive` (find-connections, fast-lane) and `bulk` (imports,
  scans) — bulk is concurrency-capped so it can never starve interactive.
- **Community** uses the `jobs` table as the queue: `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` in the
  `kg-engine worker` loop. Same state machine, same idempotency, zero new infra.

---

## 5. Scaling — the N² problem is never materialized

| Lever | Mechanism |
|---|---|
| Per-tenant isolation | Connections are intra-user → no global N, only `N_user` small problems (hundreds–low-thousands). Shard/filter by `user_id`. |
| ANN top-K, not all-pairs | HNSW top-K≈20 per facet → cost ~N·K·log N, not N². |
| Type partitioning | 5 `facet_type` partitions → ~5× smaller search, higher precision (causal-to-causal only). |
| Generic-skeleton suppression | IDF + centroid penalty + hub quarantine **before any LLM call** — the documented precision-decay defense; `false-match-rate vs corpus-size` is the canary metric. |
| Incremental recompute | A new/edited note matches only against the existing index; existing pairs never re-scanned. Lifetime per-pair dedup → judged at most once ever. |
| Bounded surfacing + adaptive-K | Cap ~5 surfaced/note; per-import/per-user spend ceilings degrade K gracefully on dense corpora. |
| One real seam | `VectorIndex` promotes to Qdrant only at a documented trigger (single corpus >~1–5M vectors, or p99 ANN budget breach after tuning). |

**HNSW tuning (recall-biased — the moat):** `m=32`, `ef_construction=200`, `ef_search`≫K via `SET
LOCAL` (start 100–200), **`hnsw.iterative_scan=relaxed_order`** so filter+ANN don't under-return.
`vector_cosine_ops` + `<=>` (matches the numpy baseline; `<->` would skip the index and break
parity). **Add ANN-recall@20-vs-brute-force to the eval harness.**

**Where the time/cost actually goes:** LLM latency dominates everything — driver QPS and pool size
are irrelevant by comparison. So pools are small (5–10/process), sized to LLM-bounded concurrency,
not to Fly Postgres' low `max_connections`. Fan out the embarrassingly-parallel reason/verify with
`anyio` + a `CapacityLimiter` (1–2 for a single Ollama GPU, higher for Anthropic).

---

## 6. Reliability & failure modes

| Failure | Mitigation |
|---|---|
| At-least-once redelivery double-bills/double-surfaces | Data-layer `ON CONFLICT` dedup + deterministic message_id + re-check cache before any paid call. |
| HNSW post-filter under-return silently degrades recall | `iterative_scan=relaxed_order`, `ef_search`≫K; measure recall@20 in eval. |
| Anthropic 3 simultaneous limits (RPM/ITPM/OTPM) → 429 storm on scale-out | Shared Redis token bucket per `(provider,model)`; honor `anthropic-ratelimit-*`/`Retry-After`, don't blind-backoff. |
| Bulk import floods broker / starves interactive / OOMs Redis | Dedicated low-concurrency bulk queue; pre-enqueue spend gate; payloads as IDs not text. |
| Hung Ollama call pins a worker | Per-actor `TimeLimit`. |
| DLQ in Redis vanishes on flush | DLQ→Postgres middleware + depth alarm. |
| In-process scheduler double-fires across replicas | One external Fly cron → `tick` actor. |
| Self-run `fly pg` not managed; default Redis ephemeral | Fly **Managed** Postgres; persistent Redis (Upstash/AOF) or Dramatiq durability is void. |
| Edited note leaves stale connections | New `content_hash` → tombstone old-hash facets/connections; neighborhood-scoped recompute. |

**Crash safety:** because idempotency + dedup are in Postgres (not the in-memory `seen_pair` set the
v0 uses), a worker crash mid-job is safe — redelivery re-checks the cache and no-ops on completed
stages.

---

## 7. Security & multi-tenancy

- **Auth chokepoint:** one `get_current_user` dependency is the *sole* source of `user_id`
  (`KG_AUTH=none|local|clerk`). `none` binds loopback-only; `local` adds a generated bearer token;
  `clerk` verifies JWT (PyJWT[crypto]: exp/aud/iss/JWKS).
- **Defense in depth:** `user_id` on every table + leading index column + every-query filter
  **and** RLS fail-closed (Premium). The **mandatory cross-tenant leak test** (testcontainers, ≥2
  tenants) is a CI merge gate — fake-provider tests can never catch a tenancy leak.
- **The RLS footgun is explicit:** the GUC is set with `SET LOCAL … ` *inside the query
  transaction only*; prepared statements off under transaction-mode pooling. If that invariant
  can't be guaranteed, **fall back to chokepoint + leak test only** — leaky-pooled RLS is worse than
  none.
- **PII / privacy (the trust positioning):** decide redaction *before* telemetry goes live —
  Sentry `before_send` scrubs note bodies, span-attribute allowlists, no full-prompt logging, vcr
  `filter_headers`/`before_record`. **Community keeps data 100% local.** Premium offers a
  **BYO-key strict-privacy tier** (local embedder so facets never egress; never wired to Batches).
- **Secrets:** Fly secrets / env; `SecretStr` for the API key; never logged.

---

## 8. Cost governance

Tactics (target: ~$1.30–1.90/user/mo at 1000 users, >85% margin):
1. Extraction cached once per `content_hash` (never re-bill overlapping imports).
2. Prompt-caching on the frozen extraction + verifier **system** blocks (~0.1× reads) — stable
   rubric first with the `cache_control` breakpoint, volatile note text in the user turn (prefix is
   byte-exact; min cacheable prefix 4096 tok Haiku/Opus, 2048 Sonnet).
3. Tiered routing: Haiku extract · Sonnet both reasoning passes · **Opus eval-judge only, never
   per-pair**.
4. ANN + structural pre-filter winnow before any LLM token; embed short abstractions, not notes.
5. Per-pair lifetime dedup + adaptive-K + hard per-import/per-user **spend ceilings** (checked
   pre-enqueue).
6. Token-bucket rate governor prevents the 429-storm tax.
7. *(Deferred)* Batches API 50% off for non-latency-sensitive bulk.

Every surfaced connection stores `cost_usd`/tokens → `cost-per-surfaced-connection` and
`Opus-calls-per-note` are tracked as co-equal metrics so neither quality nor cost silently regresses.

---

## 9. Observability, SLOs & the deploy gate

**Golden signals** (day-1, all SQL over rows we already write + `stage_events`):
- Pipeline: per-stage latency/error/retry, queue depth, DLQ depth.
- Quality canaries: `false-match-rate vs corpus-size` (the precision-decay alarm), per-facet-type
  downvote rate, `cost-per-surfaced-connection`.
- `KG_OBSERVABILITY=postgres` (Sentry on api+workers, scrubbed) day 1; `otel` (→Logfire) deferred
  until multi-worker scale or a Premium SLA demands cross-process p99.

**Target SLOs (Premium):** API write p99 < 300 ms (enqueue only) · first-insight (import fast-lane)
< 3 min · find-connections job p95 < 30 s for a single note · surfaced-connection precision ≥ 75%
(eval gate) · zero cross-tenant leaks (hard).

**The eval harness is a deploy gate, not optional tooling.** Any prompt/model/threshold/K/**model-id**
change runs the golden set in CI and **blocks merge** on `recall < floor` OR `garbage > ceiling` OR
`precision < 75%`, against the fake provider (wiring) **and** a real local model (quality). Each
`eval_run` stores `model_version` + `config_hash`. **Shadow mode:** a new engine version scores the
live candidate stream without surfacing, diffed against the incumbent before promotion.

---

## 10. Deployment, environments & migrations

- **Premium:** Vercel (Next.js) + two Fly apps (`kg_api`, `kg_workers`) sharing Redis + Fly Managed
  Postgres; S3/R2 for blobs; external Fly cron for `tick`. 12-factor so an ECS/Fargate+RDS lift is
  mechanical later.
- **Community:** one `pip install` / `git pull`; `kg-engine api` + `kg-engine worker` against a
  local Postgres (or sqlite for dev). No Redis/Clerk/Voyage/cron.
- **Deps & build:** `uv` + committed `uv.lock` (byte-reproducible across Fly + laptop);
  `mypy --strict`; `ruff`. CI gates: ruff · mypy · pytest(fake) · **eval gate** · testcontainers
  (HNSW recall, partition prune, **RLS leak**, `ON CONFLICT`).
- **Migrations:** Alembic; HNSW / partition / `CREATE INDEX CONCURRENTLY` hand-written and
  **non-transactional** (autocommit, raise `maintenance_work_mem`, build HNSW after bulk load).
- **The current `api_*` tables collapse into the schema above** — the production migration adds
  `user_id` + the auth chokepoint, moves topical vectors to the cache, replaces `connection_feedback`
  with `feedback_events`, and adds `jobs`/`stage_events`/`imports`. (See `BACKEND_PIPELINE.md` §3 for
  the P0→P2 sequencing.)

---

## 11. Cross-cutting system properties

These were under-specified in §1–§10 and are called out explicitly here (the "have we considered
the fundamentals" gaps).

### 11.1 Availability, SPOF & failover
At ~1000 users this is a **single-region, single-leader** system — we optimize for correctness and
cost, not five-nines. Stated targets and the SPOFs we accept vs. mitigate:
- **Postgres is the primary SPOF.** Fly Managed Postgres with a **hot standby + automated failover**
  (or Neon/Crunchy HA); **PITR / daily base backups** (RPO ≤ 5 min via WAL, RTO ≤ a few min on
  failover). A **read replica** is added when read endpoints contend with the pipeline (see §11.6),
  not before. Self-host Community accepts a single Postgres — it's one user's laptop.
- **Redis is a SPOF for Premium throughput, not for data.** Because idempotency/dedup live in
  Postgres, a Redis loss stalls jobs but **never loses or double-bills** work — on restart, the
  outbox relay (§11.3) re-publishes un-acked jobs. Use persistent Redis (Upstash/AOF). Community has
  no Redis.
- **Stateless `kg_api`/`kg_workers`** → N replicas, rolling deploy, Fly health checks; losing a
  replica drops in-flight requests (client retries) and re-queues in-flight jobs (at-least-once).
- **External deps** (Anthropic/Voyage) are SPOFs for *fresh* results only: degrade gracefully —
  reads of already-surfaced connections never touch a provider; a provider outage fails the job into
  retry/DLQ, not the read path.
- **Availability SLO (Premium):** 99.5% on read/enqueue paths (pipeline freshness is best-effort,
  not on the SLO — it is async by design).

### 11.2 CAP & consistency model
- **CAP:** single-leader Postgres = a **CP** system. We do not need partition tolerance across data
  stores at this scale; on a partition we lose availability (fail the write/job), never consistency.
- **Consistency model — this matters for correctness reasoning:**
  - **Strong / read-after-write** for note CRUD (same Postgres, same transaction).
  - **Eventual consistency on the surface path:** `POST /notes` returns *before* connections exist;
    the engine runs async, so "note created" and "its connections surfaced" are **separated in
    time**. The UI reflects this with `job_id` + polling, and an honest empty rail until the job
    completes. This is a deliberate product property (explicit trigger, restraint-as-trust), not a
    bug.
  - **Monotonic reads** within a user session via the job state (`queued→running→done`); the client
    never sees connections "disappear".
- **Consistent hashing: not used, deliberately.** Tenancy shards by `user_id` (a natural key), and
  one Postgres holds everything. Consistent hashing only enters if/when the `VectorIndex` promotes to
  a **Qdrant cluster** or Postgres is horizontally sharded across nodes (§11.6) — documented triggers,
  not now.

### 11.3 Transactional outbox (the dual-write fix)
`POST /notes` must **persist the note and enqueue a job atomically**. Writing to Postgres *and*
Redis directly is a dual write that diverges on a crash between them. Resolution:
- The enqueue is an **`INSERT` into the `jobs` table in the *same transaction* as the note write.**
- **Community:** that *is* the queue (`SKIP LOCKED` drains `jobs`) — naturally transactional, done.
- **Premium:** a **relay** (a `tick`-driven or `LISTEN/NOTIFY`-driven drain) reads committed `jobs`
  rows and publishes them to Redis/Dramatiq, marking them `dispatched`. At-least-once to Redis is
  fine because the data-layer dedup makes redelivery a no-op. This is the Brandur "job drain" pattern
  the `BACKEND_GUIDE` referenced — now explicit.

### 11.4 Real-time progress (the import/onboarding bar)
The product promises a *live* progress bar ("notes imported → facets extracted → connections found",
first insight in ~2–3 min), which polling alone serves coarsely. Design:
- **Default: client polls `GET /jobs/{id}` / `GET /imports/{id}`** (cheap, works everywhere, no
  stateful connection). Adequate for find-connections.
- **Onboarding upgrade: Server-Sent Events** (`GET /imports/{id}/stream`) — one-way, proxy-friendly,
  far simpler than WebSockets, and we only need server→client. The worker writes progress to the
  `imports` row; the API streams row deltas. WebSockets are **not** justified (no bidirectional
  need). Community can stay on polling.

### 11.5 Caching tiers
Three distinct layers, only two of which exist today:
- **Model-output caches (built):** `facet_cache` (content-keyed), `topical_cache`
  (embed-version-keyed), Anthropic prompt-cache on frozen system blocks. These are the expensive
  ones and the real savings.
- **Read cache (add when needed):** read endpoints hit Postgres directly today — fine for
  hundreds–low-thousands of rows/user. Add a short-TTL cache (Redis or HTTP `Cache-Control` +
  Vercel edge) for `GET /connections`/`/clusters` **only if** read QPS becomes a measured cost;
  invalidate on the job that writes new connections/clusters (event-driven, not TTL-guessing).
- **CDN (free):** static Next.js assets via Vercel. No app-data caching at the CDN (private,
  per-tenant).

### 11.6 Database-scaling roadmap (in trigger order)
1. **Now:** one Managed Postgres; `facet_type` LIST partitioning; HNSW recall tuning; small pools.
2. **Read contention** (read endpoints steal IOPS from the pipeline): add a **read replica**, route
   `GET` reads to it (accept replica lag — consistent with §11.2's eventual model).
3. **Connection pressure** (process count grows): **PgBouncer transaction-mode** in front (with the
   `SET LOCAL` GUC + prepared-statements-off discipline from §7).
4. **Vector scale** (a single power-user corpus >~1–5M vectors, or p99 ANN breach after tuning):
   promote the `VectorIndex` seam to **Qdrant** (this is the documented one real seam) — *only the
   vectors move*; Postgres stays the SOR.
5. **Tenant scale** (one Postgres can't hold all tenants): **shard by `user_id`** across instances
   (here consistent hashing finally applies). Far beyond the 1000-user target.

### 11.7 Networking
Vercel (edge/CDN, TLS termination) → Fly `kg_api` over HTTPS; `kg_api`↔`kg_workers`↔Postgres↔Redis
over Fly's **private 6PN network** (never public); egress to Anthropic/Voyage over TLS with the
token governor as the choke. Clerk JWT validates at the edge (JWKS cached). No service mesh — two
deployables don't need one.

### 11.8 Architectural patterns & the deliberate "no microservices"
- **Ports & adapters (hexagonal):** every edition difference is a *port* (`Store`, `VectorIndex`,
  `enqueue`, `Provider`, auth) with swappable *adapters* — this is what makes one codebase serve both
  editions and what keeps the engine independently testable with the fake provider.
- **Read/write separation (CQRS-lite):** writes enqueue; reads serve persisted projections
  (connections, clusters) — never recomputed. Not full CQRS (one store), but the read model is
  materialized by workers.
- **Event sourcing for the moat:** `feedback_events` is an append-only log; aggregates (precision
  canary, threshold calibration) are derived views — so no signal is lost to an in-place update.
- **Modular monolith + workers, NOT microservices** — *deliberate*. Two deployables (api, workers)
  share one codebase and one database. Microservice decomposition would add network hops, distributed
  transactions, and ops surface to a 2–3-person team for no scaling benefit at this size. The single
  promotion seam (`VectorIndex`→Qdrant) is the only place we'd extract a service, and only at the
  documented trigger.

---

## 12. Open risks (carried, not solved by this design)

- **Gate 2** (does genuine insight *recur* weekly on a real un-curated corpus at scale?) — the
  make-or-break product risk; needs real user data. The messy-corpus floor experiment still gates
  the embedder bake-off.
- **Generic-skeleton precision decay at 50k+ notes/user** is mitigated, not proven; the live
  downvote-rate canary is the only true alarm and it lags.
- **Feedback-flywheel fracture across embedding dimensions** (768 vs 1024) — a provenance-aware
  re-embed/reattribution migration must exist before multi-dimension data accumulates.
- **Premium digest fan-out cost/latency at ~1000 users is modeled, not measured** — if PG-queue is
  ever used hosted, promote the deferred OTel export ahead of a debugging fire.
- **Day-1 feedback UI** must force the wrong/obvious/surface reason or the two-axis moat signal is
  born one-axis — schema is necessary, not sufficient.
