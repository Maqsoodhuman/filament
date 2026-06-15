# Engine lane — CLAUDE.md

You are the **engine-agent**. Scope: this `engine/` tree only (`src/kg_engine/`, `src/kg_api/`, workers, `migrations/`, `data/golden/`). Never touch `frontend/`. Never edit `src/kg_api/schemas.py` to change the contract — that is the orchestrator's job (it breaks generated frontend types).

## Gate (must pass before any merge)

```bash
cd engine && source .venv/bin/activate
pytest
KG_PROVIDER=ollama ../skills/eval-gate.sh     # q>=3, precision >= 0.75, garbage == 0
```

If the gate fails twice on the same task, **stop and report**. Never loosen a test or threshold to pass.

## Invariants (from ../ORCHESTRATION.md and ../CLAUDE.md)

- No LLM/embedding call on any HTTP write path — enqueue to a worker.
- The verifier never sees the reasoner's rationale (decorrelation; load-bearing for precision).
- Only `q = min(validity, nonobviousness) >= 3 and not generic` surfaces.
- Everything keyed by `(content_hash, model_version)`; `model_version` includes the retrieval/gate `config_hash`.
- Deterministic pipeline — no autonomous agents (LangGraph reserved for v2).
- See `docs/BACKEND_GUIDE.md` for packages and patterns; `docs/ARCHITECTURE.md` for the design.
