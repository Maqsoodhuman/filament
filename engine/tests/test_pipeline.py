"""Wiring tests — run with the fake provider, no infra, no network.

These assert the pipeline plumbing (extraction -> embed -> index -> retrieve -> reason -> verify ->
q-gate), idempotent caching, and the topical-rejection prune. They do NOT assert semantic quality —
that is what the eval harness does against real local/API models.
"""

from __future__ import annotations

import pathlib

from kg_engine import Engine, Note, Settings
from kg_engine.eval import run_eval


def _engine() -> Engine:
    return Engine(Settings(provider="fake"))


def test_ingest_extracts_and_indexes() -> None:
    eng = _engine()
    eng.ingest([Note(id="a", title="A", text="threshold cascade tipping point collapse")])
    assert eng._facets["a"], "expected at least one facet"
    assert all(f.facet_vec for f in eng._facets["a"]), "facets should be embedded"
    assert "a" in eng._topical


def test_connection_surfaces_between_similar_notes() -> None:
    eng = _engine()
    eng.ingest([
        Note(id="a", title="Quorum sensing", text="threshold density colony switches behavior cascade"),
        Note(id="b", title="Bank runs", text="threshold withdrawals confidence collapses cascade flip"),
    ])
    conns = eng.find_connections()
    assert conns, "expected the two threshold notes to produce a candidate connection"
    c = conns[0]
    assert c.q >= 3 and c.surfaced  # fake verifier returns validity=nonobvious=4


def test_identical_topic_is_rejected() -> None:
    # Two near-identical notes are topically too close -> pruned before reasoning.
    eng = Engine(Settings(provider="fake", topical_reject=0.5))
    eng.ingest([
        Note(id="a", title="A", text="alpha beta gamma delta epsilon"),
        Note(id="b", title="B", text="alpha beta gamma delta epsilon"),
    ])
    assert eng.find_connections() == []


def test_facets_cached_by_content_hash() -> None:
    eng = _engine()
    n = Note(id="a", title="A", text="threshold cascade tipping collapse")
    eng.ingest([n])
    assert eng.store.get_facets(n.chash, eng.mv) is not None


def test_fake_extraction_emits_varied_facet_types() -> None:
    # The fake provider must emit >=2 DISTINCT facet types for a multi-word note, so the wiring
    # path produces varied connection KINDs (not only "same topic" from a lone abstract_pattern).
    eng = _engine()
    facets = eng.router.extract(
        "...extract the STRUCTURAL facets...",
        "central bank precommit binding rule discretion inflation",
    )["facets"]
    types = [f["type"] for f in facets]
    assert len(set(types)) >= 2, f"expected >=2 distinct facet types, got {types}"
    # determinism: same input -> same facet types
    again = eng.router.extract(
        "...extract the STRUCTURAL facets...",
        "central bank precommit binding rule discretion inflation",
    )["facets"]
    assert [f["type"] for f in again] == types
    # primary facet stays at/above the salience floor so it always survives retrieval
    assert facets[0]["salience"] >= Settings().salience_floor


def test_eval_harness_runs() -> None:
    golden = pathlib.Path(__file__).resolve().parents[1] / "data" / "golden" / "notes.json"
    report, surfaced = run_eval(str(golden), Settings(provider="fake"))
    assert report.surfaced >= 0  # smoke: harness executes end to end
