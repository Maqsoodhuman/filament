"""Wiring tests — run with the fake provider, no infra, no network.

These assert the pipeline plumbing (extraction -> embed -> index -> retrieve -> reason -> verify ->
q-gate), idempotent caching, and the topical-rejection prune. They do NOT assert semantic quality —
that is what the eval harness does against real local/API models.
"""

from __future__ import annotations

import collections
import json
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


def test_fake_surfaced_counts_are_not_uniform() -> None:
    # Data-sanity: the fake verifier returns a deterministic MIX of verdicts, so the per-note
    # surfaced connection counts must vary across the golden corpus (not the old "every card
    # shows the same number"). Also asserts no statement leaks the word "fake".
    golden = pathlib.Path(__file__).resolve().parents[1] / "data" / "golden" / "notes.json"
    data = json.loads(golden.read_text())
    notes = [
        Note(id=n["id"], title=n["title"], text=n["text"], domain=n.get("domain", ""))
        for n in data["notes"]
    ]
    eng = _engine()
    eng.ingest(notes)
    conns = eng.find_connections()

    per_note: collections.Counter[str] = collections.Counter()
    for c in conns:
        if c.surfaced:
            per_note[c.a_id] += 1
            per_note[c.b_id] += 1
    counts = {n.id: per_note[n.id] for n in notes}
    assert len(set(counts.values())) > 1, f"surfaced counts should vary, got {counts}"
    # the verifier actually suppresses some pairs (not all reasoned pairs surface)
    assert any(not c.surfaced for c in conns), "expected some pairs held below the q-gate"
    # no fake-provider artifact reaches a user-facing statement
    assert all("fake" not in c.statement.lower() for c in conns)


def test_topical_vector_cached_by_content_hash() -> None:
    # The topical vector is cached by (content_hash, embed_version), so re-ingesting the same note
    # (shared store) does ZERO model calls — no re-embed on a read path (D8). Facets are likewise
    # cached, so a full re-ingest is model-call-free.
    from kg_engine.index import InMemoryVectorIndex
    from kg_engine.store import InMemoryStore

    s = Settings(provider="fake")
    store = InMemoryStore()
    n = Note(id="a", title="A", text="threshold cascade tipping collapse")

    e1 = Engine(s, store=store, index=InMemoryVectorIndex())
    e1.ingest([n])
    assert store.get_topical(n.chash, s.embed_version()) is not None

    e2 = Engine(s, store=store, index=InMemoryVectorIndex())
    calls = {"embed": 0}
    orig = e2.router.embed
    e2.router.embed = lambda texts: (calls.__setitem__("embed", calls["embed"] + 1), orig(texts))[1]  # type: ignore[assignment]
    e2.ingest([n])
    assert calls["embed"] == 0, "facets + topical must come from cache; no re-embed on re-ingest"
    assert e2._topical["a"] == e1._topical["a"]


def test_topical_cache_survives_prompt_or_threshold_change() -> None:
    # embed_version keys ONLY on the embedder, so a q_threshold / prompt-style change (which moves
    # model_version) must NOT invalidate the topical cache.
    base = Settings(provider="fake")
    bumped = Settings(provider="fake", q_threshold=4)
    assert base.model_version() != bumped.model_version()  # config change moved model_version
    assert base.embed_version() == bumped.embed_version()  # but the embedder is unchanged


def test_spend_gate_coverage_not_k() -> None:
    # D1: adaptive-K degrades toward a floor as spend nears the ceiling, but NEVER to zero —
    # the ceiling throttles backfill over time, it does not drop corpus coverage.
    from kg_api.spend_gate import adaptive_k, within_ceiling

    assert adaptive_k(0, 999, 20) == 20          # ceiling disabled
    assert adaptive_k(10.0, 1.0, 20) == 20       # under 50% spend
    assert adaptive_k(10.0, 6.0, 20) == 10       # 60% → degrade to half
    assert adaptive_k(10.0, 9.5, 20) == 8        # ≥90% → floor (not 0)
    assert within_ceiling(0, 999)                # disabled = always allowed
    assert within_ceiling(10.0, 9.9)
    assert not within_ceiling(10.0, 10.0)


def test_eval_harness_runs() -> None:
    golden = pathlib.Path(__file__).resolve().parents[1] / "data" / "golden" / "notes.json"
    report, surfaced = run_eval(str(golden), Settings(provider="fake"))
    assert report.surfaced >= 0  # smoke: harness executes end to end


def test_eval_reports_ann_recall_and_two_gates() -> None:
    # B2: the report carries ANN recall@20, and the gate is two independent thresholds.
    golden = pathlib.Path(__file__).resolve().parents[1] / "data" / "golden" / "notes.json"
    report, _ = run_eval(str(golden), Settings(provider="fake"))
    assert report.ann_recall_at20 is not None and 0.0 <= report.ann_recall_at20 <= 1.0
    # the in-memory index IS exact brute force, so recall@20 must be perfect here
    assert report.ann_recall_at20 == 1.0
    # two-gate logic: a clean run passes; tightening either gate past the result fails it
    clean = run_eval(str(golden), Settings(provider="fake"))[0]
    assert clean.gate_passed(recall_floor=0.0, garbage_ceiling=clean.garbage_surfaced)
    assert not clean.gate_passed(recall_floor=1.1)  # impossible recall floor → fails
    assert not clean.gate_passed(garbage_ceiling=-1)  # impossible garbage ceiling → fails
