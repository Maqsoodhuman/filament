# Knowledge Graph — Design System

A cross-source synthesis instrument. This doc codifies the approved mockup aesthetic (flat, hairline, single reserved blue accent for AI/connection moments) and the borrowed patterns from the five reference studies into a build-ready spec for Next.js + Tailwind + shadcn/Radix + BlockNote.

---

## 1. Design principles

1. **Blue means exactly one thing: an AI-surfaced connection.** Connection counts, connection chips/edges, the first-insight callout, and connection verbs in the palette — nothing else. No second accent for topics, tags, status, or emphasis.
2. **Calm at rest, capable on hover/summon.** The canvas is whitespace and type; controls (block handles, row actions, slash/command menus) appear only on hover or invocation. (Notion + Linear + Craft)
3. **Connections are always typed by KIND, never a flat link.** `same mechanism` (structural, blue) outranks `same dynamic` and `same topic` (commodity, neutral) everywhere — rail, chip, graph edge, Organize column. (Obsidian-avoid → our core differentiator)
4. **One reusable "connection object" across every surface.** The same chip component renders in the editor, the rail, and as a graph node so users learn it once. (Tana)
5. **Structure is a byproduct, not a chore.** AI surfaces connections; the user writes. Manual `@`-links are optional seeds, never the headline interaction. (Capacities/Tana-avoid)
6. **Spatial orientation comes from the local graph, not deep nesting.** Hierarchy is capped Notebook→Section→Page; the Graph tab is the map. (Obsidian global-graph-avoid)

---

## 2. Design tokens

### Color

Defined as CSS variables (HSL-friendly hex below). Light is the default; dark is a true dark surface, not Linear's near-black cockpit.

**Light**
| Token | Hex | Use |
|---|---|---|
| `--surface` | `#FFFFFF` | card / editor canvas |
| `--surface-sunken` | `#FAFAF9` | app background behind cards |
| `--surface-hover` | `#F4F4F5` | row/block hover tint |
| `--border-hairline` | `#E7E5E4` | 0.5px borders, dividers |
| `--text-primary` | `#1C1917` | body, titles (weight 400/500) |
| `--text-secondary` | `#78716C` | dates, metadata, evidence excerpt |
| `--text-tertiary` | `#A8A29E` | placeholder, disabled |
| `--accent-ai` | `#2563EB` | **reserved blue — AI/connection only** |
| `--accent-ai-tint` | `#EFF4FF` | callout bg, chip bg, blue-row tint |
| `--accent-ai-border` | `#BFD4FE` | callout / chip hairline |

**Dark**
| Token | Hex |
|---|---|
| `--surface` | `#1A1917` |
| `--surface-sunken` | `#121210` |
| `--surface-hover` | `#26241F` |
| `--border-hairline` | `#33302B` |
| `--text-primary` | `#F5F5F4` |
| `--text-secondary` | `#A8A29E` |
| `--text-tertiary` | `#6B6660` |
| `--accent-ai` | `#5B8DEF` |
| `--accent-ai-tint` | `#1B2436` |
| `--accent-ai-border` | `#2E456E` |

**Connection-KIND colors** — KIND is encoded by **icon + label always**; color is the secondary cue and obeys the one-accent rule.
| KIND | Color token | Tabler icon |
|---|---|---|
| `same mechanism` (structural) | `--accent-ai` (blue) | `tabler-recycle` / `arrows-transfer-up` |
| `same dynamic` (structural-ish) | `--text-primary` neutral, **medium weight** | `tabler-wave-sine` |
| `same topic` (commodity) | `--text-secondary` neutral, hairline | `tabler-tag` |

Rule: only `same mechanism` ever draws blue. `same dynamic`/`same topic` differentiate by icon + weight, never a second hue.

### Typography

