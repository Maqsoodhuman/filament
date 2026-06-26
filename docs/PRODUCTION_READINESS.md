# Production Readiness Checklist

> The definitive "what do we need for production" list. Scope = **hosted Premium launch** (the full
> bar, where we hold users' private data). Items marked **[Community drops]** are not needed for the
> self-host single-tenant cut. Items marked **[fast-follow]** are real but not launch-blocking.
> Ties back to the P0/P1/P2 plan in `BACKEND_PIPELINE.md` §3 and the consensus (D1–D9).
>
> **The binding gate is E (quality), not infra.** If the floor experiment fails, nothing else
> matters — there is no product.

---

## A — Engine & correctness (code)
- [ ] **Engine off every HTTP path** — `POST /notes` + triggers enqueue only; delete `_pg_engine()` from read paths. *(P0-1)*
- [ ] **Topical-vector cache** keyed by `(content_hash, embed_version)`; no re-embed on read. *(P0-3)*
- [ ] **Async providers** (`httpx.AsyncClient` / `anthropic.AsyncAnthropic`) — no event-loop blocking. *(P1)*
- [ ] **Provider-constrained structured output** + `extra='forbid'`; schema-invalid → non-retryable. *(P1)*

## B — Data & persistence
- [ ] **Production migration**: `user_id NOT NULL` on every table (leading index col); `feedback_events`, `topical_cache`, `jobs`, `connections` provenance + cost columns. *(P0-2 / P1-6)*
- [ ] **Managed Postgres + pgvector** with **backups / PITR** (RPO ≤ 5 min). *(don't lose users' data)*
- [ ] **HNSW built right** — `m≈32`, `ef_construction≈200`, `iterative_scan=relaxed_order`, `ef_search≫K`, `vector_cosine_ops`. *(recall is the moat)*

## C — Async & jobs
- [ ] **`KG_QUEUE` worker** (Redis+Dramatiq for Premium / PG-SKIP-LOCKED for Community). *(P1-5)*
- [ ] **Data-layer idempotency** — `ON CONFLICT` dedup + deterministic message_id; re-check cache before any paid call. *(P0-4)*
- [ ] **Transactional outbox** — persist + enqueue in one txn (or use the PG-queue to sidestep). *(SYSTEM_DESIGN §11.3)*
- [ ] **Retries / TimeLimit / DLQ→Postgres** + depth alarm; `dramatiq-abort` for runaway scans.

## D — Auth & multi-tenancy
- [ ] **`get_current_user` chokepoint** — sole source of `user_id`; **Clerk JWT** (PyJWT/JWKS). *(P0-2)*
- [ ] **Cross-tenant leak test as a CI merge gate** (testcontainers, ≥2 tenants). *(P1-8 — a leak is fatal)*
- [ ] **Per-request connection pool** (replace the shared autocommit conn); `SET LOCAL` GUC in-txn. *(P1-7)*
- [ ] **[fast-follow] RLS** fail-closed insurance — after the chokepoint + leak test are solid. *(D6)* **[Community drops]**

## E — Quality gate (THE binding requirement)
- [ ] **Floor experiment passes** — precision ≥ 75% / clean garbage cut on a **messy, realistic** corpus (not just curated Gate-1).
- [ ] **One validated embedder** in place (bake-off can optimize later).
- [ ] **Eval harness wired as a CI deploy gate** — blocks merge on precision drop / garbage rise / recall@20 regression; runs on model-id bumps too.
- [ ] **[fast-follow]** Full embedder bake-off; shadow-mode promotion; Opus-as-judge re-anchoring.

## F — Cost & rate control
- [ ] **Hard spend ceiling** (per-import / per-user) + adaptive-K, checked **pre-enqueue**.
- [ ] **Token-bucket rate governor** per `(provider, model)`; honor `Retry-After`. *(D5)* **[Community drops — Ollama semaphore instead]**
- [ ] **Prompt caching** on the frozen extraction/verifier system blocks.
- [ ] **[fast-follow] Batches API** for bulk import (sync fast-lane covers launch). *(D5)*

## G — Security & privacy
- [ ] **Secrets management** (Fly secrets, `SecretStr`); **TLS** end-to-end; private 6PN between services.
- [ ] **PII scrubbing decided before telemetry goes live** — Sentry `before_send`, no note text in logs / span attrs / vcr cassettes.
- [ ] **[fast-follow]** BYO-key strict-privacy tier (local embed, never Batches). *(v2)*

## H — Observability & ops
- [ ] **Per-stage cost/tokens on connection rows** + `pipeline_runs`/`stage_events` table. *(P1-10)*
- [ ] **Sentry** on api + workers (scrubbed); **queue/DLQ depth + spend alarms**; the `false-match-rate vs corpus-size` canary.
- [ ] **[fast-follow] OTel/OpenLLMetry → Logfire** — when multi-worker scale needs cross-process p99. *(D9)* **[Community drops]**

## I — Product surface (it must be usable)
- [ ] **Frontend wired to the real API** — `store.ts` seam → `/notes` `/connections` `/scan` `/jobs` `/clusters`. *(currently localStorage)*
- [ ] **≥1 ingestion path** — authored notes (`POST /notes`) + **file-drop import**.
- [ ] **Connected-notes card** surfacing q≥3 connections + **two-axis feedback capture** (wrong/obvious/surface). *(un-backfillable)*
- [ ] **[fast-follow]** Organize tab clustering, local neighborhood graph, **weekly digest + background scan** (the retention lever — soon after launch), Readwise/Notion connectors.

## J — Infra / deploy
- [ ] **Two Fly apps** (`kg_api`, `kg_workers`) + Managed Postgres + **persistent Redis** (or PG-queue) + S3/R2 + Vercel.
- [ ] **External Fly cron → `tick`** (only once the digest/background scan ships). **[Community drops]**

## K — CI / release gates
- [ ] **`uv.lock` committed**, `mypy --strict`, `ruff`, `pytest` (fake provider).
- [ ] **CI gates**: eval gate · testcontainers (leak / HNSW recall / `ON CONFLICT`).
- [ ] **Migrations** Alembic, HNSW/partition/`CONCURRENTLY` hand-written + non-transactional.

---

## What Community-production drops (the cheap cut)
D-Clerk, D-RLS, F-governor, H-OTel, J-Redis, J-cron, and the digest — single tenant, local data,
on-demand, Ollama. Leaves: A + B(local PG) + C(PG-queue) + E(floor on Ollama) + I(wiring + file-drop
+ feedback). **That is the true minimum to be "in production" at all.**

## Recommended order
1. **E first, in parallel with code** — run the floor experiment on Ollama. If it fails, stop and fix the engine, not the infra.
2. **A → B → C → D** — the correctness foundation (P0 + the tenancy/queue spine).
3. **I** — wire the frontend + file-drop + feedback (now it's a product).
4. **F, G, H, J, K** — the hosting/safety/ops bar for holding strangers' data.
5. **Fast-follow** — RLS, Batches, OTel, digest, more connectors.
