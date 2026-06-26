"""Bulk-import spend gate + adaptive-K (D1).

The hard rule is the **coverage-not-K invariant**: a per-user/per-import spend ceiling throttles
backfill over TIME (by degrading how many candidates each note reasons against), but it must NEVER
silently leave the corpus un-connected. So `adaptive_k` degrades toward a floor (never to zero), and
`within_ceiling` only pauses further *paid* work for this window — the remaining notes are picked up
on the next scan, not dropped.

Cost is read from the per-pair `cost_usd` the verifier/reasoner stamp (null until a metered provider
reports), so on the fake/Ollama paths this is a dormant-but-correct seam. The Batches lane
(`KG_BULK_LANE=batch`) is deferred — it is Anthropic-specific and a one-time-import margin lever."""

from __future__ import annotations

_K_FLOOR = 8  # never reason against fewer than this — preserves coverage on dense corpora


def adaptive_k(spend_ceiling_usd: float, spent_usd: float, base_k: int) -> int:
    """Degrade top_k as per-user spend approaches the ceiling, down to a floor (not zero)."""
    if spend_ceiling_usd <= 0:
        return base_k  # ceiling disabled
    frac = spent_usd / spend_ceiling_usd
    if frac < 0.5:
        return base_k
    if frac < 0.9:
        return max(base_k // 2, _K_FLOOR)
    return _K_FLOOR


def within_ceiling(spend_ceiling_usd: float, spent_usd: float) -> bool:
    """True if more paid work is allowed in this window. False pauses backfill (resumes next scan) —
    it does NOT drop notes (coverage-not-K)."""
    return spend_ceiling_usd <= 0 or spent_usd < spend_ceiling_usd
