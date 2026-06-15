# Architecture Diagrams

Rendered with Mermaid. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full spec.

## 1. System architecture (end-to-end)

```mermaid
flowchart TB
    subgraph Client["🖥️ Client — Next.js (App Router) · 5 surfaces"]
        TL["Timeline (home)<br/>virtualized notes"]
        CC["★ Connected-notes card<br/>1-3 connections + WHY"]
        WR["Write editor<br/>author/edit notes"]
        OR["Dynamic Organize tab<br/>auto-clusters (computed view)"]
        DG["Weekly digest"]
        IMP["Import / onboarding UI"]
    end

    subgraph Edge["⚡ BFF — Next.js Route Handlers (Vercel)"]
        API["Auth · thin CRUD · search<br/>feedback writes<br/>(NO LLM work here)"]
    end

    subgraph Ingest["📥 Ingestion — one entrypoint for all sources"]
        AUTH["Authored notes<br/>(from Write editor)"]
        CONN["Connectors:<br/>file-drop · Readwise · Notion<br/>· Apple Notes · OneNote"]
        PASS["Passive capture (v1.1):<br/>extension · email-in · share-sheet"]
        NORM["normalize → enqueue<br/>(content_hash dedup)"]
    end

    subgraph Async["⚙️ Async workers — Dramatiq on Redis (Fly.io)"]
        Q[("Redis queue")]
        ENGINE["engine/ library (Python/FastAPI)<br/>extract → embed → retrieve → reason → verify → q-gate"]
        CLUST["Clustering job<br/>topical embeddings → themes<br/>(feeds Organize tab)"]
        SCHED["APScheduler beat<br/>nightly re-scan + digests"]
    end

    subgraph Data["🗄️ Data (Fly.io managed)"]
        PG[("Postgres 16<br/>+ pgvector HNSW + pg_trgm")]
        S3[("S3 / R2<br/>raw blobs + audit trail")]
    end

    subgraph Ext["🌐 External APIs"]
        ANTH["Anthropic<br/>Haiku · Sonnet · Opus"]
        VOY["Voyage<br/>voyage-3-large"]
    end

    subgraph Eval["🔬 Eval / quality harness"]
        GOLD["Golden set + human labels"]
        CI["CI deploy gate<br/>(blocks on precision drop)"]
        SHADOW["Shadow mode + dashboards"]
    end

    Client --> Edge
    WR -. "save (debounced)" .-> API
    AUTH --> NORM
    CONN --> NORM
    PASS --> NORM
    NORM --> Q
    Edge --> PG
    Q --> ENGINE
    SCHED --> Q
    SCHED --> CLUST
    ENGINE --> ANTH
    ENGINE --> VOY
    ENGINE --> PG
    ENGINE --> S3
    CLUST --> PG
    OR -. reads clusters .-> API
    CC -. "two-axis feedback" .-> API
    API -. writes .-> PG
    PG --> GOLD --> CI
    ENGINE -. candidate stream .-> SHADOW
```

## 2. The connection engine pipeline

```mermaid
flowchart LR
    N["📝 Note"] --> EX

    subgraph P["Connection engine — async, idempotent, keyed by (content_hash, model_version)"]
        EX["1 · Facet extraction<br/><b>Haiku 4.5</b>, cached forever<br/>0-5 typed facets + salience<br/>0 facets ⇒ excluded"]
        EM["2 · Abstraction embedding<br/><b>Voyage voyage-3-large</b><br/>embed ABSTRACTION not note<br/>HNSW partitioned by facet_type"]
        ANN["3 · ANN candidates (NO LLM)<br/>top-K≈20 same-type, same-user<br/>↓ prune:<br/>• reject topically-close pairs<br/>• salience floor<br/>• generic-skeleton suppression"]
        RE["4 · Reasoning<br/><b>Sonnet 4.6</b> (effort: med)<br/>shared structure + WHY<br/>or NO_CONNECTION"]
        VE["5 · Verifier (independent)<br/><b>Sonnet 4.6</b>, no access to<br/>reasoner rationale<br/>validity 1-5 · nonobvious 1-5"]
        QG{"6 · ★ Quality gate<br/>q = min(validity, nonobvious)"}
    end

    EX --> EM --> ANN --> RE --> VE --> QG
    QG -->|"q ≥ 3"| SURF["✅ surfaced → user"]
    QG -->|"q < 3"| HIDE["🗄️ stored hidden<br/>(eval / tuning only)"]

    OPUS["Opus 4.8<br/>(eval judge ONLY,<br/>never per-pair)"] -.periodic.-> VE
```

## 3. Import → first-insight onboarding (the activation moment)

```mermaid
sequenceDiagram
    actor U as User
    participant UI as Onboarding UI
    participant FL as Fast-lane (sync)
    participant BA as Batches API (bulk)
    participant E as Engine

    U->>UI: Pick source (OAuth / file upload)
    UI->>FL: high-signal recent slice
    UI->>BA: bulk corpus
    FL->>E: extract + connect (effort high, q≥4 teaser)
    Note over E: ~2-3 min
    E-->>UI: first verified connection
    UI-->>U: 💡 "Your note on X and your note on Y<br/>share the same mechanism"
    Note over U: aha BEFORE import finishes
    BA->>E: bulk backfill (50% off, <1h)
    E-->>UI: "Insights ready" badge as more clear q≥3
```

## 4. The N² scaling solution

```mermaid
flowchart TB
    A["All-pairs N² matrix"] -->|"NEVER materialized"| B["Bounded work"]
    B --> C["Per-tenant isolation<br/>intra-user only → many small problems<br/>shardable by user_id"]
    B --> D["ANN top-K not all-pairs<br/>~N·K·log N"]
    B --> E["Type partitioning<br/>5 indexes, causal→causal only"]
    B --> F["Generic-skeleton suppression<br/>BEFORE any LLM call<br/>(IDF + centroid + hub quarantine)"]
    B --> G["Incremental recompute<br/>+ lifetime per-pair dedup"]
    B --> H["Adaptive K + hard spend ceilings"]
    F --> M["📊 canary: false-match-rate vs corpus-size"]
```
