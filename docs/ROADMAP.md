# Roadmap

Sequencing follows one principle: **prove the moat headless before building any product around it.**

**Editions (open-core):** *Community* (open source, self-host, BYO Ollama, on-demand only) and *Premium* (hosted, managed Claude, on-demand + background scan + weekly digest). The engine runs on an explicit trigger, never auto-on-every-note. See `docs/ARCHITECTURE.md` §1a.

## v0 — Spike-to-product (the moat, headless)

Goal: turn the proven Gate-1 loop into hardened, versioned, instrumented code. **No UI.**

- [x] `engine/` Python library: `extract_facets → embed → retrieve_candidates → reason → verify → q-gate` (`engine/src/kg_engine/`)
- [x] `model_router` module — fake / Ollama (local) / Anthropic, hybrid supported (`router.py`); prompt version as config (`prompts.PROMPT_VERSION`)
- [x] All stages idempotent, keyed by `(content_hash, model_version)` (`store.py`, `config.model_version`)
- [x] Generic-skeleton suppression via hub-facet quarantine (`retrieve.py`)
- [x] Vector index seam (`VectorIndex`) — in-memory numpy impl, partitioned by facet type (`index.py`)
- [x] Golden-set eval harness + labeled corpus (`eval.py`, `data/golden/notes.json`)
- [x] Postgres + pgvector schema (`db/schema.sql`: notes, note_facets, connections, connection_feedback, note_clusters, prompt_versions, eval_runs)
- [x] Wiring tests, infra-free via fake provider (`tests/`, 5 passing)
- [ ] pgvector-backed store implementation (currently in-memory only)
- [ ] Type-partitioned HNSW as real table partitions (logically partitioned today)
- [ ] Wire the eval runner into CI as a **deploy gate**
- [ ] **Exit criterion:** ≥75% precision reproducibly on *real heterogeneous* libraries via Ollama/API (not the fake provider, not the curated Gate-1 corpus)

**Recommended pre-v0 de-risk:** run the *floor experiment* (messy realistic corpus) — see [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md).

## Backend production hardening (from `docs/BACKEND_GUIDE.md`)

Required to take the v0 engine to the FastAPI + Dramatiq + Postgres production system. Prioritized:

- [x] Fold retrieval/gate knobs + embed dimension into the version key (`config_hash`) — was a silent stale-cache bug
- [x] Use bare model-id aliases (`claude-haiku-4-5`), not dated ids
- [ ] **#1 — persist store/index/dedup into Postgres+pgvector** before deploy; at-least-once delivery makes in-memory dedup unsafe. `UNIQUE(content_hash, model_version)` + `ON CONFLICT`; deterministic Dramatiq `message_id`
- [ ] Make providers + pipeline **async** (`httpx.AsyncClient`, `anthropic.AsyncAnthropic`, `anyio` task groups + `CapacityLimiter`); engine runs in workers, never the HTTP route
- [ ] Constrain **structured output at the provider** (Anthropic `output_config.format` / Ollama JSON-schema) + `extra='forbid'` on strict schemas; retire the prompt-and-salvage path
- [ ] **Cluster-wide token-aware rate governor** (Redis token bucket per provider/model; Ollama semaphore) in the model_router seam
- [ ] Config → **pydantic-settings**; deps → **uv** + committed `uv.lock`; CI = ruff + `mypy --strict` + fake-provider pytest + **eval deploy-gate** (recall floor AND garbage ceiling)
- [ ] Bulk import via **Anthropic Batches API** with a dedicated `bulk` queue + pre-enqueue spend/adaptive-K gate
- [ ] **Observability** (OTel/OpenLLMetry → Logfire, Sentry with note-text scrubbing) + **Clerk** JWT auth + `structlog`
- [ ] pgvector HNSW tuning (`m=24–32`, `ef_construction=128–200`, runtime `ef_search`) + **0.8 iterative scans** so filter+ANN doesn't under-return (recall is the moat); `vector_cosine_ops` + `<=>`
- [ ] Postgres **RLS** keyed on `user_id` (fail-closed multi-tenant isolation) + `testcontainers` integration tests

## v1 — Lovable product

Goal: the dump/import → organize → first-insight loop in a real user's hands.

- [ ] Next.js app, **six surfaces**: **Timeline** (virtualized) + **Connected-notes card** (hero) + **Write editor** (authored notes) + **Dynamic Organize tab** + **Local neighborhood graph** (lite) + **weekly digest**
- [ ] Local neighborhood graph: force-directed view centered on the open note (1–2 hops, edges by facet-type), reads `connections` edges directly; click-to-recenter; capped to avoid hairball
- [ ] Write editor (TipTap/ProseMirror); authored notes flow through the same ingestion path; **debounced re-extraction on edit** + neighborhood-scoped recompute + stale-connection tombstoning
- [ ] Dynamic Organize tab: **OneNote-style Notebook → Section → Page** layout; sections = AI clusters (HDBSCAN/k-means over existing embeddings + Haiku labels); **multi-section membership** (a note in several sections); computed view (notes never move); pin/rename AI sections + add manual notebooks/sections that coexist
- [ ] Importers: file-drop (Markdown/Kindle/Notion-export/Evernote) → **Readwise API** → Notion API
- [ ] Onboarding: synchronous **fast-lane** (first insight in ~2–3 min) + **Batches API** bulk backfill
- [ ] Two-axis feedback (`wrong`/`obvious`/`surface match`) writing to `connection_feedback`
- [ ] Dramatiq/Redis async pipeline; per-import spend ceilings; adaptive K
- [ ] Shadow mode + online precision dashboards (incl. `false-match-rate vs corpus-size`)
- [ ] **Invariant:** never surface a sub-`q3` connection — empty rail over garbage

## v2 — Breadth, defensibility, scale

- [ ] Passive capture: browser extension, email-in, mobile share-sheet
- [ ] Apple Notes (local SQLite/export) + OneNote (MS Graph API) connectors
- [ ] Per-user personalized re-ranker trained on accumulated feedback
- [ ] Bring-your-own-API-key strict-privacy tier (margin + researcher privacy wedge)
- [ ] Promote `VectorIndex` → Qdrant if power-user corpora outgrow HNSW-in-Postgres
- [ ] **Deferred-until-demanded:** the **global** force-directed graph of the whole library (the local neighborhood graph already ships in v1)

## Open risks (carried, see ARCHITECTURE.md §10)

1. Generic-skeleton precision decay at 50k+ notes/user — mitigated, not proven.
2. Human-rated eval throughput is the binding constraint on iteration velocity.
3. Defensibility is execution-dependent (connector health + feedback flywheel speed), not architectural.

## Validation gates

| Gate | Status | Criterion |
|---|---|---|
| Gate 1 — can it find genuine non-obvious links? | ✅ PASS (75%, ceiling) | ≥30–40% precision, low garbage |
| Floor experiment — messy corpus | ⬜ TODO | precision holds on un-curated notes |
| Gate 2 — recurrence | ⬜ TODO | genuine connection fires ~weekly/user over 4 weeks |
