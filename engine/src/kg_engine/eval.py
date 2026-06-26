"""Eval harness. Runs the engine over a labeled golden set and reports precision / recall / garbage.

Golden file (JSON):
  {
    "notes": [{"id","title","text","domain"}, ...],
    "genuine_pairs":  [["id1","id2"], ...],   # known good cross-domain connections
    "garbage_pairs":  [["id3","id4"], ...]    # known forced/topical non-connections
  }
With local models this is the real precision check; with the fake provider it only smoke-tests wiring.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .config import Settings
from .models import Note
from .pipeline import Engine


def _key(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted((a, b)))  # type: ignore[return-value]


def _ann_recall_at20(engine, k: int = 20) -> float | None:
    """Mean recall@k of the engine's ANN index vs a brute-force exact-cosine top-k, per facet,
    within each facet_type. Biased-for-recall is the moat (topically-distant structural matches),
    so a drop here is a silent precision killer (HNSW post-filter under-return). Reported by the
    eval gate alongside precision/garbage."""
    import numpy as np

    by_type: dict[str, list[tuple[str, int, np.ndarray]]] = {}
    for nid, facets in engine._facets.items():
        for f in facets:
            if f.facet_vec:
                by_type.setdefault(f.type, []).append(
                    (nid, f.idx, np.asarray(f.facet_vec, dtype=np.float32))
                )

    recalls: list[float] = []
    for ftype, entries in by_type.items():
        if len(entries) < 2:
            continue
        mat = np.vstack([e[2] for e in entries])
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        matn = mat / norms
        for nid, _idx, vec in entries:
            q = vec / (float(np.linalg.norm(vec)) or 1.0)
            order = np.argsort(-(matn @ q))
            brute_top = set(
                [(entries[i][0], entries[i][1]) for i in order if entries[i][0] != nid][:k]
            )
            if not brute_top:
                continue
            got = {
                (n, fi)
                for (n, fi, _s) in engine.index.query(ftype, list(vec), k + 1)
                if n != nid
            }
            recalls.append(len(brute_top & got) / len(brute_top))
    return sum(recalls) / len(recalls) if recalls else None


@dataclass
class EvalReport:
    surfaced: int
    genuine_total: int
    genuine_recalled: int
    garbage_surfaced: int
    labeled_surfaced: int
    precision: float | None
    ann_recall_at20: float | None = None  # ANN vs brute-force recall — the moat's retrieval guard

    def gate_passed(self, recall_floor: float = 0.5, garbage_ceiling: int = 0) -> bool:
        """Two INDEPENDENT gates (a single precision number hides regressions): enough genuine
        pairs recalled AND garbage held at/below the ceiling. Used by the CI deploy gate."""
        recall = (self.genuine_recalled / self.genuine_total) if self.genuine_total else 1.0
        return recall >= recall_floor and self.garbage_surfaced <= garbage_ceiling

    def render(self) -> str:
        prec = "n/a" if self.precision is None else f"{self.precision * 100:.0f}%"
        ann = "n/a" if self.ann_recall_at20 is None else f"{self.ann_recall_at20 * 100:.0f}%"
        return (
            f"surfaced={self.surfaced}  "
            f"genuine recalled={self.genuine_recalled}/{self.genuine_total}  "
            f"garbage surfaced={self.garbage_surfaced}  "
            f"precision(on labeled)={prec}  "
            f"ANN recall@20={ann}"
        )


def run_eval(path: str, settings: Settings | None = None) -> tuple[EvalReport, list]:
    data = json.loads(open(path).read())
    notes = [Note(**n) for n in data["notes"]]
    genuine = {_key(*p) for p in data.get("genuine_pairs", [])}
    garbage = {_key(*p) for p in data.get("garbage_pairs", [])}

    engine = Engine(settings or Settings())
    engine.ingest(notes)
    surfaced = engine.surfaced()

    surfaced_keys = {_key(c.a_id, c.b_id) for c in surfaced}
    recalled = len(genuine & surfaced_keys)
    garbage_hit = len(garbage & surfaced_keys)
    labeled_hit = len((genuine | garbage) & surfaced_keys)
    precision = (recalled / labeled_hit) if labeled_hit else None

    report = EvalReport(
        surfaced=len(surfaced),
        genuine_total=len(genuine),
        genuine_recalled=recalled,
        garbage_surfaced=garbage_hit,
        labeled_surfaced=labeled_hit,
        precision=precision,
        ann_recall_at20=_ann_recall_at20(engine),
    )
    return report, surfaced
