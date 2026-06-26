# Backend Pipeline — How Each Component Works

> **Status: authoritative.** This document supersedes the specific contested calls in
> `BACKEND_GUIDE.md` (§1 table, §2 changes) and `ARCHITECTURE.md` §2 (embeddings) where they
> conflict. It is the output of a 5-perspective architecture debate (open-core / cost-scale /
> privacy-security / moat-data / pragmatic), each position adversarially stress-tested per decision,
> then synthesized to consensus. Read `BACKEND_GUIDE.md` for package choices and `ARCHITECTURE.md`
> for the product spec; read **this** for what the backend actually is and how each piece behaves.

---

## 0. The one principle everything follows

**One codebase, two edition profiles, selected by env seams — never two backends.** The codebase
already uses this pattern (`make_backend()` for store, `make_notes_repo()` for the API repo). We
extend it to the **queue**, **auth**, **provider**, and **observability** so the *same* engine API
runs Community (self-host, laptop, BYO Ollama, on-demand, private) and Premium (hosted, managed
Claude, background scan + weekly digest) with nothing but configuration between them.

| Seam | Env | Community default | Premium default |
|---|---|---|---|
| Provider | `KG_PROVIDER` | `ollama` | `anthropic` |
| Store/index | `KG_STORE_BACKEND` | `postgres` (or sqlite dev) | `postgres` (managed, RLS) |
| Queue | `KG_QUEUE` | `pg` (SKIP LOCKED worker) | `redis` (Dramatiq) |
| Auth | `KG_AUTH` | `none` (loopback) / `local` (token) | `clerk` (JWT) |
| Embedder | `KG_EMBED_MODEL` | bake-off winner (768-d local opt-in) | bake-off winner (shared default) |
| Bulk lane | `KG_BULK_LANE` | `sync` | `sync` → `batch` before GA |
| Observability | `KG_OBSERVABILITY` | `postgres` (+ optional Sentry) | `postgres` → `otel` at scale |

**Two hard invariants hold in *both* profiles, on *every* path:**
1. **No LLM or embedding call on any HTTP request path — write OR read.** Every trigger enqueues;
   every read serves persisted rows. (The current code violates this at `main.py` — fix P0-1/P0-3.)
2. **Idempotency lives in the data layer**, not the broker: `UNIQUE(content_hash, model_version)` +
   `INSERT … ON CONFLICT DO NOTHING`, and a per-pair lifetime dedup `UNIQUE(user_id,
   least(a,b), greatest(a,b), model_version)`. So the no-double-bill guarantee is broker-independent
   and identical whether the queue is Postgres or Redis.

---

## 1. Consensus decisions (D1–D9)

