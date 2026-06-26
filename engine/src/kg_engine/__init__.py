"""kg-engine — structural cross-domain connection engine (headless v0).

Pipeline: extract facets -> embed (abstraction space) -> retrieve candidates
(no LLM) -> reason -> independent verify -> q>=3 gate.

See ../../docs/ARCHITECTURE.md (sections 3 and 3a) for the design this implements.
"""

from .config import FACET_TYPES, Settings
from .models import Candidate, Connection, Facet, Note
from .pipeline import Engine

__all__ = ["Settings", "FACET_TYPES", "Note", "Facet", "Candidate", "Connection", "Engine"]
