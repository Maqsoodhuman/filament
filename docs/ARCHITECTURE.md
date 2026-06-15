# Consensus Reference Architecture: Cross-Source Synthesis Instrument

> Produced by a 5-architect design workshop (independent proposals → cross-critique & scoring → chief-architect synthesis). Anchored on the **Scale-Ready** proposal (unanimous "best overall", panel score 7.73), with the best ideas of the other four grafted in and their flaws cut.

## Workshop scoreboard (avg across 5 reviewers, 1–10)

| Proposal | Overall | UI | Usability | Cost | Scale | Build speed | Engine |
|---|---|---|---|---|---|---|---|
| **Scale-Ready** ⭐ winner | **7.73** | 6.6 | 7.8 | 8.0 | **9.0** | 6.2 | **8.8** |
| Lean-Serverless | 7.43 | 6.6 | 7.4 | 6.8 | 7.2 | **9.2** | 7.4 |
| Cost-Minimalist | 7.40 | 6.0 | 7.0 | **9.0** | 9.0 | 6.0 | 7.4 |
| Engine-First | 7.27 | 6.4 | 7.0 | 6.6 | 8.0 | 6.0 | **9.6** |
| Local-First-UX | 7.03 | **9.0** | 8.0 | 6.4 | 7.0 | 3.8 | 8.0 |

**What was grafted onto Scale-Ready:** Engine-First's versioned/instrumented eval discipline + two-axis feedback capture; Cost-Minimalist's per-tenant cost bounding + adaptive-K spend ceilings; Lean-Serverless's faster-to-ship instinct (trimmed to two deployables, not three).

---

## 1. Chosen architecture in one paragraph

A **Next.js web app** — where users both **write their own notes** and **import** existing ones, and browse them via a stable Timeline plus a **dynamic Organize tab** — over a **single managed Postgres+pgvector system of record**, with the bulk of the engineering budget spent on a **cleanly-bounded, model-versioned connection engine** (`engine/` Python library) running **async off every write path** on a durable queue. Authored and imported notes share one ingestion path, so the editor adds a surface without forking the engine. The engine is the proven Gate-1 loop: cached Haiku facet extraction → abstraction-space ANN (type-partitioned) → Sonnet reasoning → an **independent Sonnet verifier** → hard `q>=3` gate. Opus is rationed to the eval-judge role, never the per-pair hot path. We start with **two** deployables (api + workers), not three, and draw exactly one real seam — `VectorIndex` — because that is the only joint scale actually forces. Defensibility: not the cloneable algorithm but **ingestion breadth + accumulating per-user feedback data + workflow lock-in**, so connectors and the feedback spine are first-class from day one.

## 2. The stack

| Layer | Technology | Justification |
|---|---|---|
| Frontend | **Next.js (App Router) + React + TypeScript**, Tailwind + Radix/shadcn, TanStack Query, **TanStack Virtual** | Read-mostly product; SSR/streaming keeps import-progress and timeline fast; virtualization handles 10k+ note corpora. Web first, not Tauri — local-first's desktop+sync build risk is deferred, not bet on. |
| BFF / API | **Next.js Route Handlers** (auth, thin CRUD, search, feedback writes) | One repo for marketing + app + webhooks; zero LLM/embedding work on this path. |
| Engine + orchestration | **Python 3.12 + FastAPI**, packaged as an `engine/` library (`extract_facets / embed / retrieve_candidates / reason / verify`) | The moat is LLM/embedding orchestration + eval tooling — native Anthropic SDK, pgvector glue, harness all in one language. Library boundary makes it independently testable and promotable later. |
| Workers / queue | **Dramatiq on Redis** (one worker deployable + an APScheduler beat for nightly re-scan/digests) | Own the most volatile cost driver rather than handing per-step fan-out billing to a hosted workflow engine. Durable, idempotent, backpressure on mass imports. **Two deployables, not three** — fold the scheduler into the worker process. |
| Data store | **Single managed Postgres 16** + `pgvector` (HNSW) + `pg_trgm`, content-hash keyed | One system of record, one backup story. Per-tenant corpora are small (hundreds–low-thousands of notes); `user_id` filtering is mandatory on every query, which favors pgvector over a separate vector DB at this scale. |
| Object store | **S3 / Cloudflare R2** | Raw import blobs + extraction prompt/response audit trail. |
| Embeddings | **Hosted Voyage `voyage-3-large` (1024-d)** | Self-hosted bge-m3 rejected as a false economy that caps abstraction-space recall — the exact dimension the product lives on. Keep a `VectorIndex`-adjacent embed interface so a bake-off can swap later. |
| Models | **Anthropic API**: Haiku 4.5 (extraction), Sonnet 4.6 (both reasoning passes), Opus 4.8 (eval judge only) | Tiered routing through one `model_router` module; prompt choice/effort/version is config, not call sites. |
| Hosting | **Fly.io** (api + workers + managed Postgres), **Vercel** (Next.js frontend) | Cheap, scale-to-low, regional; 12-factor so an ECS/Fargate+RDS lift is mechanical when ARR justifies it. |

