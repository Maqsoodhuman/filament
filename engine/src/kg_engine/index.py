"""Vector index. `VectorIndex` is the one real seam the architecture keeps (swap to pgvector/Qdrant
later). v0 ships an in-memory numpy implementation, partitioned by facet type."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class _Entry:
    note_id: str
    facet_idx: int
    salience: float
    vec: np.ndarray


class VectorIndex:
    """Abstract seam."""

    def add(self, facet_type: str, note_id: str, facet_idx: int, salience: float,
            vec: list[float]) -> None:
        raise NotImplementedError

    def query(self, facet_type: str, vec: list[float], k: int) -> list[tuple[str, int, float]]:
        """Return up to k (note_id, facet_idx, cosine_sim) neighbors within the same facet type."""
        raise NotImplementedError

    def neighbors_within(self, facet_type: str, vec: list[float], radius: float) -> int:
        """Count entries whose cosine sim exceeds `radius` — used for hub/genericness detection."""
        raise NotImplementedError


class InMemoryVectorIndex(VectorIndex):
    def __init__(self) -> None:
        self._by_type: dict[str, list[_Entry]] = {}

    def add(self, facet_type, note_id, facet_idx, salience, vec) -> None:
        arr = np.asarray(vec, dtype=np.float32)
        n = float(np.linalg.norm(arr)) or 1.0
        self._by_type.setdefault(facet_type, []).append(
            _Entry(note_id, facet_idx, salience, arr / n)
        )

    def query(self, facet_type, vec, k) -> list[tuple[str, int, float]]:
        entries = self._by_type.get(facet_type, [])
        if not entries:
            return []
        q = np.asarray(vec, dtype=np.float32)
        q = q / (float(np.linalg.norm(q)) or 1.0)
        mat = np.vstack([e.vec for e in entries])
        sims = mat @ q
        order = np.argsort(-sims)[:k]
        return [(entries[i].note_id, entries[i].facet_idx, float(sims[i])) for i in order]

    def neighbors_within(self, facet_type: str, vec: list[float], radius: float) -> int:
        """Count entries whose cosine sim exceeds `radius` — used for hub/genericness detection."""
        entries = self._by_type.get(facet_type, [])
        if not entries:
            return 0
        q = np.asarray(vec, dtype=np.float32)
        q = q / (float(np.linalg.norm(q)) or 1.0)
        mat = np.vstack([e.vec for e in entries])
        return int((mat @ q >= radius).sum())
