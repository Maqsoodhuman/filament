"""Core data structures. Pydantic models validate LLM JSON; dataclasses hold internal state."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from pydantic import BaseModel, ConfigDict, Field


def content_hash(text: str) -> str:
    norm = " ".join(text.split()).strip().lower()
    return hashlib.sha256(norm.encode()).hexdigest()


# ---- LLM output schemas (validated at the provider boundary) ----
# extra='forbid' (C1): a hallucinated field fails validation instead of vanishing silently
# (pydantic v2 defaults to extra='ignore'). The FakeProvider must emit objects that validate
# against these exact shapes, which turns it into a contract test for the prompts/schemas.


class FacetOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str
    abstraction: str = Field(description="domain-stripped statement of the structure")
    salience: float = Field(ge=0.0, le=1.0)


class ExtractionOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    facets: list[FacetOut] = Field(default_factory=list)


class ReasonOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connection: bool
    shared_structure: str = ""
    why: str = ""
    statement: str = ""


class VerifyOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    validity: int = Field(ge=1, le=5)
    nonobviousness: int = Field(ge=1, le=5)
    generic: bool = False
    reason: str = ""


# ---- internal records ----


@dataclass
class Note:
    id: str
    title: str
    text: str
    domain: str = ""

    @property
    def chash(self) -> str:
        return content_hash(self.text)


@dataclass
class Facet:
    note_id: str
    type: str
    abstraction: str
    salience: float
    facet_vec: list[float] = field(default_factory=list)  # abstraction-space embedding
    idx: int = -1  # position within the note's facet list


@dataclass
class Candidate:
    a_id: str
    b_id: str
    facet_type: str
    a_abstraction: str
    b_abstraction: str
    sim: float  # abstraction-space similarity


@dataclass
class Connection:
    a_id: str
    b_id: str
    a_title: str
    b_title: str
    facet_type: str
    statement: str
    validity: int
    nonobviousness: int
    generic: bool
    model_version: str

    @property
    def q(self) -> int:
        return min(self.validity, self.nonobviousness)

    @property
    def surfaced(self) -> bool:
        return (not self.generic) and self.q >= 3
