# Tech Stack (finalized)

The consolidated, decided stack. See [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning behind each choice.

| Layer | Choice | Notes |
|---|---|---|
| **Frontend framework** | Next.js (App Router) + React + TypeScript | SSR/streaming for fast timeline & import progress |
| **Styling / components** | Tailwind CSS + Radix / shadcn | Per [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) tokens |
| **Lists / virtualization** | TanStack Query + TanStack Virtual | Handles 10k+ note corpora |
| **Note editor** | **BlockNote** (TipTap / ProseMirror) | Tables, images, callouts, code, `/` menu |
| **Local graph** | react-force-graph / sigma.js | Deterministic radial, no physics |
| **API / BFF** | Next.js Route Handlers | Thin — no model/embedding work on this path |
| **Engine** | Python 3.12 + FastAPI (`kg_engine`) | The moat; the connection pipeline |
| **Async / queue** | Dramatiq on Redis (+ APScheduler beat) | Off the write path; scheduler folded into worker |
| **Primary DB** | PostgreSQL 16 | Single system of record |
| **Vector search** | pgvector (HNSW) + pg_trgm | `VectorIndex` seam → Qdrant only if a power-user corpus demands |
| **Object storage** | S3 / Cloudflare R2 | Note images, raw import blobs, extraction audit trail |
| **Models — Community** | Ollama (local): qwen2.5 / llama3.x + nomic-embed-text | Free, private, on-demand only |
| **Models — Premium** | Claude: Haiku (extract) · Sonnet (reason + verify) · Opus (eval judge only) | Frontier, prompt-tuned, eval-gated |
| **Embeddings — Premium** | Voyage `voyage-3-large` (1024-d) | Community uses nomic-embed-text (768-d) |
| **Model routing** | `model_router` module (`kg_engine/router.py`) | local ↔ API ↔ hybrid is config only |
| **Agent orchestration** | None in core loop (deterministic pipeline); LangGraph optional | Autonomous agents reserved for a v2 "deep connection explorer" |
| **Hosting** | Fly.io (api / workers / Postgres) + Vercel (frontend) | 12-factor; ECS/Fargate + RDS lift when ARR justifies |
| **Eval / quality** | Golden-set harness + CI deploy gate; versioned prompts/models | `q≥3` gate; precision regression blocks merge |
| **Dev tooling** | pytest · ruff · setuptools (src layout) | Fake provider → infra-free tests |
| **Distribution** | Open-core: Community (self-host, free) + Premium (hosted, $/seat) | Same engine; only trigger + model targets differ |

## Pipeline at a glance

```
write / import ─► normalize+enqueue ─►  [ engine, on explicit trigger ]
                                         extract (Haiku/Ollama, cached)
                                       → embed abstraction (Voyage/nomic)
                                       → retrieve top-K (pgvector, no LLM, pruned)
                                       → reason (Sonnet/Ollama)
                                       → independent verify (Sonnet/Ollama)
                                       → q≥3 gate ─► surfaced connection
```

## Editions

| | Community | Premium |
|---|---|---|
| Code | open source, self-host | hosted |
| Models | bring-your-own Ollama | managed Claude |
| Trigger | on-demand button only | on-demand + background scan + weekly digest |
| Data | 100% local | hosted (or bring-your-own-key) |
| Price | free | $/seat |
