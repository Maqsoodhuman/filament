"""Model providers behind one interface, so swapping local<->API is a config change.

- FakeProvider:   deterministic, no network. Lets the whole pipeline + tests run with zero infra.
- OllamaProvider: local models via the Ollama REST API.
- AnthropicProvider: Claude via the anthropic SDK (optional dependency).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Protocol

# Domain-neutral facet types the fake provider deterministically rotates through, so the
# wiring path produces VARIED connection KINDs (not only "same topic" from abstract_pattern).
# Mirrors config.FACET_TYPES; kept inline to avoid a config import in the provider layer.
_FAKE_FACET_TYPES = (
    "causal_mechanism",
    "tension_tradeoff",
    "selection_incentive",
    "temporal_dynamic",
    "abstract_pattern",
)

_TOKEN = re.compile(r"[a-z0-9]+")

# Tokens too common/structural to be "salient" — kept out of generated statements and overlap.
_STOP = frozenset(
    "the a an and or but of to in on at by for with as is are was were be been being "
    "this that these those it its their his her they them we you i he she who whom "
    "into onto from up down out off over under again than then so not no nor can will "
    "would could should may might must do does did has have had note notes a b".split()
)


def _stable_hash(s: str) -> int:
    """Deterministic, process-independent hash (Python's hash() is salted per run)."""
    return int(hashlib.sha256(s.encode()).hexdigest(), 16)


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def _salient(text: str) -> list[str]:
    """Content tokens (deduped, order-preserving) usable in a human-facing statement."""
    seen: set[str] = set()
    out: list[str] = []
    for t in _tokens(text):
        if len(t) > 3 and t not in _STOP and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _split_notes(user: str) -> tuple[str, str]:
    """Pull the two note bodies out of a reasoning/verifier user message.

    Both REASON_USER and VERIFY_USER lay the notes out as `NOTE A ...:` / `NOTE B ...:`.
    Falls back to splitting the whole message in half if the markers are absent.
    """
    ia = user.find("NOTE A")
    ib = user.find("NOTE B")
    if ia != -1 and ib != -1 and ib > ia:
        a = user[ia:ib]
        b = user[ib:]
        # drop everything up to the first ':' on each marker line (the "NOTE A (domain):" prefix)
        a = a.split(":", 1)[1] if ":" in a else a
        b = b.split(":", 1)[1] if ":" in b else b
        return a, b
    mid = len(user) // 2
    return user[:mid], user[mid:]


class Provider(Protocol):
    def chat_json(self, system: str, user: str, model: str) -> dict: ...
    def embed(self, texts: list[str], model: str) -> list[list[float]]: ...


# ---------------------------------------------------------------------------


class FakeProvider:
    """Deterministic stand-in. Embeddings are hashed bag-of-words so that texts sharing
    vocabulary land near each other — enough to exercise retrieval + the q-gate in tests."""

    def __init__(self, dim: int = 96) -> None:
        self.dim = dim

    def embed(self, texts: list[str], model: str) -> list[list[float]]:
        out = []
        for t in texts:
            v = [0.0] * self.dim
            for tok in _tokens(t):
                h = int(hashlib.sha256(tok.encode()).hexdigest(), 16)
                v[h % self.dim] += 1.0
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out

    def chat_json(self, system: str, user: str, model: str) -> dict:
        # Route by recognizable cues in the system prompt.
        if "extract the STRUCTURAL facets" in system:
            toks = sorted(set(t for t in _tokens(user) if len(t) > 3))[:6]
            if not toks:
                return {"facets": []}
            # The abstraction is still the note's salient tokens, so two notes that share
            # vocabulary land near each other in abstraction space (retrieval still works).
            abstraction = " ".join(toks)
            # Deterministically pick the PRIMARY facet type from that same abstraction string, so
            # similar notes choose the SAME type (and thus match on a varied KIND, not only "topic").
            primary_type = _FAKE_FACET_TYPES[_stable_hash(abstraction) % len(_FAKE_FACET_TYPES)]
            facets = [
                {"type": primary_type, "abstraction": abstraction, "salience": 0.8}
            ]
            # Emit 1-2 SECONDARY facets of distinct types over salient-token subsets, so a
            # multi-word note carries >=2 facet types. Each abstraction is still token-derived
            # (so it can still match a like-abstraction on another note) and stays above the floor.
            if len(toks) >= 2:
                second_abstraction = " ".join(toks[: max(2, len(toks) - 2)])
                second_type = _FAKE_FACET_TYPES[
                    (_stable_hash(second_abstraction) + 1) % len(_FAKE_FACET_TYPES)
                ]
                if second_type == primary_type:  # guarantee distinctness
                    second_type = _FAKE_FACET_TYPES[
                        (_FAKE_FACET_TYPES.index(primary_type) + 1) % len(_FAKE_FACET_TYPES)
                    ]
                facets.append(
                    {"type": second_type, "abstraction": second_abstraction, "salience": 0.6}
                )
            if len(toks) >= 4:
                third_abstraction = " ".join(toks[-3:])
                used = {primary_type, facets[1]["type"]}
                unused = [t for t in _FAKE_FACET_TYPES if t not in used]
                # always non-empty (5 types, at most 2 used); pick deterministically
                third_type = unused[_stable_hash(third_abstraction) % len(unused)]
                facets.append(
                    {"type": third_type, "abstraction": third_abstraction, "salience": 0.55}
                )
            return {"facets": facets}
        if "skeptical reviewer" in system:
            return self._fake_verify(user)
        # reasoning
        return self._fake_reason(user)

    # -- deterministic, varied fake outputs (no network, no "fake" leaking to users) --

    @staticmethod
    def _fake_reason(user: str) -> dict:
        """Build a SHORT statement deterministically derived from the two notes' salient tokens,
        so different pairs get visibly different statements. Never emits the word 'fake'."""
        a_text, b_text = _split_notes(user)
        a_sal, b_sal = _salient(a_text), _salient(b_text)
        a_set, b_set = set(a_sal), set(b_sal)

        shared = [t for t in a_sal if t in b_set][:3]
        a_only = [t for t in a_sal if t not in b_set][:2]
        b_only = [t for t in b_sal if t not in a_set][:2]

        # Pick a template deterministically from the pair's salient vocabulary.
        key = " ".join(sorted(a_set | b_set))
        anchor = shared[0] if shared else (a_sal[0] if a_sal else "pattern")
        a_term = a_only[0] if a_only else (a_sal[0] if a_sal else "one")
        b_term = b_only[0] if b_only else (b_sal[0] if b_sal else "the other")

        templates = [
            f"Both turn on the same {anchor} dynamic despite different surfaces.",
            f"A shared mechanism links {a_term} and {b_term} through {anchor}.",
            f"The {anchor} structure recurs: {a_term} mirrors {b_term}.",
            f"Each resolves the same tension around {anchor}.",
            f"{a_term} and {b_term} are two instances of one {anchor} pattern.",
        ]
        statement = templates[_stable_hash(key) % len(templates)]
        return {
            "connection": True,
            "shared_structure": f"shared {anchor} structure",
            "why": f"links {a_term} to {b_term} without sharing topic",
            "statement": statement,
        }

    @staticmethod
    def _fake_verify(user: str) -> dict:
        """Return a deterministic MIX of verdicts so surfaced counts vary across notes.

        Pairs with strong salient-token overlap (genuinely similar notes — e.g. the
        threshold/cascade pair the wiring test relies on) always pass at q>=3. Among the
        rest, a stable hash of the pair text routes a deterministic fraction to a
        sub-threshold verdict (generic, or nonobviousness=2) so they do NOT surface."""
        a_text, b_text = _split_notes(user)
        a_set, b_set = set(_salient(a_text)), set(_salient(b_text))
        inter = a_set & b_set
        union = a_set | b_set
        overlap = len(inter) / len(union) if union else 0.0

        # Strong shared vocabulary => clearly genuine; always surface (keeps the wiring test green).
        if len(inter) >= 2 or overlap >= 0.25:
            return {
                "validity": 4,
                "nonobviousness": 4,
                "generic": False,
                "reason": "shared structure is grounded in both notes",
            }

        # Otherwise split deterministically into a non-uniform mix of verdicts.
        bucket = _stable_hash("|".join(sorted(union))) % 5
        if bucket == 0:
            return {
                "validity": 4,
                "nonobviousness": 2,
                "generic": False,
                "reason": "real but largely the same idea (low nonobviousness)",
            }
        if bucket == 1:
            return {
                "validity": 3,
                "nonobviousness": 3,
                "generic": True,
                "reason": "shared structure is too generic to be meaningful",
            }
        if bucket == 2:
            return {
                "validity": 2,
                "nonobviousness": 4,
                "generic": False,
                "reason": "the analogy is forced (low validity)",
            }
        # buckets 3,4 -> surface
        return {
            "validity": 4,
            "nonobviousness": 3,
            "generic": False,
            "reason": "plausible non-obvious link grounded in both notes",
        }


# ---------------------------------------------------------------------------


class OllamaProvider:
    def __init__(self, host: str) -> None:
        import httpx

        self.host = host.rstrip("/")
        self._client = httpx.Client(timeout=120.0)

    def embed(self, texts: list[str], model: str) -> list[list[float]]:
        out = []
        for t in texts:
            r = self._client.post(
                f"{self.host}/api/embeddings", json={"model": model, "prompt": t}
            )
            r.raise_for_status()
            out.append(r.json()["embedding"])
        return out

    def chat_json(self, system: str, user: str, model: str) -> dict:
        r = self._client.post(
            f"{self.host}/api/chat",
            json={
                "model": model,
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.2},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
        )
        r.raise_for_status()
        content = r.json()["message"]["content"]
        return _loads_lenient(content)


# ---------------------------------------------------------------------------


class AnthropicProvider:
    def __init__(self) -> None:
        import anthropic  # optional dependency

        self._client = anthropic.Anthropic()

    def embed(self, texts: list[str], model: str) -> list[list[float]]:
        raise NotImplementedError(
            "Anthropic does not serve embeddings; set KG_EMBED via Voyage/Ollama separately."
        )

    def chat_json(self, system: str, user: str, model: str) -> dict:
        msg = self._client.messages.create(
            model=model,
            max_tokens=1024,
            system=system + "\nReturn ONLY raw JSON, no prose, no code fences.",
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        return _loads_lenient(text)


def _loads_lenient(s: str) -> dict:
    """Tolerate code fences / leading prose around the JSON object."""
    s = s.strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s[s.find("{") :] if "{" in s else s
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        a, b = s.find("{"), s.rfind("}")
        if a != -1 and b != -1 and b > a:
            return json.loads(s[a : b + 1])
        raise