## 3. The connection engine pipeline

All stages async, idempotent, keyed by `(content_hash, model_version)`; no LLM/embedding call ever touches an HTTP write path.

1. **Facet extraction (per note, once, cached forever).** One **Haiku 4.5** call with a strict JSON schema → 0–5 typed facets `{causal_mechanism | tension_tradeoff | selection_incentive | temporal_dynamic | abstract_pattern}`, each a **domain-stripped abstraction statement** + salience 0..1. Notes yielding zero real facets are excluded from matching (first garbage filter). System/schema block is **prompt-cached** (~0.1x reads). **Tiered escalation:** escalate to Sonnet only when Haiku returns low-confidence/empty facets (<10% of notes).
2. **Abstraction embedding.** Embed each facet's abstraction text (not raw note) with **Voyage voyage-3-large** → `note_facets.facet_embedding`, HNSW index **partitioned by facet_type**. Embedding the abstraction is what lands topically-distant notes near each other.
3. **ANN candidate generation (no LLM).** For each facet, HNSW top-K (**K≈20**) within the **same facet_type**, same user only. Then the pruning that defines precision: (a) **exclude pairs whose topical embeddings are too close** (same-domain = not interesting — the topical vector is used inversely, to reject), (b) salience floor, (c) **generic-skeleton suppression**: IDF/genericness penalty + centroid-distance down-weighting; facets above a frequency threshold are demoted out of the matchable index entirely. Survivors: top ~5–8 per note.
4. **LLM reasoning.** Batched **Sonnet 4.6** (effort: medium) over survivors, given both notes' full text + matched facets → precise shared structure + one-sentence WHY, or `NO_CONNECTION`.
5. **Mandatory second-pass verifier.** A **separate Sonnet 4.6** call, **different prompt, no access to the reasoner's rationale** (decorrelated judgment — the proven Gate-1 mechanism), scores **validity 1–5** and **non-obviousness 1–5** independently, grounding every claim in the two notes. Verdicts cached per facet-pair-skeleton. *(Two separate calls; we do NOT group K candidates into one verifier call — that was a quality-for-margin trade the panel rejected.)*
6. **★ Quality gate.** `q = min(validity, nonobviousness)`. **Only `q>=3` is written as `surfaced`.** Sub-threshold pairs are stored hidden (for eval/threshold tuning), never shown. The gate is config, A/B-testable per cohort, held conservatively high at launch.

**Opus 4.8** appears only as the periodically-recalibrated LLM eval judge (§8), never per-pair.

### 3a. Edited notes & clustering (added for authored notes + the Organize tab)

