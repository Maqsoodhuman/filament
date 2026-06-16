# Cohesive Design — Filament × the connection engine

> Authored as one design vision. Takes **Filament's craft** (its design system, editor, organize, graph) and fuses it with **what we built that Filament lacks** (the real structural connection engine, KIND-typed connections with a *why*, AI-clustered notebooks, intersections, find-connections, import→first-insight, persistence). Filament is the body; our engine is the nervous system.

## 0. The spine — the filament *is* the connection

Filament's brand is a glowing amber thread ("notes that connect"). That thread is not decoration — it **is** the product's reason to exist: the structural, non-obvious connection our engine surfaces. So the whole design hangs on one idea:

> **Amber = a structural connection.** The filament glow, the `same mechanism` edge, the strongest link a human wouldn't have made — all the same colour, the same concept. When the engine finds a real cross-domain thread, the UI literally lights the filament.

This unifies the gorgeous brand with the moat, and tells us how to colour everything.

## 1. Adopt Filament's design language (verbatim — it's excellent)

- **Surfaces:** warm paper `#F7F6F2` / white `#FFFFFF`; dark ink `#161A2B` for emphasis (topbar tabs, code, graph stage, primary buttons). Backdrop-blur sticky topbar. Depth via layered shadows + hover-lift (`translateY(-3px)`), not flat hairlines.
- **Four fonts (this is 70% of why it looks premium):** Space Grotesk (brand/headings), **Newsreader serif — incl. italic for emphasis** (reading body + hero *em*), Inter (UI chrome), JetBrains Mono (meta/tags/weights). Keep all four.
- **Accents:** **filament amber** `#F2A93B` (the signature) + **indigo** `#5B6CF0` (secondary). Section/category colours: coral/teal/violet/amber/slate/rose.
- **Radius/shape:** 18px cards, 12px controls, 100px pills; ruled-paper reading background in the organize view (a lovely touch — keep it).

This replaces our austere flat/cool v2 tokens. The warm v2 shell instinct was right; Filament executes it far better — adopt Filament's.

## 2. Connection KIND → palette (the unification)

Our engine types every connection by KIND. Map them onto Filament's palette so the brand and the feature are the same language:

| KIND (engine) | Meaning | Colour | Weight/icon |
|---|---|---|---|
| `same mechanism` | structural, the moat | **filament amber** `#F2A93B` (glows) | bold, ↑↑ |
| `same dynamic` | structural-ish | **indigo** `#5B6CF0` | medium, ∿ |
| `same topic` | commodity (rarely surfaced) | slate/neutral | hairline, # |

The amber connection is always the hero; topic links are quiet. The q-score (1–5) renders as a small mono weight (`q5`) on each connection — Filament already styles a mono "weight" chip; reuse it for `q`.

## 3. The surfaces — Filament shell + our engine

Keep Filament's topbar (brand + tabs **Notes · Organized · Knowledge graph** + CTA) and its four routes (`home / notes / organized / graph`). What each surface gains:

### Home (keep Filament's hero + feature cards)
Use our positioning copy ("cross-source synthesis, not another notes app"; "an empty result is an honest result"). The hero's dark graph card animates a few amber filaments lighting between distant nodes — literally showing the product. "Open app" → Notes.

### Notes (list + editor) — **add the Connections panel** ⟵ Filament's biggest gap
Filament's editor is beautiful but a note is an island — it shows no connections. Fix it:
- Keep the full block editor (slash menu, callouts, todos, quote, code, **markdown paste auto-detect**, cover, emoji, **tag chips**).
- Add a **right-hand Connections panel** (collapsible) on the open note: the engine's KIND-grouped connections to *this* note, each a card with the partner note's emoji + title + the **one-line *why*** + the amber/indigo KIND chip + `q`. Amber cards first.
- A **"Find connections"** button (on-demand trigger; the engine never runs on every keystroke). While scanning: calm "looking for threads…", then cards animate in — amber ones with a faint glow (the filament lighting up).
- Tags entered here are real and feed Organize (§Organized).
- Layout: `288px note-list · editor (720px reading column) · 320px connections panel`. The empty editor centred column Filament has is correct *because* the connections panel now fills the right.

