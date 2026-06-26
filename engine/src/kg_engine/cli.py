"""Command line: run the engine on a folder of notes, or run the eval harness.

    kg-engine run   <dir>           # ingest .md/.txt files, print surfaced connections
    kg-engine eval  [golden.json]   # run the labeled eval set and print metrics

Provider/model are env-driven (see config.py / .env.example). Defaults to the fake provider so it
runs with no infra; set KG_PROVIDER=ollama for real local models.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import Settings
from .eval import run_eval
from .models import Note
from .pipeline import Engine


def _load_dir(path: str) -> list[Note]:
    notes = []
    for i, p in enumerate(sorted(Path(path).glob("**/*"))):
        if p.suffix.lower() not in {".md", ".txt"}:
            continue
        text = p.read_text(encoding="utf-8", errors="ignore").strip()
        if not text:
            continue
        notes.append(Note(id=f"n{i}", title=p.stem, text=text, domain=p.parent.name))
    return notes


def _print_conns(conns) -> None:
    if not conns:
        print("(no connections surfaced — empty rail is honest)")
        return
    for c in conns:
        print(f"\n[q{c.q} · {c.facet_type}]  {c.a_title}  <->  {c.b_title}")
        print(f"  validity={c.validity} nonobvious={c.nonobviousness} generic={c.generic}")
        print(f"  {c.statement}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="kg-engine")
    sub = ap.add_subparsers(dest="cmd", required=True)
    pr = sub.add_parser("run", help="ingest a folder of notes and surface connections")
    pr.add_argument("dir")
    pe = sub.add_parser("eval", help="run the labeled golden eval set")
    default_golden = str(Path(__file__).resolve().parents[2] / "data" / "golden" / "notes.json")
    pe.add_argument("golden", nargs="?", default=default_golden)
    args = ap.parse_args(argv)

    settings = Settings()
    print(f"provider={settings.provider}  model_version={settings.model_version()}", file=sys.stderr)

    if args.cmd == "run":
        notes = _load_dir(args.dir)
        print(f"ingesting {len(notes)} notes…", file=sys.stderr)
        engine = Engine(settings)
        engine.ingest(notes)
        _print_conns(engine.surfaced())
        return 0

    if args.cmd == "eval":
        report, surfaced = run_eval(args.golden, settings)
        _print_conns(surfaced)
        print("\n=== eval ===")
        print(report.render())
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
