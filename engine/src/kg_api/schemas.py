"""API contract — the single source of truth. `regenerate-api-types` turns this into
frontend/lib/api-types.ts via the app's OpenAPI schema. Workers never edit this file."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Connection KIND — the design-system rule: only "same mechanism" is structural-blue.
ConnectionKind = Literal["same mechanism", "same dynamic", "same topic"]

_FACET_TO_KIND: dict[str, ConnectionKind] = {
    "causal_mechanism": "same mechanism",
    "selection_incentive": "same mechanism",
    "tension_tradeoff": "same mechanism",
    "temporal_dynamic": "same dynamic",
    "abstract_pattern": "same topic",
}


def kind_for(facet_type: str) -> ConnectionKind:
    return _FACET_TO_KIND.get(facet_type, "same topic")


JobStatus = Literal["queued", "running", "done", "error"]


# ---- Notes ----

class NoteCreate(BaseModel):
    title: str = ""
    body: str = Field(min_length=1)
    source: str = "authored"
    tags: list[str] = Field(default_factory=list)  # hashtags; later feed the Organize map


class NoteOut(BaseModel):
    id: str
    title: str
    body: str
    source: str
    created_at: str
    connection_count: int = 0
    tags: list[str] = Field(default_factory=list)


class NoteDetail(BaseModel):
    note: NoteOut
    connections: list[ConnectionOut] = Field(default_factory=list)


# ---- Connections ----

class ConnectionOut(BaseModel):
    id: str
    a_id: str
    b_id: str
    a_title: str
    b_title: str
    facet_type: str
    kind: ConnectionKind
    statement: str
    validity: int = Field(ge=1, le=5)
    nonobviousness: int = Field(ge=1, le=5)
    q: int = Field(ge=1, le=5)


# ---- Clusters (Organize tab: OneNote-style sections) ----

class ClusterOut(BaseModel):
    id: str
    notebook: str = "Research library"
    label: str
    note_ids: list[str]
    note_count: int
    is_manual: bool = False


# ---- Jobs (on-demand trigger results) ----

class JobOut(BaseModel):
    job_id: str
    status: JobStatus
    surfaced_count: int | None = None


class ScanRequest(BaseModel):
    # incremental scan since the last run; full=True rescans everything
    full: bool = False


NoteDetail.model_rebuild()
