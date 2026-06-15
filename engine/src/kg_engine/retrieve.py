"""Stage 3: candidate generation (no LLM) + the pruning that defines precision.

Pruning, in order (ARCHITECTURE.md 3):
  (a) same-note / same-facet self-matches dropped
  (b) salience floor
  (c) generic-skeleton suppression — a facet that is a tight "hub" (matches too many others)
      is quarantined before it can spew false matches
  (d) topical rejection — pairs whose NOTE-LEVEL (topical) embeddings are too close are dropped
      (same topic = not interesting; the topical vector is used inversely, to reject)
"""

from __future__ import annotations

import numpy as np

from .config import Settings
from .index import InMemoryVectorIndex
from .models import Candidate, Facet


def _cos(a: list[float], b: list[float]) -> float:
    va, vb = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    na, nb = float(np.linalg.norm(va)), float(np.linalg.norm(vb))
    if na == 0 or nb == 0:
        return 0.0
    return float(va @ vb / (na * nb))


def candidates_for_note(
    note_id: str,
    facets: list[Facet],
    index: InMemoryVectorIndex,
    topical_vecs: dict[str, list[float]],
    settings: Settings,
) -> list[Candidate]:
    out: dict[tuple[str, str], Candidate] = {}
    a_topical = topical_vecs[note_id]

    for f in facets:
        if f.salience < settings.salience_floor:  # (b)
            continue
        # (c) generic-skeleton suppression: quarantine hub facets before they match anything.
        if index.neighbors_within(f.type, f.facet_vec, settings.hub_radius) > settings.hub_quarantine:
            continue

        for nb_id, _nb_idx, sim in index.query(f.type, f.facet_vec, settings.top_k):
            if nb_id == note_id:  # (a)
                continue
            # (d) reject same-topic pairs using the inverse of topical similarity
            if _cos(a_topical, topical_vecs[nb_id]) >= settings.topical_reject:
                continue
            key = tuple(sorted((note_id, nb_id)))
            prev = out.get(key)
            if prev is None or sim > prev.sim:
                out[key] = Candidate(
                    a_id=note_id,
                    b_id=nb_id,
                    facet_type=f.type,
                    a_abstraction=f.abstraction,
                    b_abstraction="",  # filled by caller (it holds the neighbor's facets)
                    sim=sim,
                )
    # keep the strongest few per note
    ranked = sorted(out.values(), key=lambda c: -c.sim)
    return ranked[: settings.max_surfaced_per_note + 3]
