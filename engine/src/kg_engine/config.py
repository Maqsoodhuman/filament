"""Runtime configuration. Everything is env-overridable so local LLMs are a config swap."""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass

from .prompts import PROMPT_VERSION

# The five typed structural facets the engine extracts (domain-neutral).
FACET_TYPES = [
    "causal_mechanism",
    "tension_tradeoff",
    "selection_incentive",
    "temporal_dynamic",
    "abstract_pattern",
]


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


@dataclass
class Settings:
    """All knobs in one place. Defaults run fully local on Ollama."""

    # provider: "fake" (no infra, deterministic), "ollama" (local), "anthropic" (API)
    provider: str = _env("KG_PROVIDER", "fake")

    # store/index backend: "memory" (default, no infra) | "postgres" (pgvector). When "postgres",
    # DATABASE_URL must point at a migrated DB (see migrations 0001+0002). The backend swap does
    # not change pipeline behavior — it is the same store/index interface.
    store_backend: str = _env("KG_STORE_BACKEND", "memory")
    database_url: str = _env("DATABASE_URL", "")
    # async substrate seam (D1): "memory" (in-process, dev/test) | "postgres" (SKIP LOCKED worker)
    # | "redis" (Dramatiq distributes a drain signal; the PG jobs table is the durable outbox)
    queue_backend: str = _env("KG_QUEUE", "memory")
    redis_url: str = _env("KG_REDIS_URL", "redis://localhost:6379/0")
    # auth chokepoint (D3): "none" (loopback single user) | "local" (bearer token) | "clerk" (JWT)
    auth: str = _env("KG_AUTH", "none")
    local_user_id: str = _env("KG_LOCAL_USER", "u_local")
    local_token: str = _env("KG_LOCAL_TOKEN", "")
    # observability seam (D9): "postgres" (stage_events table) | "otel" (deferred) | "off"
    observability: str = _env("KG_OBSERVABILITY", "postgres")
    # bulk-import lane (D1): "sync" (rate-governed fast-lane) | "batch" (Anthropic Batches, deferred)
    bulk_lane: str = _env("KG_BULK_LANE", "sync")
    # per-user spend ceiling in USD (0 = disabled). Throttles backfill over TIME via adaptive-K —
    # never silently drops corpus coverage (the coverage-not-K invariant).
    spend_ceiling_usd: float = float(_env("KG_SPEND_CEILING_USD", "0"))
    # DB-scale seam (D2): route read-only queries here when set (replica lag is acceptable per the
    # eventual-consistency model). Empty = single primary.
    read_replica_url: str = _env("KG_READ_REPLICA_URL", "")
    # HNSW recall knob, honored per-query via SET LOCAL hnsw.ef_search (postgres backend only).
    ef_search: int = int(_env("KG_EF_SEARCH", "100"))

    # local (Ollama) model assignments per pipeline role
    ollama_host: str = _env("OLLAMA_HOST", "http://localhost:11434")
    extract_model: str = _env("KG_EXTRACT_MODEL", "qwen2.5:7b")
    reason_model: str = _env("KG_REASON_MODEL", "llama3.1:8b")
    verify_model: str = _env("KG_VERIFY_MODEL", "qwen2.5:14b")
    embed_model: str = _env("KG_EMBED_MODEL", "nomic-embed-text")

    # Anthropic assignments (used only when provider="anthropic"). Use bare aliases, not dated ids.
    anthropic_extract_model: str = _env("KG_ANTHROPIC_EXTRACT", "claude-haiku-4-5")
    anthropic_reason_model: str = _env("KG_ANTHROPIC_REASON", "claude-sonnet-4-6")
    anthropic_verify_model: str = _env("KG_ANTHROPIC_VERIFY", "claude-sonnet-4-6")

    # retrieval + gating
    top_k: int = int(_env("KG_TOP_K", "20"))
    q_threshold: int = int(_env("KG_Q_THRESHOLD", "3"))
    salience_floor: float = float(_env("KG_SALIENCE_FLOOR", "0.35"))
    # reject a candidate pair whose TOPICAL embeddings are closer than this (same-topic = boring).
    # Raised 0.82→0.92 by the floor experiment (B1): 0.82 wrongly rejected metaphor-sharing
    # cross-domain analogies (genuine recall 0/4 → 1/4, labeled precision 0%→50%, garbage flat).
    # Final tuning belongs on the managed models (local verifiers cap the rest of the recall gap).
    topical_reject: float = float(_env("KG_TOPICAL_REJECT", "0.92"))
    # a facet whose abstraction has more than this many tight neighbors is a generic "hub" -> quarantined
    hub_quarantine: int = int(_env("KG_HUB_QUARANTINE", "10"))
    hub_radius: float = float(_env("KG_HUB_RADIUS", "0.90"))
    max_surfaced_per_note: int = int(_env("KG_MAX_SURFACED", "5"))

    # fake-provider embedding dimension (real embeds set their own dim)
    fake_dim: int = 96

    def model_version(self) -> str:
        """Cache/provenance key. Bumps implicitly whenever models, prompts, OR the retrieval/gate
        config change — otherwise a threshold tweak would silently serve stale cached connections
        under an unchanged version stamp (backend-guide change #3)."""
        models = "|".join(
            [
                self.provider,
                self.extract_model,
                self.reason_model,
                self.verify_model,
                self.embed_model,
                self.anthropic_extract_model,
                self.anthropic_reason_model,
                self.anthropic_verify_model,
                PROMPT_VERSION,
            ]
        )
        return "mv_" + hashlib.sha256(f"{models}#{self.config_hash()}".encode()).hexdigest()[:12]

    def embed_version(self) -> str:
        """Identity of the EMBEDDER only (model + dimension). The topical-vector cache keys on
        this, NOT model_version — so a reason/verify prompt or q-threshold bump never re-embeds the
        whole corpus (backend-guide D8). Mirrors the router's embedder selection."""
        embedder = f"fake-{self.fake_dim}" if self.provider == "fake" else self.embed_model
        return "emb_" + hashlib.sha256(embedder.encode()).hexdigest()[:10]

    def config_hash(self) -> str:
        """Hash of everything that changes engine OUTPUT besides the models/prompts: retrieval +
        gating knobs and the embedding dimension (768-d local and 1024-d Voyage cannot be mixed)."""
        basis = "|".join(
            str(x)
            for x in (
                self.top_k,
                self.q_threshold,
                self.salience_floor,
                self.topical_reject,
                self.hub_quarantine,
                self.hub_radius,
                self.max_surfaced_per_note,
                # embedding dim is provider-determined; fake is explicit, real is named by embed_model
                self.fake_dim if self.provider == "fake" else self.embed_model,
            )
        )
        return "cfg_" + hashlib.sha256(basis.encode()).hexdigest()[:10]