- **Re-extraction on edit.** An authored note's edit changes its `content_hash`. Because every stage is keyed by `(content_hash, model_version)`, the new hash is simply a cache miss → facets re-extract, the note re-enters retrieval, and its connections recompute **neighborhood-scoped** (only this note vs the index — existing unrelated pairs are untouched). Stale connections tied to the old hash are tombstoned. Re-extraction is **debounced** (fires on save-settle, not per keystroke) so editing doesn't churn model spend.
- **Clustering (the Organize tab).** A separate worker job clusters each user's **topical note embeddings** (HDBSCAN, or k-means with auto-k) into themes; a single cheap **Haiku** call names each cluster. Runs after an import completes and on the nightly beat. Output is written to `note_clusters` (versioned) and is a *view* — it never mutates `notes`. This reuses vectors the engine already produces, so the marginal cost is the clustering compute + one Haiku label call per cluster.

## 4. The N² scaling solution

The all-pairs matrix is **never materialized**.
- **Per-tenant isolation:** connections are strictly intra-user, so there is no global N — only N_user separate small problems (hundreds–low-thousands of notes), trivially shardable by `user_id`.
- **ANN top-K, not all-pairs:** each facet retrieves only its K≈20 nearest neighbors via HNSW → cost ~N·K·log N, not N².
- **Type partitioning:** 5 facet-type indexes cut search space ~5x and raise precision (causal-to-causal only).
- **Generic-skeleton suppression** directly attacks the documented "false-match rate worsens with N" failure: IDF down-weighting + centroid-distance penalty + frequency-threshold quarantine of hub facets *before any LLM call*. **`false-match-rate vs corpus-size` is a first-class dashboard metric and the primary precision-decay canary.**
- **Incremental, neighborhood-scoped recompute:** a new note matches only against the existing index; existing pairs never re-scanned. A **per-pair lifetime dedup table** ensures a pair is judged at most once ever.
- **Bounded surfacing + adaptive K:** cap surfaced connections per note (~5); **hard per-import / per-user spend ceilings** degrade K gracefully on dense corpora rather than risking runaway spend.
- **One real seam:** the `VectorIndex` interface lets facet vectors promote to Qdrant only when a single power-user corpus or total vector count outgrows HNSW-in-Postgres.

## 5. Ingestion

Every path terminates in **one `normalize → enqueue` entrypoint**, so adding a source never touches the engine. Idempotent via `content_hash` (overlapping sources — same highlight in Kindle and Readwise — dedup and never double-bill).

**In-app authored notes are an ingestion source, not a special case.** A note written in the editor (§6.3) enters the exact same entrypoint as an import. This is what keeps the editor cheap to add: the engine doesn't know or care whether a note was typed or imported.

**Import connectors (priority order = breadth is the moat):**
1. **File-drop first** (no OAuth, unblocks everyone day one): Markdown/Obsidian zip, Kindle `My Clippings.txt`, Notion Markdown+CSV export, Evernote `.enex`, OneNote export.
2. **Readwise API** (clean official REST, richest highlights+metadata, the single best beachhead).
3. **Notion API** (OAuth).
4. Later: Apple Notes (user-run export / companion script), OneNote Graph API — the flaky native paths, deferred.

**Large libraries:** a **synchronous fast-lane** (non-batched Haiku) processes the first few hundred newest/highest-salience notes so the first insight lands in minutes; the **bulk rides the Anthropic Batches API (50% off, <1h)**. This resolves the 24h-batch-SLA vs. activation contradiction.

**Passive capture (v1.1, architected-for, reuses the identical pipeline):** browser extension clip + email-in address + mobile share-sheet → same normalize entrypoint.

## 6. UI/UX

**Six surfaces in v1.** Both **writing your own notes** and the **dynamic Organize tab** are first-class — the product is dump-and-connect, not read-only. The graph appears in v1 as a **local neighborhood view only**; the global force-directed graph (the "demo-candy, low-retention" version) stays deferred.

