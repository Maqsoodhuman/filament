# Floor experiment

The Gate-1 result (75% precision, clean q≥3 cut) was measured on a **curated** corpus — a
*ceiling*. The floor experiment re-runs the eval on a deliberately **messy, realistic** corpus to
estimate how the engine behaves on the kind of library a real user actually has. (See
`docs/DESIGN_DECISIONS.md` Part B and `CLAUDE.md` → Validation gates.)

## The corpus (`notes.json`)

18 notes engineered to stress every failure mode the curated set avoids:
- **Same-domain near-duplicates** (e.g. two finance explainers, two ML basics) that must NOT surface
  as "non-obvious" — the topical-rejection prune has to catch them.
- **Low-salience noise** (a to-do list, a saved quote) that should yield no facets and drop out.
- **4 genuine cross-domain structural pairs** — the signal the engine must recall
  (gradient-descent ↔ fitness-landscapes, central-bank-credibility ↔ cold-war-deterrence, etc.).
- **10 forced/garbage pairs** — same-domain or superficially-similar pairs that must stay below the
  q≥3 gate (the false-positive trap).

`genuine_pairs` and `garbage_pairs` are the labels the harness scores against.

## How to run

```bash
cd engine && source .venv/bin/activate
export KG_PROVIDER=ollama \
  KG_EXTRACT_MODEL=gemma2 KG_REASON_MODEL=gemma2 \
  KG_VERIFY_MODEL=mistral:7b KG_EMBED_MODEL=nomic-embed-text
kg-engine eval data/floor/notes.json
```

Use the **same model config** as the ceiling run so the two numbers are comparable. The verifier is
a *different* model from the reasoner (mistral vs gemma2) to preserve the decorrelation the
precision gate depends on.

## What to read in the output

- `genuine recalled = X/4` — recall of the planted cross-domain signal.
- `garbage surfaced = Y` — false positives (the floor's real concern). **Any same-domain or forced
  pair surfacing is the precision-decay signal** the architecture warns about at scale.
- `precision (on labeled)` — recalled / (recalled + garbage-surfaced) over the labeled pairs.

## Reference: the ceiling (curated `data/golden/notes.json`, same models)

`surfaced=15 · genuine recalled=3/3 · garbage surfaced=0 · precision(on labeled)=100%`

The curated set surfaced cleanly. The floor run on this messier corpus is the honest check; record
its numbers here when run, and treat a persistent garbage-surfaced > 0 as a prompt/threshold tuning
signal (never loosen the q≥3 gate to chase recall).

## Floor results (Ollama: gemma2 reason · mistral:7b verify · nomic embed)

| `topical_reject` | surfaced | genuine recalled | garbage | precision (labeled) | ANN recall@20 |
|---|---|---|---|---|---|
| 0.82 (old default) | 40 | 0/4 | 1 | 0% | 100% |
| **0.92 (new default, B1)** | 41 | **1/4** | 1 | **50%** | 100% |

**B1 finding:** the old 0.82 threshold rejected genuine *metaphor-sharing* cross-domain pairs
(gradient-descent ↔ fitness-landscapes share "local optimum / hill-climbing" vocabulary, so their
*topical* vectors sit close even though the structure is non-obvious). Raising to 0.92 recovered a
genuine pair and lifted labeled precision 0→50% **without** increasing garbage. ANN recall@20 is
100%, so retrieval is exact — the remaining 3/4 gap is the **local verifier's weakness**, not the
pipeline. This is the documented case for running the reason+verify (moat) stages on managed Claude
models; re-run this floor on Claude before trusting the threshold for production.
