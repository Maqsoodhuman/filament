# Design Decisions — Why this product, why this shape

This doc records the strategy reasoning behind the architecture: the multi-perspective **strategy debate** that defined the product, and the **Gate-1 validation experiment** that proved its core technical premise.

---

## Part A — Strategy debate consensus

Five strategist personas (Skeptical VC, Optimistic Founder, AI/Technical architect, Product/Behavioral, Competitive/Market analyst) debated whether to build this, gave opening positions, rebutted each other, and a moderator synthesized.

### Verdict: "Build only if" — all five landed `conditional` at ~0.60 confidence

The product **as originally framed** (a horizontal three-tab PKM app: Write / Organize / Graph) is a **near-unanimous NO**. A narrow, repositioned version is worth a cheap, decisive experiment first. **Fund the experiment, not the company.**

### What everyone agreed on

- **Kill the three-tab framing.** Write/Organize/Graph drags you into an editor + sync + mobile war against Obsidian and Notion on commodity surfaces. The **Graph tab specifically is "demo-candy and retention-poison."**
- **The moat is NOT the graph, topical similarity, or even the algorithm** (a cloneable prompt+retrieval+rerank pattern). Defensibility must live in **ingestion breadth + accumulated per-user precision data + niche workflow lock-in**.
- **Import-first, read-mostly.** Lead with importers + connection engine + an in-context "connected notes / why" surface. Let users keep writing where they already write. Defer editor and graph viz.
- **Cost/latency is solved**, not a blocker (cached extraction + async reasoning; ~$5–15 one-time per big import, cents/user/month after).
- **Pick a synthesis-professional niche** (researchers, analysts, writers, grad students) where insight is a **painkiller, not a vitamin**. Price prosumer/B2B ($15–40/seat), never $5 consumer.
- **Precision over recall is existential.** Three real connections a week beats thirty forced ones; one bad/forced connection erodes trust disproportionately. Show reasoning; let users dismiss.
- **Gate the bet on a pre-build spike** before writing product code.

### The live cruxes (genuine disagreements)

