#!/usr/bin/env python
"""SKILL: scaffold-route (ENGINE lane).

Generate a FastAPI APIRouter module + Pydantic request/response models + a test stub.
  scaffold-route.py <name>        # create routes/<name>.py + tests/test_route_<name>.py
  scaffold-route.py --self-test   # create a throwaway route, assert pytest collects it, clean up

Verify (gate): pytest collects the new test and the router imports with at least one registered route.
Run inside the engine venv (so kg_api/pytest are importable).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "engine" / "src" / "kg_api" / "routes"
TESTS = ROOT / "engine" / "tests"

ROUTER_TMPL = '''"""Auto-scaffolded router for {name}. Replace the stub with the real handler."""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/{name}", tags=["{name}"])


class {Cap}Response(BaseModel):
    ok: bool = True


@router.get("", response_model={Cap}Response)
def get_{name}() -> {Cap}Response:
    return {Cap}Response()
'''

TEST_TMPL = '''from kg_api.routes.{name} import router


def test_{name}_router_registered() -> None:
    paths = [r.path for r in router.routes]
    assert any("/{name}" in p for p in paths)
'''


def scaffold(name: str) -> None:
    ROUTES.mkdir(parents=True, exist_ok=True)
    (ROUTES / "__init__.py").touch()
    (ROUTES / f"{name}.py").write_text(ROUTER_TMPL.format(name=name, Cap=name.title().replace("_", "")))
    (TESTS / f"test_route_{name}.py").write_text(TEST_TMPL.format(name=name))
    print(f"scaffolded routes/{name}.py + tests/test_route_{name}.py")


def self_test() -> None:
    name = "scaffoldselftest"
    scaffold(name)
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", str(TESTS / f"test_route_{name}.py")],
            cwd=str(ROOT / "engine"),
        )
        ok = r.returncode == 0
    finally:
        (ROUTES / f"{name}.py").unlink(missing_ok=True)
        (TESTS / f"test_route_{name}.py").unlink(missing_ok=True)
    print("scaffold-route self-test:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    if sys.argv[1] == "--self-test":
        self_test()
    else:
        scaffold(sys.argv[1])
