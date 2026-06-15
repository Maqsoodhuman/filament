"""Routes each pipeline role (extract / reason / verify / embed) to a provider + model.

This is the seam the architecture (ARCHITECTURE.md 3b) relies on: switching local<->API,
or running a hybrid (local extract/embed + API reason/verify), is config only."""

from __future__ import annotations

from .config import Settings
from .providers import AnthropicProvider, FakeProvider, OllamaProvider, Provider


class ModelRouter:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self._provider = self._build(settings.provider)
        # embeddings always need a vector provider; Anthropic can't embed, so fall back to Ollama.
        if settings.provider == "anthropic":
            self._embedder: Provider = OllamaProvider(settings.ollama_host)
        else:
            self._embedder = self._provider

    def _build(self, name: str) -> Provider:
        if name == "fake":
            return FakeProvider(self.s.fake_dim)
        if name == "ollama":
            return OllamaProvider(self.s.ollama_host)
        if name == "anthropic":
            return AnthropicProvider()
        raise ValueError(f"unknown provider: {name}")

    def _model(self, role: str) -> str:
        p = self.s.provider
        table = {
            ("fake", "extract"): "fake",
            ("fake", "reason"): "fake",
            ("fake", "verify"): "fake",
            ("ollama", "extract"): self.s.extract_model,
            ("ollama", "reason"): self.s.reason_model,
            ("ollama", "verify"): self.s.verify_model,
            ("anthropic", "extract"): self.s.anthropic_extract_model,
            ("anthropic", "reason"): self.s.anthropic_reason_model,
            ("anthropic", "verify"): self.s.anthropic_verify_model,
        }
        return table[(p, role)]

    def extract(self, system: str, user: str) -> dict:
        return self._provider.chat_json(system, user, self._model("extract"))

    def reason(self, system: str, user: str) -> dict:
        return self._provider.chat_json(system, user, self._model("reason"))

    def verify(self, system: str, user: str) -> dict:
        return self._provider.chat_json(system, user, self._model("verify"))

    def embed(self, texts: list[str]) -> list[list[float]]:
        model = "fake" if self.s.provider == "fake" else self.s.embed_model
        return self._embedder.embed(texts, model)