1. **Does import solve churn, or only cold-start?** UX/VC are right: import is a one-shot day-1 hit; it defers the death curve from week 1 to ~week 6, it does not invert it. Retention needs a recurring trigger-action-reward loop. *Partial rescue:* a multi-year corpus has a large **combinatorial backlog** of unsurfaced connections, so discovery can be **paced** over an existing corpus, not only fueled by new input.
2. **The retrieval paradox — fatal or solvable?** The moat connections are *by definition* far apart in topical embedding space, so embeddings can't shortlist them; abstraction-space matching is the escape but risks collapsing to generic structures ("feedback loop," "tradeoff") → horoscope-grade pseudo-insight. Empirical unknown → became Gate 1.
3. **Which input is the engine's best fuel?** Clean self-contained highlights extract better than elliptical personal shorthand (AI's point), but frictionless capture and high-signal capture are in tension (UX's point). The synthesis niche partly resolves it — their *work product* is both authored and high-signal.
4. **Is the category a graveyard?** False as of 2026 — Mem 2.0 is live and still selling the auto-organize thesis. The honest read is "unproven and contested," and the incumbent threat (Readwise's Ghostreader moving up toward synthesis) is real.
5. **Defensibility vs incumbents/labs.** The algorithm is indefensible; cross-app connectors (Apple Notes SQLite, OneNote MS Graph, Kindle) + a tuned eval harness + niche trust buy a ~1-year window, not permanent safety.

### Product-owner override: authored notes + Organize tab are v1, not deferred

The debate recommended deferring the rich editor and the Organize tab (commodity, ship-speed). The product owner overrode this: **writing your own notes and a dynamic auto-Organize view are core to the original vision and ship in v1.** This is a deliberate, eyes-open call. The tradeoff to keep in view:

- **Cost:** it is cheap to add — an authored note is just another ingestion source (same engine path), and the Organize tab reuses topical embeddings the engine already computes. See `ARCHITECTURE.md` §6.3, §6.4, §3a.
- **The risk it reintroduces:** authoring depends on user discipline — the "input problem" the debate flagged. Import remains the cold-start killer; authored notes are additive, not the primary fuel. The dynamic Organize tab must stay a *computed view* (notes never move) so it never compromises findability.

### The single biggest risk

**Post-import recurrence of genuine insight.** The unit of risk is not "is the day-1 connection rate >30% on a static imported corpus" — it is **"does a NEW genuinely-good connection fire multiple times per active work-week after the import is mined out?"** If the whoa-rate decays once the initial corpus is exhausted, the habit loop never forms and the product dies at the pricing page.

---

## Part B — Gate-1 validation experiment (the technical premise)

**Question:** Can a structural-connection engine surface genuinely non-obvious AND true cross-domain connections at high precision?

**Method:** Built a blind synthetic corpus — 40 self-contained highlights across 8 unrelated domains (evolutionary biology, macroeconomics, military history, cognitive psychology, thermodynamics, organizational behavior, moral philosophy, urban ecology), each domain generated **blind to the others**. Ran the real pipeline (typed facet extraction → abstraction matching → cross-domain candidate generation → articulation), then **3 skeptical blind judges per connection** voted on: *is it true? is it non-obvious? is it generic "horoscope"?* (majority rules).

### Result: **PASS — cleanly, not marginally**

| Metric | Result | Gate |
|---|---|---|
| Genuinely non-obvious AND true | **12 / 16 = 75%** | ≥30–40% ✅ |
| Valid but obvious (same-topic) | 0 | — |
| Generic "horoscope" | 1 | low ✅ |
| Invalid / forced | 3 | — |

**Key finding:** every genuine connection scored quality ≥3; every piece of garbage scored ≤2.67. A `q≥3` threshold would have yielded **12 genuine / 0 garbage**. The failure mode is tunable tail noise, not a broken engine. This is the origin of the `q≥3` quality gate in the architecture.

**The retrieval paradox was bounded, not refuted.** Good connections identified the *same generative mechanism*, not a vague shape. But the threshold/criticality skeleton produced both a genuine hit and the one generic miss — so the generic-skeleton failure mode is real, lives at the low-quality tail, and is caught by quality score. This is the origin of the **generic-skeleton suppression** in the pipeline.

**Example genuine hits (the ceiling):**
> **Macroeconomics ↔ Moral philosophy:** Kydland-Prescott (a central bank free to re-optimize each period is tempted to surprise-inflate; agents foresee it; the economy lands at high inflation with no extra output) and rule-vs-act utilitarianism are *the same precommitment argument wearing different clothes*.

> **Urban planning ↔ Macroeconomics:** induced traffic demand and the natural rate of unemployment are the same trap — an intervention exploiting an apparent slack margin triggers the adaptive response that restores the original binding constraint.

### Honest caveats (75% is a CEILING, not a forecast)

1. **The corpus was stacked** — hand-built to be dense and connectable. Real libraries are mostly mundane and redundant; the base rate of findable connections in the wild is far lower.
2. **No recall measured** — we judged only what the engine *chose* to surface; misses are unknown.
3. **Notes were clean, mechanism-forward prose** — practically pre-digested. Real notes are terse and idiosyncratic.
4. **Obviousness is reader-relative** — judges agreeing ≠ non-obvious to the author who already holds both ideas.
5. **n=16 is small** — true precision could sit anywhere from ~50% to ~90%.

### What's proven vs still unknown

- **PROVEN:** the engine *can* reach genuine, non-obvious, mechanism-level cross-domain insight, and quality-score thresholding cleanly separates gold from garbage. The scariest technical risk is de-risked.
- **STILL UNKNOWN (Gate 2):** the *floor* — on an un-curated real corpus, at scale (the N² problem), with recall measured, does genuine signal survive as garbage grows? This needs real user data and cannot be faked synthetically.

### Next experiments

- **Floor experiment:** rerun Gate-1 against a deliberately messy, realistic corpus (redundant, half-formed, lexically overlapping notes with only a few real connections buried in noise) to estimate the floor instead of the ceiling.
- **Gate 2 (recurrence):** ~10 real synthesis professionals, real un-curated libraries, 4 weeks — does a genuinely-good connection fire ~weekly per active user on new input + backlog?
