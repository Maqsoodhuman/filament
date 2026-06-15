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
    # pairs already judged this run/version, so a pair is reasoned at most once ever
    _judged_pairs: set[tuple[str, str, str]] = field(default_factory=set)

    def get_facets(self, chash: str, model_version: str) -> list[Facet] | None:
        return self._facets.get((chash, model_version))

    def put_facets(self, chash: str, model_version: str, facets: list[Facet]) -> None:
        self._facets[(chash, model_version)] = facets

    def seen_pair(self, a_id: str, b_id: str, model_version: str) -> bool:
        key = (*sorted((a_id, b_id)), model_version)
        if key in self._judged_pairs:
            return True
        self._judged_pairs.add(key)
        return False
