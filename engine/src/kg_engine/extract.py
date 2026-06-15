"""Stage 1: facet extraction. One LLM call per note, validated to the schema, cached by content hash."""

from __future__ import annotations

from .config import FACET_TYPES
from .models import ExtractionOut, Facet, Note
from .prompts import EXTRACT_SYSTEM, EXTRACT_USER
from .router import ModelRouter


def extract_facets(note: Note, router: ModelRouter) -> list[Facet]:
    raw = router.extract(EXTRACT_SYSTEM, EXTRACT_USER.format(text=note.text))
    parsed = ExtractionOut.model_validate(raw)
    facets: list[Facet] = []
    for i, f in enumerate(parsed.facets):
        if f.type not in FACET_TYPES:
            continue
        if not f.abstraction.strip():
            continue
        facets.append(
            Facet(
                note_id=note.id,
                type=f.type,
                abstraction=f.abstraction.strip(),
                salience=f.salience,
                idx=i,
            )
        )
    return facets
