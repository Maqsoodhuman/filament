# Roadmap

Sequencing follows one principle: **prove the moat headless before building any product around it.**

## v0 — Spike-to-product (the moat, headless)

Goal: turn the proven Gate-1 loop into hardened, versioned, instrumented code. **No UI.**

- [ ] `engine/` Python library: `extract_facets → embed → retrieve_candidates → reason → verify → q-gate`
- [ ] Postgres + pgvector schema (notes, note_facets, connections, connection_feedback, note_clusters, prompt_versions, eval_runs)
- [ ] All stages idempotent, keyed by `(content_hash, model_version)`
- [ ] `model_router` module (Haiku extraction / Sonnet reason+verify / Opus judge); effort + prompt version as config
- [ ] Type-partitioned HNSW indexes (5 facet types)
- [ ] Generic-skeleton suppression (IDF + centroid penalty + frequency quarantine)
- [ ] Golden-set offline eval runner wired into CI as a **deploy gate**
- [ ] **Exit criterion:** ≥75% precision reproducibly on *real heterogeneous* libraries (not the curated Gate-1 corpus)

**Recommended pre-v0 de-risk:** run the *floor experiment* (messy realistic corpus) — see [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md).

## v1 — Lovable product

Goal: the dump/import → organize → first-insight loop in a real user's hands.

- [ ] Next.js app, **five surfaces**: **Timeline** (virtualized) + **Connected-notes card** (hero) + **Write editor** (authored notes) + **Dynamic Organize tab** + **weekly digest**
- [ ] Write editor (TipTap/ProseMirror); authored notes flow through the same ingestion path; **debounced re-extraction on edit** + neighborhood-scoped recompute + stale-connection tombstoning
- [ ] Dynamic Organize tab: topical clustering job (HDBSCAN/k-means) over existing embeddings + Haiku cluster labels; computed view (notes never move); pin/rename + manual tags coexist with AI clusters
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
- [ ] **Deferred-until-demanded:** graph viz

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
