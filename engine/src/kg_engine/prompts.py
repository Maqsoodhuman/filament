"""Prompts for the three LLM stages. Bump PROMPT_VERSION on any change (it keys the cache)."""

PROMPT_VERSION = "p1"

# ---- Stage 1: facet extraction ----

EXTRACT_SYSTEM = """You extract the STRUCTURAL facets of a note using DOMAIN-NEUTRAL language.
The goal is that two notes from totally different fields (e.g. biology and economics) can end up
with the same `abstraction` if they truly share deep structure.

For the note, return 0 to 5 facets. Each facet has:
- type: one of causal_mechanism | tension_tradeoff | selection_incentive | temporal_dynamic | abstract_pattern
- abstraction: a one-sentence, domain-STRIPPED statement of that structure (no proper nouns, no field jargon)
- salience: 0..1, how central this structure is to the note

Rules:
- Strip all surface topic. "Banks raise rates to fight inflation" -> causal_mechanism:
  "raising the cost of an activity suppresses its rate until a target is met".
- Do NOT invent structure that isn't there. A shopping list has no facets -> return {"facets": []}.
- Resist generic labels. Only say "feedback loop" / "tradeoff" if the SPECIFIC shape genuinely fits.
Return ONLY JSON: {"facets": [{"type": "...", "abstraction": "...", "salience": 0.0}]}"""

EXTRACT_USER = "NOTE:\n{text}"


# ---- Stage 2 is embedding (no prompt) ----


# ---- Stage 3: reasoning ----

REASON_SYSTEM = """Two notes from different domains were flagged as possibly sharing a deep structure.
Decide whether there is a GENUINE, non-trivial structural connection — the SAME generative mechanism,
tension, or dynamic — not merely the same topic and not a vague shared word.

Be honest: if the link is weak, forced, or just topical, return connection=false.
If real, write the one-to-two sentence insight a user would see.
Return ONLY JSON:
{"connection": true|false, "shared_structure": "...", "why": "why it is non-obvious", "statement": "user-facing insight"}"""

REASON_USER = """NOTE A ({a_domain}): {a_text}

NOTE B ({b_domain}): {b_text}

Candidate shared structure ({facet_type}): A="{a_abstraction}" | B="{b_abstraction}" """


# ---- Stage 4: independent verifier (no access to the reasoner's rationale) ----

VERIFY_SYSTEM = """You are a skeptical reviewer. Judge a proposed connection between two notes.
Default to skepticism. Score two INDEPENDENT axes, each 1-5, grounding every claim in the two notes:
- validity: is the claimed shared structure actually TRUE and sound (not a forced/false analogy)?
- nonobviousness: is it genuinely non-obvious (a link the reader likely would NOT make themselves)?
  Score LOW if it is basically the same topic.
Also flag `generic`: true if the "shared structure" is so generic (bare "feedback loop", "a tradeoff",
"a threshold") that it would connect almost any two notes. Be harsh on generic.
Return ONLY JSON: {"validity": 1-5, "nonobviousness": 1-5, "generic": true|false, "reason": "..."}"""

VERIFY_USER = """NOTE A: {a_text}

NOTE B: {b_text}

PROPOSED CONNECTION: {statement}"""
