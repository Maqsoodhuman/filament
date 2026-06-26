"""Caching + dedup. v0 is in-memory; the same interface maps onto Postgres tables later.

Everything is keyed by (content_hash, model_version) so an edited note (new hash) or a model/prompt
bump (new version) is a cache miss, while re-runs are free — the idempotency the architecture requires."""

from __future__ import annotations

from dataclasses import dataclass, field

from .models import Facet


@dataclass
class InMemoryStore:
    # (content_hash, model_version) -> facets (with embeddings)
    _facets: dict[tuple[str, str], list[Facet]] = field(default_factory=dict)
    # (content_hash, embed_version) -> the note's topical (whole-note) vector
    _topical: dict[tuple[str, str], list[float]] = field(default_factory=dict)
    # pairs already judged this run/version, so a pair is reasoned at most once ever
    _judged_pairs: set[tuple[str, str, str]] = field(default_factory=set)

    def get_facets(self, chash: str, model_version: str) -> list[Facet] | None:
        return self._facets.get((chash, model_version))

    def put_facets(self, chash: str, model_version: str, facets: list[Facet]) -> None:
        self._facets[(chash, model_version)] = facets

    def get_topical(self, chash: str, embed_version: str) -> list[float] | None:
        """Cached topical vector, keyed by (content_hash, embed_version) — never re-embedded on a
        read path nor when only a reason/verify prompt changes (D8)."""
        return self._topical.get((chash, embed_version))

    def put_topical(self, chash: str, embed_version: str, vec: list[float]) -> None:
        self._topical[(chash, embed_version)] = vec

    def is_seen(self, a_id: str, b_id: str, model_version: str) -> bool:
        """Pure read: has this pair already been judged for this model_version? No mutation,
        so read endpoints can call it without side effects (the seen_pair read-AND-mutate split)."""
        lo, hi = sorted((a_id, b_id))
        return (lo, hi, model_version) in self._judged_pairs

    def mark_seen(self, a_id: str, b_id: str, model_version: str) -> bool:
        """Atomically claim a pair. Returns True if newly claimed (caller should judge it),
        False if it was already seen (caller no-ops). Mirrors the PG ON CONFLICT DO NOTHING path."""
        lo, hi = sorted((a_id, b_id))
        key = (lo, hi, model_version)
        if key in self._judged_pairs:
            return False
        self._judged_pairs.add(key)
        return True

    def clear_dedup(self) -> None:
        """Drop the in-memory dedup set. Used only by the memory-mode dev read path, which
        re-runs the engine per request and must re-claim pairs each time (PROD reads persisted
        connections instead and never calls this)."""
        self._judged_pairs.clear()
