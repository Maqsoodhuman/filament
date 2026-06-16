# Engine API container. Default config is the self-contained FAKE provider (deterministic, no
# external deps) + seeded golden notes, so the image runs a working live demo with zero secrets.
# For Premium/real connections set KG_PROVIDER=anthropic + ANTHROPIC_API_KEY and wire an embedding
# provider (Voyage, or Ollama host) — see ../DEPLOY.md.
FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY data ./data
RUN pip install --no-cache-dir -e ".[api]"

ENV KG_PROVIDER=fake \
    KG_SEED=1 \
    KG_STORE_BACKEND=memory \
    PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn kg_api.main:app --host 0.0.0.0 --port ${PORT}"]
