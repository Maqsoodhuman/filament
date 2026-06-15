"""kg_api — the FastAPI service. The Pydantic schemas here are the single source of truth for
the API contract; frontend types are generated from this app's OpenAPI schema (never hand-written).

Phase 1 = contract: typed routes + schemas. Handlers are dev stubs (in-memory); production routes
enqueue to Dramatiq workers (no LLM/embedding work on the HTTP path)."""