| # | Decision | The call | Why (one line) |
|---|---|---|---|
| **D1** | Async substrate | Config seam `KG_QUEUE`. Community = **Postgres SKIP LOCKED worker** (not inline); Premium = **Redis+Dramatiq**. Both real day 1. | PG-queue adds zero infra for a button-driven self-host; Premium's digest/scan fan-out across ~1000 users needs Dramatiq's backpressure/priority/abort/rate-limit and must not contend with pgvector on the same PG. |
| **D2** | Open-core deploy | One codebase, two env profiles via the seams; **idempotency in the data layer in both**; no profile runs the engine on the HTTP path. | The moat collapses if Community needs Clerk/Redis/Voyage to boot; data-layer dedup removes the inline-vs-durable behavioral fork. |
| **D3** | Auth | Seam `KG_AUTH=none\|local\|clerk` behind **one `get_current_user`** that is the sole source of `user_id`. `none`=loopback-only, `local`=bearer token, `clerk`=PyJWT JWKS. | Clerk can't run offline; a constant user on a reachable port inverts the privacy promise. The real work is the `user_id` chokepoint+column (absent today). |
| **D4** | Embeddings | **Reject the hard Voyage commit.** Embedder is a versioned, eval-gated seam; run recall@20-vs-brute-force bake-off; pick **one shared default** for the mainline cohort; 768-d local is a scoped opt-in. | "False economy" is an uncited prior; Gate-1 measured no recall. But a *different* default per edition fractures the feedback flywheel into incomparable `config_hash`es. |
| **D5** | Bulk import | **Defer the full Batches state machine.** Ship rate-governed sync fast-lane + spend ceiling + adaptive-K now, behind `KG_BULK_LANE=sync\|batch` with a pre-committed Premium-GA trigger. | Batches is ~50% off a one-time ~$5–15/user import — wrong day-0 spend for a 2–3 person team. The seam + coverage-not-K invariant neutralizes the retrofit risk. |
| **D6** | Multi-tenancy | **Re-sequence:** (1) add `user_id` + chokepoint, (2) land a mandatory cross-tenant **leak test** as a merge gate, (3) per-request pool, *then* (4) RLS as Premium-only fail-closed insurance with an airtight `SET LOCAL`-in-txn invariant. | Live tables have no `user_id` and the repo is one shared autocommit connection — RLS today is vacuous and is the *only* pooled-GUC leak surface, so it must follow the primary control. |
| **D7** | Feedback spine | Day-1 **append-only event log** keyed to the **stable note-pair + facet abstraction** (NOT a FK to the version-bound connection row), with full provenance snapshotted immutably at vote time; two axes as independent typed events + a `surface_match` value. | The moat is un-backfillable feedback; FK-ing to `connection_id` orphans every label on the first threshold tune (the day-1 read-back use). |
| **D8** | Topical cache | **Persist topical vectors keyed by `(content_hash, embed_model+dimension)` only** — never `model_version`. Remove `_pg_engine()` from all read paths; serve clusters from worker-written rows. | `pipeline.py:86` re-embeds every note every ingest, and `GET /clusters` re-embeds the whole corpus on a read path. Keying by `model_version` would re-embed the library on any unrelated prompt/threshold bump. |
| **D9** | Observability | Right-size **down** behind `KG_OBSERVABILITY=postgres\|otel`: day 1 = per-stage cost/scores on connection rows + a Postgres `pipeline_runs`/`stage_events` table + Sentry with `before_send` scrubbing. **Defer** OTel+OpenLLMetry+Logfire. | Gating metrics are SQL over rows we already write; every extra telemetry vendor is a private-note-text egress surface fatal to the privacy positioning. |

---

## 2. The pipeline, component by component

Request/data-flow order. Each component lists its responsibility, how it differs Community vs
Premium, and what data it consumes/produces.

### ① API edge — auth + tenancy chokepoint (`kg_api`, FastAPI)
- **Responsibility:** terminate HTTP, resolve `user_id` via the single `get_current_user` dependency
  (the *sole* tenancy source), validate request schemas, enforce size caps + SlowAPI rate limits.
  **Does no LLM/embedding work.**
- **Community:** `KG_AUTH=none` (loopback-only, fixed local `user_id`) or `local` (generated bearer
  token). Single process, binds localhost.
- **Premium:** `KG_AUTH=clerk` — verify JWT (PyJWT[crypto]: exp/aud/iss/JWKS), seat/org claims for
  per-seat pricing. Vercel → Fly cross-origin split.
- **Data:** in = HTTP request + auth token; out = `user_id` flowed downstream, request handed to the
  write/enqueue path.

### ② Note write path (`POST /notes`) + ingestion normalize
- **Responsibility:** persist the authored/imported note (user-scoped), compute `content_hash`, then
  **enqueue** an ingest+connect job. An authored note enters the *same* `normalize → enqueue →
  engine` path as an import — the engine never forks. **No inline engine call.**
- **Community:** persist to Postgres (`user_id NOT NULL`); `enqueue()` pushes to the PG SKIP LOCKED
  queue; HTTP returns `job_id` immediately.
- **Premium:** persist to managed Postgres (RLS-scoped); `enqueue()` pushes to Redis+Dramatiq with a
  deterministic `message_id` from `(job_type, content_hash, model_version)` (double-click collapses).
- **Data:** in = note body + tags + `user_id`; out = persisted note row + enqueued job; HTTP returns
  `queued` (never runs an LLM).

### ③ Async substrate (`KG_QUEUE` enqueue() seam, `kg_workers`)
- **Responsibility:** durable, idempotent, off-write-path delivery of pipeline jobs; backpressure,
  priority (interactive vs bulk), abort, rate-limit, DLQ. Idempotency enforced in the **data layer**,
  not the broker.
- **Community:** Postgres-as-queue via `SELECT … FOR UPDATE SKIP LOCKED`, drained by a `kg-engine
  worker` process the self-hoster runs against their existing Postgres — **zero new infra**.
