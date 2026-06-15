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


@dataclass
class EvalReport:
    surfaced: int
    genuine_total: int
    genuine_recalled: int
    garbage_surfaced: int
    labeled_surfaced: int
    precision: float | None

    def render(self) -> str:
        prec = "n/a" if self.precision is None else f"{self.precision * 100:.0f}%"
        return (
            f"surfaced={self.surfaced}  "
            f"genuine recalled={self.genuine_recalled}/{self.genuine_total}  "
            f"garbage surfaced={self.garbage_surfaced}  "
            f"precision(on labeled)={prec}"
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
    )
    return report, surfaced
