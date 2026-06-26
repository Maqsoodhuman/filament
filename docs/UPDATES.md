# Updates — backend design → production build + AWS-style proposal

Summary of the work landed on `frontend/filament-redesign` this cycle. Gates at the end of the
cycle: engine `pytest` **32 passed / 6 skipped**, `ruff` + `mypy` clean; migrations **0001→0009**
apply head-to-tail on Postgres; frontend `tsc` clean; live demo (import → SSE scan → graph/Organize)
works on the fake/Ollama paths.

## Design docs (consensus + production HLD/LLD)
- `docs/BACKEND_PIPELINE.md` — **authoritative** backend design: 5-perspective debate → consensus
  decisions D1–D9, component-by-component pipeline (Community vs Premium), sequenced fix plan.
  Supersedes the contested calls in BACKEND_GUIDE/ARCHITECTURE.
- `docs/SYSTEM_DESIGN.md` — production HLD: topology, full data model (DDL/keys/indexes/RLS),
  end-to-end flows, job state machine, scaling, failure modes, security, cost, SLOs, and the
  cross-cutting properties (availability/SPOF, CAP & consistency, transactional outbox, SSE,
  caching tiers, DB-scaling roadmap, networking, patterns).
- `docs/LOW_LEVEL_DESIGN.md` — LLD: module boundaries, interface Protocols, actor signatures,
  error taxonomy, idempotency keys, algorithm pseudocode.
- `docs/PRODUCTION_READINESS.md` — the production checklist (P0/P1/P2, what Community drops).
- `docs/ARCHITECTURE.md` / `docs/BACKEND_GUIDE.md` — revised: Voyage hard-commit struck (eval-gated
  embedder); superseded-calls banner pointing at BACKEND_PIPELINE.

## P0 — backend correctness (validated on Docker Postgres)
- **P0-1** engine off every HTTP path → `KG_QUEUE` worker (`kg_api/queue.py`, `worker.py`).
- **P0-2** `user_id` + single `get_current_user` auth chokepoint (`kg_api/deps.py`); user-scoped repo;
  migration `0006_api_user_id`.
- **P0-3** topical-vector cache keyed by `(content_hash, embed_version)`; migration `0005_topical_cache`;
  no re-embed on read paths.
- **P0-4** data-layer dedup: `is_seen`/`mark_seen` split (`ON CONFLICT`); removed the in-memory hack.

## A — product surfaces (frontend, engine-wired)
- **A1** file-drop import (`frontend/lib/import.ts`: Markdown/.txt/Obsidian/Kindle/Notion) → normalize
  → scan; wired the onboarding Upload flow.
- **A2** edit re-sync — an edit drops the engine-id mapping so the next scan re-extracts.
- **A3** real-time progress via **SSE** — engine `GET /jobs/{id}/stream` + BFF passthrough; `store.runScan`
  consumes the stream.
- **Organize incremental + Re-cluster** — a new note joins its nearest existing section by default
  (stable view); the **Re-cluster** button (`/clusters?recluster=true`) rebuilds from scratch.

## B — engine quality
- **B1** topical-reject tuning — floor experiment moved the default `0.82 → 0.92` (genuine recall
  0/4 → 1/4, labeled precision 0% → 50%, garbage flat). Floor corpus + write-up in `engine/data/floor/`.
- **B2** eval upgrades — ANN **recall@20**-vs-brute-force + two independent gate thresholds
  (recall floor AND garbage ceiling).
- **B3** multi-section clustering — a note can appear in several Organize sections.

## C — production hardening (validated on Docker Postgres + Redis)
- **C1** provider-native structured output (Ollama `format=schema`) + `extra='forbid'` on LLM-boundary
  models (fake provider is now a contract test).
- **C2** per-request `ConnectionPool` (replaces the single shared autocommit connection).
- **C3** cross-tenant leak test as a CI merge gate (`tests/integration/test_tenancy_leak.py`).
- **C4** Redis + Dramatiq + **transactional outbox** (`kg_api/broker.py`, `DramatiqQueue`); PG jobs
  table is the durable outbox, Dramatiq distributes a drain signal.
- **C5** observability — `pipeline_runs`/`stage_events` + per-pair cost columns (migration
  `0008_observability`) + worker recorder (`kg_api/telemetry.py`).
- **C6** Row-Level Security — fail-closed policies + per-request GUC (migration `0009_rls`).
- **C7** tooling/CI — `uv`/`mypy`/`ruff` config + `.github/workflows/ci.yml` (fast + Postgres lanes).

## D — cost/scale seams
- **D1** `KG_BULK_LANE` + spend ceiling + adaptive-K with the coverage-not-K invariant
  (`kg_api/spend_gate.py`).
- **D2** `KG_READ_REPLICA_URL` seam + the existing `VectorIndex`→Qdrant promotion seam.

## System architecture proposal (AWS-style format, our stack)
- `docs/SYSTEM_ARCHITECTURE_PROPOSAL.docx` — Word proposal in the reference format: overview, C4
  context + container/data-flow diagrams, per-flow Component→Service→Role tables with points for
  discussion, Well-Architected/cost notes, editions, open risks.
- `docs/diagrams/` — `context.svg/png` (C4 L1), `container_flow.svg/png` (C4 L2), `deployment.png`.
- `docs/architecture.svg/png` — detailed component diagram.

## Not done (deliberate)
Anything requiring Claude — Anthropic provider hardening + the quality eval on managed models. The
`model_router` seam is ready; flipping `KG_PROVIDER=anthropic` is the remaining step. An OpenAI
provider can be added as a validation proxy on request.