- **Premium:** Redis+Dramatiq — Retries/TimeLimit/Shutdown middleware, dedicated **bulk vs
  interactive** queues, `dramatiq-abort` for runaway scans, DLQ→Postgres + depth alarm.
- **Data:** in = job refs (**IDs, not note text** — privacy + Redis OOM); out = jobs delivered
  at-least-once to stage actors; data-layer dedup collapses duplicates.

### ④ Stage 1 — Extract facets (`extract.py`)
- **Responsibility:** extract the 5 typed structural facets per note. **Cached forever by
  `(content_hash, model_version)`** — never re-extract or double-bill overlapping imports (same
  highlight in Kindle + Readwise).
- **Community:** `KG_PROVIDER=ollama` (qwen2.5:7b) via `model_router`; runs on the user's GPU, capped
  concurrency 1–2.
- **Premium:** `claude-haiku-4-5` via `model_router` with the shared Redis token-bucket rate governor
  + provider-native structured output (`extra='forbid'`).
- **Data:** in = note text + `content_hash`; out = facets `(type, abstraction, salience)` → facet
  cache keyed by `(content_hash, model_version)`.

### ⑤ Stage 2 — Embed: abstraction + topical (in `pipeline.py`)
- **Responsibility:** embed each facet's **abstraction** (the moat — lands topically-distant notes
  near each other) and, separately, the note's **topical** vector (used *inversely* to reject
  same-topic pairs). Both cached; **topical keyed by `(content_hash, embed_model+dimension)` only.**
- **Community:** local embedder (nomic/bge-m3, 768-d) — required for the v2 privacy tier (facets must
  not egress). Scoped opt-in offline default.
- **Premium:** hosted embedder (Voyage 1024-d) **if it wins the eval bake-off**; the same embedder is
  the shared default for the mainline cohort to keep one coherent flywheel.
- **Data:** in = facet abstractions + note text; out = `facet_vec` + `topical_vec` persisted
  (dimension is an explicit schema/index dimension); **never re-embedded on a read path**.

### ⑥ Stage 3 — Index + retrieve candidates (`index.py` / `retrieve.py`, **no LLM**)
- **Responsibility:** ANN over abstraction vectors, then the pruning that defines precision: drop
  self-matches → salience floor → **generic-skeleton / hub quarantine (before any LLM call)** →
  **topical rejection** (reject pairs whose topical vectors are too close). Cost control + horoscope
  defense.
- **Community:** in-memory numpy `VectorIndex` for small corpora, or pgvector HNSW; single-tenant so
  no RLS filter needed.
- **Premium:** pgvector HNSW (`m=24–32`, `ef_construction=128–200`, `iterative_scan=relaxed_order`,
  `ef_search ≫ K` via `SET LOCAL`), `user_id`+`facet_type`+`salience` filters, `vector_cosine_ops` +
  `<=>`.
- **Data:** in = facet vectors + topical vectors + gate config; out = ranked candidate pairs (top few
  per note) for judging.

### ⑦ Stage 4 — Reason (`reason.py`)
- **Responsibility:** given a candidate pair + both notes' text, decide if a genuine non-obvious
  connection exists and produce a **statement** + rationale. Per-candidate, fan-out in parallel.
- **Community:** Ollama (llama3.1:8b); `CapacityLimiter` 1–2 for a single GPU.
- **Premium:** `claude-sonnet-4-6` (optionally Opus for **reason only** — never verifier, never
  per-pair eval); token-bucket governed.
- **Data:** in = candidate + note A + note B; out = `{connection: bool, statement, rationale}`. **The
  rationale is consumed by nothing downstream and is never persisted.**

### ⑧ Stage 5 — Verify (`verify.py`, decorrelated)
- **Responsibility:** independently score **validity** + **non-obviousness** of the *statement only*.
  This decorrelation is load-bearing for precision.