1. **Timeline (home):** notes in creation-date order, virtualized, instant. The stable home — notes never physically move; organization is computed views layered on top.
2. **★ Connected-notes card (the hero, in-context):** opening any note shows its 1–3 highest-q connections inline — partner-note snippet + one-sentence WHY + facet-type badge. Two one-click controls: **Useful** (upvote) and **dismiss/downvote** with optional reason — **`wrong` → validity label, `obvious` → non-obviousness label, `surface match` → third signal** (two-axis capture; turns one click into independent tuning signal for both verifier axes). Optimistic update; every action writes `connection_feedback`.
3. **Write editor (normal notes):** a rich editor (TipTap/ProseMirror) to author and edit notes in-app. An authored note is **just another ingestion source** — it flows into the *same* `normalize → enqueue → engine` pipeline as an import (no separate engine path). The only new behavior: an edit changes the note's `content_hash`, which **debounced-triggers re-extraction** of that note's facets and a neighborhood-scoped re-match (see §3a). The note's connected-notes card lights up as the engine finishes, so writing a note surfaces what it connects to.
4. **Dynamic Organize tab (dynamic notes):** an auto-clustered, theme-based view of the whole library. It is a **computed view, never a move** — the Timeline stays the stable home; clusters are a lens on top. It reuses the **topical embeddings the engine already computes** (the same vectors used in §3 to *reject* same-topic pairs), so it adds almost no new model cost. Re-clusters after import and on a nightly job. Users can pin/rename clusters; manual tags coexist with AI clusters (never forced to trust the AI to find a note).
5. **Local neighborhood graph (lite graph):** when viewing a note, a small force-directed graph centered on it — the note as the hub, its q≥3 connected notes as surrounding nodes (1–2 hops), edges colored/labeled by facet-type. It is a *visual expansion of the connected-notes card*, not a global map: capped to the local neighborhood so it never degrades into an unreadable hairball, and it reads directly from the `connections` edges the engine already produces (no new pipeline, no new model cost). Click a node to recenter. The **global force-directed graph of the whole library stays deferred** (commodity, low retention).
6. **Connections digest:** weekly "connections found in your library this week" email/feed — the re-engagement loop.

**Import → first-insight onboarding (the activation metric):**
1. Pick source → OAuth or file upload.
2. Live progress bar showing real work: notes imported → facets extracted → connections found (not a generic spinner).
3. Engine prioritizes a **high-signal recent/long-note slice through the fast-lane**, run at **verifier effort high, teaser threshold q>=4**, so the first impression is never garbage.
4. **The first verified connection surfaces inside the onboarding screen within ~2–3 minutes** — the aha arrives *before* the full import finishes.
5. Bulk corpus backfills via Batches; "Insights ready" badge as more clear the gate.

**Invariant — restraint as trust:** an empty rail is honest; a sub-`q3` connection is never shown. Quiet confidence over volume. Quality perception is binary and protected architecturally, not just in prompts.

## 7. Cost

**Tactics adopted:** (1) extraction cached once per unique note (content-hash); (2) prompt-caching on the frozen extraction + verifier system blocks (~0.1x reads); (3) Batches API 50% off for all non-latency-sensitive import work; (4) tiered routing — Haiku extraction, Sonnet both reasoning passes, **Opus only as eval judge**; (5) ANN + structural pre-filter winnow before any LLM token; (6) embed short abstraction text, not full notes; (7) per-pair lifetime dedup + adaptive K + hard per-import spend ceilings; (8) tiered Haiku→Sonnet escalation on hard notes only.

**Consensus estimate @ 1,000 active users: ~$1,300–1,900/month all-in (~$1.30–1.90/user/mo)** against a $15–40 seat → >85% gross margin.

| Line item | Est. monthly |
|---|---|
| Anthropic model spend (imports amortized ~$5–15/user one-time; steady-state ~$0.30–0.50/user/mo) | $500–900 |
| Embeddings (Voyage) | $50–100 |
| Managed Postgres + pgvector (RAM for HNSW) | $300–500 |
| Redis + workers (Fly) | $150–300 |
| Vercel + object store + email + Sentry | $150–250 |

**Biggest cost driver: one-time large imports** — bounded by the content-hash cache, per-import spend ceilings, adaptive K, and the Opus-free verifier path.

## 8. Eval / quality harness

