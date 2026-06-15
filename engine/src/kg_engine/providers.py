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

_TOKEN = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


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
            return {
                "facets": [
                    {"type": "abstract_pattern", "abstraction": " ".join(toks), "salience": 0.8}
                ]
            }
        if "skeptical reviewer" in system:
            return {"validity": 4, "nonobviousness": 4, "generic": False, "reason": "fake"}
        # reasoning
        return {
            "connection": True,
            "shared_structure": "fake shared structure",
            "why": "fake",
            "statement": "These two notes share a structural pattern (fake).",
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