- **Community:** Ollama (qwen2.5:14b), separate call from reason.
- **Premium:** `claude-sonnet-4-6`, separate call. **Two calls, never merged for cost.**
- **Data:** in = **only the two notes + the statement (NEVER the reasoner's rationale)**; out =
  `{validity, nonobviousness, generic}`.

### ⑨ Stage 6 — q-gate + persist connection (`pipeline.py`)
- **Responsibility:** surface only `q = min(validity, nonobviousness) ≥ 3 and not generic`; cap
  `max_surfaced_per_note`. Persist surfaced connections with **full provenance**
  (extractor/reasoner/verifier `model_version` + `prompt_hash` + scores + per-stage cost/tokens).
- **Community:** persist to Postgres (user-scoped); on-demand trigger only.
- **Premium:** persist to managed Postgres (RLS); also feeds the weekly digest. Provenance enables
  reproducible eval slicing.
- **Data:** in = scores + generic flag + provenance; out = surfaced `Connection` rows
  (`UNIQUE(user_id, pair, model_version) ON CONFLICT`). **Sub-q3 yields an empty result — that is
  correct, never a forced connection.**

### ⑩ Read paths (`GET /notes`, `/connections`, `/clusters`, `/jobs`)
- **Responsibility:** serve persisted notes/connections/clusters with **no LLM/embedding call and no
  engine construction**. Clusters read worker-written rows (k-means / HDBSCAN over persisted topical
  vectors + a cheap Haiku label) — **not recomputed per request**.
- **Community:** read user-scoped rows from Postgres; single tenant.
- **Premium:** read RLS-scoped rows; cluster labels precomputed by a worker and read back.
- **Data:** in = `user_id` + filters (+ pagination); out = persisted rows only. **Integration test
  asserts zero embed calls on `/clusters`.**

> **Graph & Organize tab are read-side projections of data the engine already produced:** the local
> neighborhood graph reads the `connections` edges directly (edge KIND = `facet_type` → colour);
> the Organize sections read worker-written cluster rows over the topical vectors. Same topical
> vector, opposite direction — **low** topical similarity makes a good *connection*, **high** makes
> a good *cluster*. Neither costs a model call at read time.

### ⑪ Feedback spine (capture + read-back) — *the moat*
- **Responsibility:** capture per-user two-axis dismiss/useful feedback as an **append-only event
  log** anchored to the **stable note-pair + facet abstraction** with an immutable provenance
  snapshot. **Cannot be backfilled** — must be right on day 1.
- **Community:** local Postgres event log under the single local `user_id`; **same schema** as
  Premium.
- **Premium:** RLS-scoped event log. Day-1 read-back = the per-cohort/per-facet **downvote-rate
  precision-decay alarm**; per-cohort threshold tuning later; personalized re-ranker is v2.
- **Data:** in = vote `(axis: wrong→validity / obvious→non-obviousness / surface_match)` +
  provenance at vote time; out = append-only events, aggregated via a materialized view for
  threshold calibration + eval labels.
- ⚠️ **The day-1 UI must force the wrong/obvious/surface reason** — a bare "dismiss" silently
  collapses the two-axis signal to one-axis noise regardless of schema correctness.

### ⑫ Scheduler + bulk import + observability (cross-cutting workers)
- **Responsibility:** background scan / weekly digest trigger (Premium only); bulk-import lane with
  spend ceiling + adaptive-K + **coverage-not-K invariant**; per-stage cost/score/stage-event
  persistence.
- **Community:** on-demand only (no scheduler/digest). Bulk import = synchronous rate-governed
  fast-lane (no per-token bill on Ollama). Observability = Postgres `stage_events` + optional Sentry.
- **Premium:** external Fly cron → `tick` actor enqueues scans/digest; `KG_BULK_LANE` adds Batches
  behind the seam before GA; OTel→Logfire export opt-in (becomes default at multi-worker scale).
- **Data:** in = cron tick / import file refs / per-stage timings; out = enqueued jobs,
  `pipeline_runs`/`stage_events` rows, digest emails (Premium).
- **Coverage-not-K invariant:** the spend ceiling throttles backfill over **time** and must reach
  **full corpus coverage eventually** — it must never silently drop-K and leave the corpus
  un-connected.

---

## 3. Sequenced fix plan (current code → this design)

The built system is materially behind these decisions — live `api_notes`/`api_connections` have no
`user_id`, no auth chokepoint, a single shared autocommit DB connection, an inline engine call on the
write/read path, and no topical-vector or feedback tables. Most items below are **net-new build, not
edits**, and the *ordering is itself a correctness requirement* (chokepoint + leak-test before RLS;
capture schema before any second user's data exists).

### P0 — correctness, do first
1. **Remove the inline engine call from the HTTP path.** `POST /notes` persists + enqueues and
   returns `job_id/queued`; delete `_pg_engine()` from every read path
   (`main.py` `_pg_create_note` L173, `scan` L240, `find_connections` L218, `list_clusters` L321).
2. **Add `user_id` + the single `get_current_user` chokepoint.** `user_id NOT NULL` as the leading
   column of every composite index + a filter on every query; `KG_AUTH=none|local|clerk`.
   (Prerequisite for D3/D6/D7.)
3. **Persist topical vectors** keyed by `(content_hash, embed_model+dimension)`; gate `pipeline.py:86`
   behind a cache lookup like facets. Test: zero embed calls on `/clusters`, zero re-embeds when only
   a reason/verify prompt version changes.
4. **Move dedup into the data layer:** `UNIQUE(user_id, least(a,b), greatest(a,b), model_version)` +
   `ON CONFLICT DO NOTHING`; deterministic Dramatiq `message_id`. Replace `InMemoryStore.seen_pair`.

### P1 — should, before Premium GA
5. **Define the queue seam + edition defaults** (`KG_QUEUE=pg|redis` behind one `enqueue()`); ship
   the PG SKIP LOCKED worker as a first-class tested profile.
6. **Ship the feedback spine** as the append-only event log (P0-2 must land first). Applied
   migration — cannot be backfilled.
7. **Replace the shared autocommit connection** with `psycopg_pool.AsyncConnectionPool` (5–10/proc);
   `SET LOCAL` for RLS GUC + `ef_search` in-transaction; disable prepared statements under
   transaction-mode pooling.
8. **Mandatory cross-tenant leak test** as a CI merge gate (testcontainers, ≥2 `user_id`s; assert no
   A-row reaches B across notes/connections/clusters/feedback, and the GUC does not survive checkout).
9. **Remove the Voyage hard-commit; add the embedder bake-off** (recall@20-vs-brute-force in
   `eval.py`; Voyage-1024 vs bge-m3/nomic-768 on golden + a messy floor corpus; winner = single
   shared default).
10. **Per-stage cost/tokens + `pipeline_runs`/`stage_events` + Sentry** with `before_send` scrubbing,
    behind `KG_OBSERVABILITY=postgres|otel`.

### P2 — later
11. **Bulk import lane as a seam** (`KG_BULK_LANE=sync|batch`, sync default; spend ceiling +
    adaptive-K + coverage-not-K). Land Batches before GA / first >~500-note cohort; **never** wire
    Batches for the BYO-key privacy tier.
12. **Per-stage `PROMPT_VERSION`** (a verify-prompt tweak must not invalidate cached extractions or
    topical vectors); split `is_seen()`/`mark_seen()` so read endpoints are idempotent without the
    `_judged_pairs.clear()` hack.

---

## 4. Open risks the consensus does NOT fully solve

- **Gate 2 (does genuine insight *recur* weekly on a real un-curated corpus at scale?)** is still
  unvalidated — the make-or-break product risk. No backend decision resolves it; the messy-corpus
  floor experiment must still gate the D4 embedder bake-off.
- **Feedback-flywheel fracture across embedding dimensions:** any user on 768-d local accumulates
  feedback under a different `config_hash` that cannot be pooled with the mainline cohort. A designed
  provenance-aware re-embed/reattribution migration must exist *before* multi-dimension data
  accumulates.
- **Day-1 feedback UI is the uncontrolled dependency:** a bare "dismiss" collapses the two-axis moat
  signal regardless of schema correctness. Schema is necessary, not sufficient.
- **RLS `SET LOCAL`-under-pool footgun:** if the team can't guarantee the in-transaction invariant
  (prepared statements disabled under transaction-mode pooling), leaky-pooled RLS is *worse* than
  none — fall back to chokepoint + leak test only. The leak test is the real guarantee; RLS is
  insurance that can itself leak.
- **Premium fan-out cost/latency under the weekly digest across ~1000 users is modeled, not
  measured.** If PG-queue is ever used hosted (the digest-deferral fallback) or workers multiply, a
  Postgres `stage_events` table can't reconstruct cross-process p99 — promote the deferred
  OTel/Logfire export to the Premium default *ahead* of a debugging fire.
- **Bulk-import economics unmeasured:** if a meaningful fraction of users arrive with >~500–1000-note
  libraries *and* synchronous Sonnet backfill measurably contends with interactive jobs, Batches stops
  being a deferrable margin lever and becomes load-bearing — land it before further Premium growth.