First-class infrastructure; no automatic ground truth for analogy quality.
- **Golden set:** Gate-1 curated corpus + a growing human-rated set labeled on validity AND non-obviousness; version-controlled; the regression benchmark (target ≥75% precision, clean garbage cut at q≥3).
- **Versioned everything:** every connection stores `extractor/reasoner/verifier_model_version + prompt_hash + scores`; `prompt_versions` and `eval_runs` are tables. Any metric is sliceable by version; any historical judgment is reproducible.
- **Offline eval runner = deploy gate:** every prompt/model/threshold/K change runs the golden set in CI and **blocks merge** on a precision drop or garbage-rate rise. Runs on **model bumps too**, not just prompt edits (catches silent verifier-calibration drift).
- **Opus-4.8-as-judge,** periodically re-anchored against fresh human labels to detect judge drift; extends, never replaces, human labels.
- **Shadow mode:** new engine versions score the live candidate stream without surfacing, diffed against the incumbent before promotion.
- **Online signal:** every dismiss/upvote (two-axis reasons) is a label; per-cohort, per-facet-type, per-user precision tracked. **`false-match-rate vs corpus-size`** is the scale-decay canary; `cost-per-surfaced-connection` and `Opus-calls-per-note` tracked as co-equal metrics so neither quality nor cost silently regresses.

## 9. Phased build plan

**v0 — spike-to-product (the moat, headless).** Harden the Gate-1 engine as the `engine/` library: extraction → embedding → type-partitioned ANN → reasoner → independent verifier → q≥3 gate, all keyed by content_hash + model_version. Stand up Postgres+pgvector schema, the golden-set offline eval runner wired into CI, and the prompt/version tables. No UI yet; validate ≥75% precision reproducibly on real heterogeneous libraries.

**v1 — lovable product.** Next.js app with **six surfaces**: timeline + hero connected-notes card + **write editor (authored notes)** + **dynamic Organize tab** + **local neighborhood graph (lite)** + weekly digest. File-drop + **Readwise** + Notion importers; the **import→first-insight fast-lane + Batches bulk** flow; debounced re-extraction on note edit + neighborhood-scoped recompute; topical clustering job behind the Organize tab; two-axis dismiss/feedback writing to the spine; Dramatiq/Redis async pipeline; generic-skeleton suppression + per-import spend ceilings live; shadow mode + online precision dashboards.

**v2 — breadth, defensibility, scale.** Passive capture (browser extension, email-in, share-sheet); Apple Notes + OneNote connectors; per-user personalized re-ranker trained on accumulated feedback; **bring-your-own-API-key strict-privacy tier** (margin lever + privacy wedge for the researcher persona); promote `VectorIndex` to Qdrant if power-user corpora demand it. Deferred-until-demanded: the **global** force-directed graph of the whole library (the local neighborhood graph already ships in v1).

## 10. Top 3 open risks the architecture does NOT fully solve

1. **Generic-skeleton precision decay at large corpus size is mitigated, not proven.** IDF/centroid suppression and frequency-threshold quarantine are unvalidated at 50k+ notes/user; offline golden-corpus precision can look fine while a power-user's real rail fills with technically-valid-but-obvious connections — and the people this hurts most are exactly the people who pay. The live downvote-rate-per-facet-type is the only true alarm, and it lags. Over-correcting the suppression kills the genuinely-distant hits that are the entire value prop.
2. **Human-rated eval throughput is the binding constraint on iteration velocity.** Every prompt/model/threshold change gates on a labeling pipeline a 2–3 person team cannot fully staff. Opus-as-judge extends human capacity but can itself drift; if rater capacity can't keep pace, either iteration slows or regressions slip the CI gate.
3. **Defensibility is execution-dependent, not architectural.** The engine is cloneable; the moat is ingestion breadth + accumulated feedback + workflow lock-in — all of which compound only if connectors stay healthy (Apple Notes/OneNote/Evernote export paths are hostile and rot) and the feedback flywheel spins faster than a well-funded fast-follower's.