### Organized (keep Filament's OneNote 3-pane) — **real notebooks, not static sections** ⟵ gap
Filament hard-codes sections (Ideas/Research/Projects/Journal). Replace with the engine:
- **Sections = AI clusters** with **real generated notebook/section names + live counts + section colour dots** (our `/clusters`). Multi-section membership ("also in …"), since a note can belong to several.
- Keep the 3-pane + ruled-paper reading view + the **full-screen toggle** (Filament has `one-layout.full` — exactly the "open the page node in full" the user asked for).
- The content pane shows the page **and its connections** (same Connections cards as Notes) + an **"Open full"** that expands the page node full-screen (Filament's `full` state already does this — wire it).
- Tags + clusters both feed sections; tags are the user's manual seed, clusters the AI's — both coexist.

### Knowledge graph (keep Filament's dark d3 stage + panel) — **feed it real connections** ⟵ gap
Filament's graph is gorgeous but its edges are mock. Feed our engine:
- Nodes = notes; **edges = real KIND-typed connections**, coloured per §2 (amber filaments for `same mechanism` glow brightest, indigo for `dynamic`, faint for `topic`). Edge thickness/opacity ∝ `q`.
- Keep the right **panel with two tabs**: **Connections** (selected node's links — emoji, why, q, "open") and **Insights** (see §Intersections).
- Default to a **local neighborhood** (centred note) to avoid the hairball, with a "see whole library" toggle (deferred/demo-candy, but the toggle lives here).
- Deterministic-ish layout; labels above nodes (never overlapping).

### Intersections (NEW — the user's word, and our soul) ⟵ missing in Filament
This is the proactive surfacing of *where ideas meet* — the product's payoff. It lives in two places, one component:
- The **Insights tab** of the graph panel and a **"Threads this week"** feed: the highest-`q`, most-non-obvious connections across the whole library, phrased as the *why* ("Your note on bank runs and your note on quorum sensing turn on the same threshold cascade"). Amber-framed.
- The **first-insight moment** in onboarding reuses this exact card.
- Honest-empty rule preserved: no forced intersections; an empty feed says so.

### Onboarding (NEW, in Filament's aesthetic) ⟵ missing in Filament
Import sources (Readwise/Kindle/Notion/file) → a calm progress beat → the **first intersection** lights up (an amber filament card) before the import finishes. Warm centred card, no app chrome.

## 4. Data bridge — Filament note ⇄ our engine

Filament's note `{ id, section, emoji, cover, title, tags, created, blocks[] }` maps cleanly to our API:
- `title`, `tags` → `POST /notes` (we just added `tags`). `blocks[]` → serialise to **markdown** for `body` (and markdown-paste deserialises back into blocks). `emoji`/`cover` are client-side note metadata (persist alongside).
- `section` → no longer a static enum; it's **derived from the engine's clusters** (`/clusters`) + the note's tags.
- **Connections** (Notes panel, Organize, Graph edges, Intersections) all come from `/connections` / `/notes/{id}` — the KIND + statement + q the engine produces.
- Persistence: Filament's `window.storage` swaps for our **API** (`/notes`, `/notes/{id}`, `/connections`, `/clusters`, `/scan`, `/notes/{id}/find-connections`). The engine (extract→embed→retrieve→reason→verify→q≥3) and the Premium/Community editions are unchanged underneath.

## 5. What we ADD to Filament (the gap list, explicit)

1. **Connections everywhere** — KIND-typed, with the *why* and `q`: the Notes connections panel, Organize page connections, real graph edges. (Filament has none of this.)
2. **Intersections / Insights feed** — the proactive "where your ideas meet."
3. **Real AI notebooks/sections** in Organize (names + counts + multi-section), not static categories.
4. **Find connections / Scan** on-demand trigger; **import → first-insight** onboarding.
5. **The engine wiring + persistence** (API, not `window.storage`); tags→organize mapping; markdown paste both ways.
6. The **q≥3 / honest-empty** discipline and the **amber-is-structural** colour law.

## 6. Build approach (when we build)

One cohesive pass, not a committee. Stand up Filament as the frontend shell (its CSS + four fonts + components), then wire each surface to the engine API and graft on the connections/intersections/clusters components above — designed to match Filament's hand, reviewed at 1920 as a whole, not screen-by-screen by separate agents. The design above is the single source of truth so the vision doesn't fragment again.
