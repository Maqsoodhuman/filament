#!/usr/bin/env bash
# SKILL: eval-gate (ENGINE MERGE GATE)
# Run the golden-set harness; assert precision >= baseline AND garbage_surfaced == 0.
# q>=3 is enforced inside the engine (only q>=3 surfaces). Exits nonzero on any regression.
# Real quality gate runs on a real model: KG_PROVIDER=ollama (or anthropic). Fake proves wiring only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/engine"
source .venv/bin/activate
BASELINE="${KG_BASELINE_PRECISION:-0.75}"
python - "$BASELINE" <<'PY'
import sys, pathlib
from kg_engine.config import Settings
from kg_engine.eval import run_eval
baseline = float(sys.argv[1])
s = Settings()
report, _ = run_eval(str(pathlib.Path("data/golden/notes.json")), s)
print(report.render())
ok = report.garbage_surfaced == 0 and report.precision is not None and report.precision >= baseline
if s.provider == "fake":
    print("NOTE: fake provider proves WIRING ONLY, not quality. Run KG_PROVIDER=ollama for the real gate.")
print(f"GATE: {'PASS' if ok else 'FAIL'}  (baseline={baseline}, garbage must be 0, q>=3 enforced in-engine)")
sys.exit(0 if ok else 1)
PY
