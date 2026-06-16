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

**The authoritative visual gate is the `ui-ux-qa` review** (the `ui-ux-qa-reviewer` agent): it captures the route at 320/768/1280, judges the actual pixels against `docs/DESIGN_SYSTEM.md`, and returns `QA VERDICT: PASS|FAIL` (FAIL on any Blocker or Major). `skills/visual-check.mjs` is only a fast keyword tripwire — it CANNOT judge layout, overflow, contrast, collisions, or polish, so a green keyword check is necessary but NOT sufficient. A route merges only when `ui-ux-qa` returns PASS. If it FAILs twice on the same task, **stop and report**.

## Design

- Follow `docs/DESIGN_SYSTEM.md` tokens exactly: flat, hairline borders, the reserved blue accent **only** for AI/connection moments, connection KIND shown by icon + label.
- Stack: Next.js (App Router) + Tailwind + Radix/shadcn + BlockNote for the editor.
