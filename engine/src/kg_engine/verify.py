"""Stage 5: independent verifier. A SEPARATE call that never sees the reasoner's rationale —
only the two notes and the proposed statement (decorrelated judgment, the Gate-1 mechanism)."""

from __future__ import annotations

from .models import Note, VerifyOut
from .prompts import VERIFY_SYSTEM, VERIFY_USER
from .router import ModelRouter


def verify_pair(statement: str, a: Note, b: Note, router: ModelRouter) -> VerifyOut:
    user = VERIFY_USER.format(a_text=a.text, b_text=b.text, statement=statement)
    return VerifyOut.model_validate(router.verify(VERIFY_SYSTEM, user))
