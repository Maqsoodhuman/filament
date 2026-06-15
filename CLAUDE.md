# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state: pre-code (documentation only)

This repository currently contains **only design documentation** — there is no application code, build, or test suite yet. Do not invent commands or reference files that don't exist. The next build step is **v0: the headless engine library** (see `docs/ROADMAP.md`). When that lands, update this file with the real build/test/lint commands.

The architecture is finalized and authoritative. Before proposing changes to the design, read `docs/ARCHITECTURE.md` — it is the output of a structured design process, not a draft.

## What this project is

An AI **cross-source synthesis instrument** (NOT a notes app) for researchers/analysts/writers. Users import their existing reading library; the product surfaces **genuinely non-obvious, true, cross-domain connections** between notes — links that topical/embedding similarity *cannot* find because the notes are far apart in subject matter.

The defining design tension, which governs nearly every decision: **the moat is the structural connection engine + ingestion breadth + accumulating per-user feedback — never the UI, never topical similarity, never the graph viz.** Effort should concentrate on the engine and the eval harness.

Users both **write their own notes** (a rich editor) and **import** existing ones, and browse via a stable Timeline plus a **dynamic Organize tab** (auto-clustering). These are v1 surfaces. Crucially, **an authored note is just another ingestion source** — it enters the same `normalize → enqueue → engine` path as an import, so the editor never forks the engine. The graph ships in v1 as a **local neighborhood view only** (force-directed, centered on the open note, read straight from the `connections` edges — no new pipeline); the **global** whole-library graph stays deferred as low-retention "demo-candy."

## The core mechanism (read this before touching engine design)

The connection engine is a 6-stage async pipeline. Its non-obvious design choices exist for validated reasons:

1. It matches on **abstraction-space embeddings of extracted structural facets**, NOT on note text. Embedding the *abstraction* is what lands topically-distant notes near each other — this is the whole point.
2. It **inverts topical similarity**: candidate pairs whose *topical* vectors are too close are *rejected* (same-topic = boring).
3. A **separate verifier model with no access to the reasoner's rationale** scores validity and non-obviousness independently (decorrelated judgment). Keep these as two calls — do not merge them for cost.
4. A hard **`q = min(validity, non-obviousness) ≥ 3` gate** is the only thing surfaced. This threshold came directly from the Gate-1 experiment, where every genuine connection scored ≥3 and all garbage ≤2.67. **Never surface a sub-q3 connection** — an empty result is correct; a forced connection destroys trust.
5. **Generic-skeleton suppression** (IDF + centroid penalty + hub-facet quarantine) runs *before any LLM call* — it is both the cost control and the defense against "horoscope" pseudo-insight at scale.

See `docs/DESIGN_DECISIONS.md` Part B for the experiment that justifies #4 and #5.

## Planned stack (target for v0/v1)

- **Engine** (`engine/`): Python 3.12 + FastAPI library — `extract_facets / embed / retrieve_candidates / reason / verify`. The moat lives here.
- **Async**: Dramatiq on Redis. All engine work is async, off every HTTP write path, idempotent, keyed by `(content_hash, model_version)`.
- **Data**: single managed Postgres 16 + pgvector (HNSW) + pg_trgm. Connections are strictly **intra-user** (shard by `user_id`) — this is how the N² problem is bounded.
- **Models**: Anthropic — Haiku 4.5 (extraction) · Sonnet 4.6 (reasoning + verifier) · **Opus 4.8 (eval judge ONLY, never per-pair)**. Embeddings: Voyage `voyage-3-large`. Routed through one `model_router` module; effort/prompt-version is config, not call sites.
- **Frontend** (v1): Next.js (App Router) + TypeScript + Tailwind/shadcn + TanStack Query/Virtual. Thin BFF via Next.js Route Handlers — **no LLM/embedding work on the API path**. Note editor = **BlockNote** (TipTap/ProseMirror) with tables/images/callouts/code; images → S3/R2.
- **Hosting**: Fly.io (api/workers/Postgres) + Vercel (frontend).
- **Model runtime**: all calls go through `model_router`, so **local LLMs (Ollama) are a config swap** — use them for dev / the floor experiment, validate via the eval harness before trusting local for the reasoning+verifier (moat) stages; hybrid (local extract/embed + API reason/verify) is the expected sweet spot. The core loop is a **deterministic pipeline, not autonomous agents** — optionally orchestrated on LangGraph; reserve true agents for a v2 "deep connection explorer." See `ARCHITECTURE.md` §3b.

## Hard invariants (do not violate without revisiting the design docs)

- **No LLM or embedding call on any HTTP write path** — always enqueue to the async pipeline.
- **Extraction is cached forever per `content_hash`** — never re-extract or double-bill on overlapping imports (e.g. same highlight in Kindle and Readwise).
- **Opus is never in the per-pair hot path.** It is the offline eval judge only. Putting it per-pair was an explicitly rejected design.
- **The eval harness is a deploy gate**, not optional tooling. Prompt/model/threshold/K changes must run the golden set in CI and block merge on a precision drop. Every connection row stores its `extractor/reasoner/verifier_model_version + prompt_hash + scores` so judgments are reproducible.
- **Notes never physically move.** Stable home = creation-date timeline; all organization is a computed view on top.

## Validation gates (project is gated on these, see `docs/DESIGN_DECISIONS.md`)

- **Gate 1** (✅ passed): can the engine find genuine non-obvious links? 75% precision on a blind corpus; q≥3 cleanly separated signal from garbage. Note this was a *ceiling* on a curated corpus.
- **Floor experiment** (todo, recommended before v0): rerun on a deliberately messy/realistic corpus to estimate the floor.
- **Gate 2** (todo): does genuine insight *recur* weekly on a real, un-curated user corpus at scale? This is the make-or-break risk and needs real user data.

## Documentation map

| File | Use when |
|---|---|
| `docs/ARCHITECTURE.md` | Any system/stack/pipeline/cost/scaling decision. The authoritative spec. |
| `docs/ARCHITECTURE_DIAGRAM.md` | Mermaid diagrams of system, pipeline, ingestion, N² solution. |
| `docs/DESIGN_DECISIONS.md` | *Why* the product and architecture are shaped this way — strategy debate + the Gate-1 experiment. |
| `docs/ROADMAP.md` | What ships in v0 / v1 / v2 and the carried open risks. |
