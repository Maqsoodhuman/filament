# kg-engine (v0)

The headless connection engine — the moat. Implements the pipeline from
[../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) §3:

```
extract facets (LLM, cached) → embed abstraction → retrieve candidates (no LLM, pruned)
    → reason (LLM) → independent verify (LLM) → q≥3 gate
```

Runs fully local on **Ollama**, or on the **Anthropic API**, or on a deterministic **fake** provider
(no infra) for tests. Provider/models are a config swap via the `model_router` — see `.env.example`.

## Quick start

```bash
cd engine
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"          # add ",postgres" or ",anthropic" as needed

# tests (fake provider, no network):
pytest

# run on local models via Ollama:
ollama pull qwen2.5:7b && ollama pull llama3.1:8b && ollama pull qwen2.5:14b && ollama pull nomic-embed-text
cp .env.example .env             # KG_PROVIDER=ollama
set -a; source .env; set +a
kg-engine eval                   # labeled golden set -> precision/recall/garbage
kg-engine run /path/to/notes     # a folder of .md/.txt notes -> surfaced connections
```

## Layout

| Path | Role |
|---|---|
| `src/kg_engine/extract.py` | Stage 1 — typed facet extraction (cached by content hash) |
| `src/kg_engine/index.py` | Stage 2/3 — vector index (`VectorIndex` seam; in-memory now, pgvector later) |
| `src/kg_engine/retrieve.py` | Stage 3 — candidate generation + pruning (topical-reject, salience, hub quarantine) |
| `src/kg_engine/reason.py` | Stage 4 — reasoning |
| `src/kg_engine/verify.py` | Stage 5 — independent verifier (no access to reasoner rationale) |
| `src/kg_engine/pipeline.py` | `Engine` — orchestration + q≥3 gate |
| `src/kg_engine/router.py` | model routing (fake / ollama / anthropic; hybrid supported) |
| `src/kg_engine/eval.py` | golden-set precision/recall/garbage harness |
| `db/schema.sql` | Postgres + pgvector production schema |
| `data/golden/notes.json` | labeled cross-domain eval corpus |

## v0 scope / not yet

In: the full pipeline, content-hash caching, lifetime pair dedup, generic-skeleton (hub) suppression,
the eval harness, the Postgres schema. Not yet: the pgvector-backed store implementation (in-memory
only), Batches-API import, the personalized re-ranker. The `VectorIndex` and store interfaces are the
seams those plug into.
