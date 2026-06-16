# Frontend lane — CLAUDE.md

You are the **frontend-agent**. Scope: this `frontend/` tree only (`app/`, `components/`, `lib/`, styling). Never touch `engine/`.

## Single source of truth for API types

**Never hand-write API types.** Import them from `lib/api-types.ts`, which is generated from the engine's OpenAPI schema by the orchestrator (`skills/regenerate-api-types.sh`). If you need a field that doesn't exist, **stop and ask the orchestrator** to change the contract — do not invent a local type.

## Gate (must pass before any merge)

```bash
cd frontend
npm run typecheck            # (or: next build)
node ../skills/visual-check.mjs --url <route-url> --intent "<what the screen must show>"
```

Never merge a route without a green visual gate. Terminal output is not evidence the UI is correct — the rendered screenshot is.

**The authoritative visual gate is the `ui-ux-qa` review** (the `ui-ux-qa-reviewer` agent): it captures the route at 320/768/1280, judges the actual pixels against `docs/COHESIVE_DESIGN.md`, and returns `QA VERDICT: PASS|FAIL` (FAIL on any Blocker or Major). `skills/visual-check.mjs` is only a fast keyword tripwire — it CANNOT judge layout, overflow, contrast, collisions, or polish, so a green keyword check is necessary but NOT sufficient. A route merges only when `ui-ux-qa` returns PASS. If it FAILs twice on the same task, **stop and report**.

## Design

- Follow `docs/COHESIVE_DESIGN.md` (the Filament design system, §7 As built): warm paper + dark ink, the **four fonts**, depth via shadow + hover-lift (not flat hairlines), 18/12/100 radii. **The colour law: amber `#F2A93B` == a structural connection** (indigo == dynamic, slate == topic) — connection KIND shown by colour + icon + label. The old austere "reserved blue" v2 system is retired.
- Stack: Next.js (App Router) + Tailwind + `lucide-react` (icons) + `d3` (graph). The editor is the hand-rolled block editor in `components/NoteEditor.tsx` (NOT the BlockNote package). `lib/store.ts` is the client data layer and the single seam for engine-API wiring.
