# Knowledge Graph — Cross-Source Synthesis Instrument

> An AI tool that imports your existing reading library and surfaces **genuinely non-obvious, true, cross-domain connections** between your notes — connections that topical similarity alone can never find, because the notes are far apart in subject matter.

This is **not** a "second brain" note-taking app. It is a **synthesis instrument** for researchers, analysts, and non-fiction writers — people whose job is to find through-lines across everything they read.

```
"Your note on bacterial quorum sensing and your note on bank runs
 describe the same threshold-cascade mechanism."
```

## The core idea

Existing note apps (Notion, Obsidian, Roam, Mem) are either passive databases or require you to build links by hand. They connect notes by **topic similarity** — which only ever finds "two notes about coffee." The value here is the opposite: a **structural / analogical connection engine** that finds notes which share a *deep mechanism* despite living in totally different domains.

- **Moat:** the structural connection engine + ingestion breadth + accumulating per-user feedback. (The algorithm is cloneable; the data flywheel and connector breadth are not.)
- **Not the moat:** the graph visualization, topical similarity (both commodity).
- **Strategy:** import-first to kill cold-start, but you can also **write your own notes** and browse them via a **dynamic auto-Organize tab** — both feed the same engine. The hero surface is the in-context "connected notes" card (with a one-line *why*), with a **local neighborhood graph** around each note. Only the *global* graph of the whole library is deferred.

## Editions (open-core)

| | **Community** (open source, self-host) | **Premium** (hosted) |
|---|---|---|
| Models | Your own Ollama models | Managed Claude, eval-tuned |
| Connection finding | On-demand button | On-demand + background + weekly digest |
| Data | 100% local / private | Hosted (or bring-your-own-key) |
| Price | Free | $/seat |

**The engine runs on an explicit trigger** ("Find connections" / "Scan library"), never automatically on every note — cheap on local hardware, and full user control. Background auto-scan + proactive digests are the Premium retention lever.

## Validation status

| Gate | Question | Result |
|---|---|---|
| **Gate 1** (done) | Can the engine find genuinely non-obvious, true cross-domain links? | **PASS** — 75% precision on a blind 40-note / 8-domain corpus; a `q≥3` quality cut removed essentially all garbage. |
| **Gate 2** (pending) | Does it keep finding them on a real, un-curated corpus, at scale, over time? | Needs real user data — not yet run. |

See [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) for the full reasoning and experiment.

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The consensus reference architecture (stack, pipeline, scaling, cost, eval, build plan). |
| [docs/ARCHITECTURE_DIAGRAM.md](docs/ARCHITECTURE_DIAGRAM.md) | Visual system, pipeline, and ingestion diagrams (Mermaid). |
| [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) | Why this product / why this shape — the strategy debate consensus + the Gate-1 validation experiment. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased build plan (v0 → v1 → v2) and open risks. |

## Stack at a glance

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind/shadcn + TanStack Query/Virtual
- **API:** Next.js Route Handlers (thin BFF — no LLM work on this path)
- **Engine:** Python 3.12 + FastAPI `engine/` library, async via **Dramatiq on Redis**
- **Data:** managed **Postgres 16 + pgvector** (HNSW), S3/R2 for blobs
- **Models:** Anthropic — Haiku 4.5 (extraction) · Sonnet 4.6 (reasoning + verifier) · Opus 4.8 (eval judge only); **Voyage voyage-3-large** embeddings
- **Hosting:** Fly.io (api/workers/db) + Vercel (frontend)

## Status

Pre-code. Architecture is finalized; v0 (the headless engine library + eval harness) is the next build step.