System sans (Inter via `next/font`), **two weights only: 400 and 500**. Sentence case everywhere.
| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-display` | 28px / 34px | 500 | editor page title, onboarding headline |
| `text-h1` | 20px / 28px | 500 | section headers |
| `text-h2` | 16px / 24px | 500 | card titles, rail group headers |
| `text-body` | 15px / 26px | 400 | editor body (tuned vertical rhythm) |
| `text-ui` | 14px / 20px | 400 | nav, rows, buttons |
| `text-meta` | 13px / 18px | 400 | dates, evidence excerpt, count badge |
| `text-mono` | 13px | 400 | palette shortcut hints |

Editor body line-height (26px on 15px) is the signature — vertical rhythm is a first-class spec (Bear/Craft), not a default.

### Spacing — 4px grid

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Card padding `16`. Editor measure max-width `680px`, centered. Timeline card gap `12`. Rail width `300px`. Left tree row height `32px` (compact, Obsidian density) vs timeline card padding generous.

### Radius

`--radius-sm: 6px` (chips, badges, buttons), `--radius-md: 8px` (cards, callout, panels), `--radius-pill: 999px` (KIND pills, count badge). No radius on full-bleed dividers.

### Border

Hairline only: `0.5px solid var(--border-hairline)` (`1px` on retina renders ~0.5). **No shadows, no gradients** anywhere except optional `0 1px 2px rgba(0,0,0,.04)` on the Cmd+K palette and hover-preview popover (the two floating layers).

### Motion

Confirmation-only, never decorative. Easing `cubic-bezier(0.2, 0, 0, 1)`.
| Token | Duration | Use |
|---|---|---|
| `--motion-instant` | 120ms | hover reveals, palette open, view switch |
| `--motion-panel` | 150ms | peek/detail panel slide-in (Linear) |
| `--motion-reveal` | 240ms | connection chip / first-insight callout fade+lift |

Hard ceiling: **nothing over 300ms, no spring overshoot, no bounce** (Things/Craft-avoid).

---

## 3. Component inventory

- **TopNav** — single persistent bar: app mark + three text tabs (`Timeline / Organize / Graph`), sentence case, active tab marked by 500 weight + 1.5px underline (neutral, not blue); right side holds Cmd+K hint only.
- **NoteCard** (timeline) — flat white card, hairline border, title (h2) + 1-2 line content preview + secondary date; lone blue element is the **ConnectionCountBadge**; row actions hover-revealed.
- **ConnectionCountBadge** — pill, `--accent-ai-tint` bg + blue text, format `12 connections`; the single timeline accent; always visible, never hover-gated.
- **ConnectionChip** — the universal connection object. Blue pill (`mechanism`) / neutral pill, KIND icon + KIND label primary + target-note title secondary. Lives inline at block-end (AI-inserted), in the rail, and as the graph node label. Click → opens target in rail/peek.
- **ConnectedNoteCard** (rail) — note title (h2) + KIND label + **1-2 line evidence excerpt** (the sentence the AI used); hover → preview popover of target body. Grouped under collapsible KIND sub-headers with count badges.
- **FacetTypeBadge** — neutral Tabler icon row on Organize note cards showing which connection KINDs touch the note; icons only, no color (Capacities-adapted to KINDs not objects).
- **KindPill** — typed pill for Organize Table/Board columns and section tags; color/weight per the KIND table.
- **SectionList** — left tree, Notebook→Section→Page, disclosure triangles, compact 32px rows (Obsidian density); section = AI cluster, marked with a small `sparkle`/`ai` Tabler glyph, neutral.
- **PageList / SectionViewTabs** — section header carries view tabs `Pages | Table | Board` (Notion multi-view); per-view persisted filters/sorts.
- **MembershipChips** — removable neutral chips on a page showing its multiple section memberships; drag-into-section = ADD with toast `added to 2 sections`.
- **GraphNode** — neutral circle, label = note title; reuses ConnectionChip styling for the centered note; deterministic radial layout.
- **GraphEdge** — labeled by KIND; `same mechanism` drawn blue + 1.5px, others hairline neutral; label is a small KindPill at edge midpoint.
- **Button** — primary = solid neutral `--text-primary` bg / surface text; secondary = hairline ghost; **no blue buttons** (blue is never a generic CTA). Connection actions are text + blue KIND icon, not blue fills.
- **CommandPalette** (Cmd+K) — fuzzy list, right-aligned mono shortcut per row; connection/AI verbs render their KIND icon in blue as a distinct class.
- **SlashMenu** — short grouped insert menu (BlockNote); bottom group `/connect`, `/link to a connection` carries the blue icon; resist Notion's block zoo.
- **BlockHandle** — left-gutter `⠿` (drag) + `(+)` (add), hover-only; handle menu: Turn into / Duplicate / Delete / **Find connections from this block**.
- **EmptyState** — centered Tabler outline icon + one sentence, sentence case, wide whitespace (Things 3); no illustrations, no coachmarks.
- **FirstInsightCallout** — `--accent-ai-tint` bg, blue hairline, KIND icon + streamed first connection; fades/lifts in at 240ms; a real editor callout block, not a modal.
- **HoverPreviewPopover** — floating card (one of two shadowed layers) showing target note body on link/chip hover; 120ms fade.
- **PeekPanel** — right-side detail panel sliding in at 150ms over the current view (graph node / note detail), preserving context (Linear).

---

## 4. Per-surface guidance

### 1. Write editor
**Layout:** centered 680px BlockNote canvas, fully neutral; persistent 300px right **connected-notes rail**; left block-gutter hover affordances.
**Borrowed:**
- Left-gutter `⠿` + `(+)` hover handle, handle menu adds **Find connections from this block** (Notion).
- Inline markdown transform, no preview mode + `/` slash and `@` link triggers (Bear + Craft); BlockNote gives WYSIWYG — no raw-syntax reveal (Obsidian-avoid).
- Rail = single opinionated accordion grouped by KIND, each entry showing **evidence excerpt** + hover-preview (Obsidian + Capacities/Tana contextual backlinks).
**Key interaction:** AI inserts a blue **ConnectionChip** at the end of a block when it detects a cross-note link; click opens target in the rail. New connections arrive with a 240ms confirm slide-in, never a flash.

### 2. Timeline (home)
**Layout:** date-spine reverse-chron feed of flat NoteCards, wide margins, hairline separation, low density.
**Borrowed:**
- Daily-note-as-home, newest entry already an editable block (Capacities).
- Flat hairline rows with hover-revealed secondary actions (Linear); count badge always visible, not hover-gated.
- Inline content preview per card (Craft).
**Key interaction:** the **ConnectionCountBadge** in blue is the only accent on each card — scan-and-click toward densely connected notes. `g t` chord jumps here.

### 3. Organize tab
**Layout:** compact left tree (Notebook→Section→Page, capped depth); section header carries `Pages | Table | Board` view tabs; main area renders the selected view.
**Borrowed:**
- Multi-view-over-one-dataset with persisted per-view filters/sorts; Table columns = connection count + KIND; Board groups pages by KIND (Notion).
- Multi-section membership feels native via MembershipChips + non-destructive drag-to-ADD with toast (Notion relations + Bear many-to-many).
- Compact tree density + disclosure triangles (Obsidian).
**Key interaction:** dragging a note into a section adds (not moves) it; KindPills render structural vs commodity links distinctly. Property set is **fixed/opinionated** (count + KIND) — no user-defined schemas (Notion-avoid).

### 4. Graph tab
**Layout:** LOCAL neighborhood only, centered on one note, **deterministic radial layout, no physics, no sliders** (Obsidian-avoid); generous spacing on neutral surface.
**Borrowed:**
- Local N-hop graph as the entire model, edges labeled by KIND (Obsidian).
- Accent discipline: only `same mechanism` edges are blue; topical edges hairline neutral — the structural links are literally the only colored thing (Linear).
- Click node → 150ms PeekPanel slide-in instead of abrupt re-center (Linear).
**Key interaction:** depth is a simple 1–2 hop toggle; nodes reuse the ConnectionChip component; palette verb `center graph on this note`.

### 5. Onboarding
**Layout:** calm near-empty Daily-Note-style timeline; import runs silently in background; one centered Tabler icon + one sentence (`looking for connections across your library…`).
**Borrowed:**
- Things 3 quiet empty/loading state, no progress-bar dashboard.
- Progressive-disclosure single FirstInsightCallout that streams the first connection at ~2–3 min before import finishes (Notion).
- "Jot now, structure later" — the first insight surfaces as the **real ConnectionChip component** animating into a line, not an onboarding-only banner (Tana/Capacities).
**Key interaction:** first connection fades/lifts in at 240ms in blue, settling calm — "this product noticed something," not a celebration. Pair the block-handle connection action with one nudge so the gesture isn't undiscovered (Notion-avoid).

---

## 5. Interaction & motion

- **Command palette (Cmd+K):** single fuzzy entry point — `create note`, `jump to note`, `switch tab`, `show connections for…`, `center graph on…`. Right-aligned mono shortcut per row (palette teaches shortcuts). Connection/AI verbs get the blue KIND icon as a distinct action class.
- **Keyboard grammar:** `g`-then chords (`g t` Timeline, `g o` Organize, `g g` Graph), `c` create. Ship a `?` overlay listing all bindings grouped by context — never keyboard-first without discoverability (Linear-avoid).
- **Micro-motion rules:** motion confirms an action only. Hover reveal 120ms; panel slide 150ms; connection/callout reveal 240ms. No spinners — optimistic updates, sub-150ms cross-fades (Linear). No bounce, nothing >300ms.
- **Optimistic updates:** view switches, drag-reorder, add-to-section, and note creation apply immediately; AI connection results stream in and animate as they arrive.
- **Empty/loading states:** centered outline icon + one sentence + whitespace; the AI's working state is calm prose (`looking for connections…`), never telemetry. The lone blue element on any empty screen is a surfaced connection.
- **Always-visible affordances:** connection counts and chips are never hover-gated — they are the product's reason to exist (Linear/Things-avoid).

---

## 6. What we deliberately avoid

- **The Obsidian global-graph hairball** — visually impressive, conveys nothing actionable; build memory is impossible with non-deterministic physics. We ship only a local, deterministic, radial neighborhood graph with no jiggle sliders.
- **Force-directed physics & slider farms** — node drift destroys spatial memory. Stable layout, simple 1–2 hop toggle.
- **A second accent color** — no colored status dots, priority icons, per-object-type palettes, or topic colors (Linear/Capacities-avoid). Blue means AI-connection, full stop; KINDs differentiate by icon + weight.
- **User-defined database schemas / the full Notion block zoo** — sections are AI-built clusters with a fixed property set; the slash menu stays short and grouped.
- **Manual-first linking as the headline** — `@`-links and `#tags` are optional seeds; the AI surfaces connections, or we're just another PKM (Tana/Capacities-avoid).
- **Deep page-in-page nesting** — capped Notebook→Section→Page; orientation lives in the graph, not infinite breadcrumbs (Notion-avoid).
- **Raw-markdown-reveal-on-cursor** — clashes with flat WYSIWYG and confuses non-technical researchers; BlockNote rendered blocks instead (Obsidian-avoid).
- **Unlimited pane splitting / panel management** — one editor + one opinionated always-on rail; no tiling workspace, no add/remove/reorder panels (Obsidian-avoid).
- **Playful/skeuomorphic motion** — no magic-plus bounce, confetti, or choreographed reveals; confirmation-only, ≤300ms, for a serious analyst instrument (Things/Craft-avoid).
- **Dark cockpit density & hover-hidden core affordances** — borrow Linear's grammar, not its skin; connection signals stay light, generous, and always visible.

---

> Source: distilled from a 5-reference UI study (Notion, Obsidian, Craft+Bear, Capacities+Tana, Linear+Things 3), aligned to the approved mockups. The inline mockups in chat are the visual reference for these tokens.
