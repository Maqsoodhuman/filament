"""Stage 4: reasoning. One LLM call per surviving candidate pair."""

from __future__ import annotations

from .models import Candidate, Note, ReasonOut
from .prompts import REASON_SYSTEM, REASON_USER
from .router import ModelRouter


def reason_pair(cand: Candidate, a: Note, b: Note, router: ModelRouter) -> ReasonOut:
    user = REASON_USER.format(
        a_domain=a.domain or "unknown",
        a_text=a.text,
        b_domain=b.domain or "unknown",
        b_text=b.text,
        facet_type=cand.facet_type,
        a_abstraction=cand.a_abstraction,
        b_abstraction=cand.b_abstraction,
    )
    return ReasonOut.model_validate(router.reason(REASON_SYSTEM, user))
