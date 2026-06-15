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

    # local (Ollama) model assignments per pipeline role
    ollama_host: str = _env("OLLAMA_HOST", "http://localhost:11434")
    extract_model: str = _env("KG_EXTRACT_MODEL", "qwen2.5:7b")
    reason_model: str = _env("KG_REASON_MODEL", "llama3.1:8b")
    verify_model: str = _env("KG_VERIFY_MODEL", "qwen2.5:14b")
    embed_model: str = _env("KG_EMBED_MODEL", "nomic-embed-text")

    # Anthropic assignments (used only when provider="anthropic")
    anthropic_extract_model: str = _env("KG_ANTHROPIC_EXTRACT", "claude-haiku-4-5-20251001")
    anthropic_reason_model: str = _env("KG_ANTHROPIC_REASON", "claude-sonnet-4-6")
    anthropic_verify_model: str = _env("KG_ANTHROPIC_VERIFY", "claude-sonnet-4-6")

    # retrieval + gating
    top_k: int = int(_env("KG_TOP_K", "20"))
    q_threshold: int = int(_env("KG_Q_THRESHOLD", "3"))
    salience_floor: float = float(_env("KG_SALIENCE_FLOOR", "0.35"))
    # reject a candidate pair whose TOPICAL embeddings are closer than this (same-topic = boring)
    topical_reject: float = float(_env("KG_TOPICAL_REJECT", "0.82"))
    # a facet whose abstraction has more than this many tight neighbors is a generic "hub" -> quarantined
    hub_quarantine: int = int(_env("KG_HUB_QUARANTINE", "10"))
    hub_radius: float = float(_env("KG_HUB_RADIUS", "0.90"))
    max_surfaced_per_note: int = int(_env("KG_MAX_SURFACED", "5"))

    # fake-provider embedding dimension (real embeds set their own dim)
    fake_dim: int = 96

    def model_version(self) -> str:
        """Cache key component. Bump implicitly whenever models or prompts change."""
        basis = "|".join(
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
        return "mv_" + hashlib.sha256(basis.encode()).hexdigest()[:12]
