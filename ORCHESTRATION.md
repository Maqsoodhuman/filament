# Orchestration Playbook — Knowledge Graph Build

One repo, two lanes (a deterministic Python engine + a visual Next.js frontend). The **main thread is the orchestrator**: it plans, owns the API contract, enforces gates, and merges. **Workers build.** The orchestrator does not write feature code.

## Hard invariants (never violate)

1. **No autonomous agents on the engine write path.** The pipeline is deterministic. LangGraph is reserved for a v2 "deep explorer" only.
2. **The precision gate blocks every merge.** Golden-set quality holds at `q≥3` with no precision regression vs baseline (**0.75**) and `garbage_surfaced == 0`. A regression means stop and report — never merge.
3. **The Pydantic schema (`engine/src/kg_api/schemas.py`) is the single source of truth for the API.** The frontend never hand-writes API types — they are generated into `frontend/lib/api-types.ts` from the OpenAPI schema.
4. **Subagents work in separate git worktrees.** No two agents ever edit the same file in the same window.
5. **A skill without a verification step is not done.** Every skill ends in a gate command that exits nonzero on failure.

## Lanes & file ownership

- **Engine lane** owns: `engine/src/kg_engine/`, `engine/src/kg_api/` (FastAPI + routes), Dramatiq workers, `engine/migrations/`, `engine/data/golden/` (evals), the `model_router`.
  **Gate:** `pytest` green AND `skills/eval-gate.sh` passes (q≥3, precision ≥ 0.75, garbage 0) with `KG_PROVIDER=ollama`.
- **Frontend lane** owns: `frontend/app/`, `frontend/components/`, `frontend/lib/` (except the generated `api-types.ts`), styling.
  **Gate:** `next build` (or `npm run typecheck`) passes AND `skills/visual-check.mjs` passes for every changed route.
- **Contract (orchestrator only):** the OpenAPI schema, `frontend/lib/api-types.ts`, `docs/COHESIVE_DESIGN.md`. No worker edits these directly.

## Subagents

- **engine-agent** — scope: engine lane files only. Brief per task: the change, the acceptance test, the gate (`pytest && skills/eval-gate.sh`). If the gate fails twice on the same task, **stop and report** — never loosen the test to pass.
- **frontend-agent** — scope: frontend lane files only. Brief: the change, the route(s), the acceptance description in plain language, the gate (`npm run typecheck && node skills/visual-check.mjs --url ... --intent ...`). Never merge a route without a green visual-check; if it fails to match intent twice, stop and report.

Each subagent reads only its own lane's `CLAUDE.md` (`engine/CLAUDE.md`, `frontend/CLAUDE.md`).

## The five skills (built & self-tested in Phase 0)

| Skill | Purpose | Verify |
|---|---|---|
| `skills/regenerate-api-types.sh` | OpenAPI → `openapi-typescript` → `lib/api-types.ts` | `tsc --noEmit` passes |
| `skills/eval-gate.sh` | golden-set harness; assert q≥3 & precision ≥ baseline & garbage 0 | exits nonzero on regression |
| `skills/visual-check.mjs` | Playwright screenshot a route vs an acceptance intent | pass/fail; nonzero on miss |
| `skills/scaffold-route.py` | FastAPI route + Pydantic models + test stub | pytest collects the new test |
| `skills/run-migration.sh` | alembic upgrade then clean downgrade vs scratch DB | round-trip succeeds |

## Sequencing

- **Phase 0** — worktrees created; all five skills built & self-tested green.
- **Phase 1** — contract first: Pydantic schema for the core endpoints (`POST /notes`, `GET /notes`, `GET /notes/{id}`, `POST /notes/{id}/find-connections`, `POST /scan`, `GET /connections`, `GET /jobs/{id}`); run `regenerate-api-types`. Both lanes now share a stable boundary.
- **Phase 2** — parallel: engine-agent builds the pipeline behind `pytest` + `eval-gate`; frontend-agent builds UI against the generated types behind `visual-check`. They never touch each other's files.
- **Phase 3** — integration: merge through PRs; CI runs `eval-gate`, `next build`, `visual-check`. CI is the referee.

## Worktree setup

```bash
git worktree add -b engine/main   ../kg-engine   main
git worktree add -b frontend/main ../kg-frontend main
```

## Stop conditions (hand back to the human)

- Any gate fails twice on the same task.
- A task needs edits across both lanes (a contract change) — the orchestrator handles it, never blind-delegates.
- A schema change would break existing frontend types.
- Eval precision regresses below baseline. Never auto-merge through a red gate.
