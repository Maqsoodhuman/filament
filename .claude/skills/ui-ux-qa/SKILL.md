---
name: ui-ux-qa
description: >
  Run a UI/UX QA review of a screen, flow, component, or screenshot — finds usability,
  accessibility (WCAG 2.2 AA), visual, interaction, and copy defects with severity + fixes, and
  returns a PASS/FAIL verdict. Use when the user asks to review/QA a UI, asks "is this screen good /
  what's wrong with this UI", or as the real frontend merge gate in place of a keyword screenshot
  check. Give it a route URL (preferred — it captures responsive screenshots itself), a screenshot
  path, or code paths.
---

# UI/UX QA review

You are running a real visual QA pass — not a keyword/text-presence check. The deliverable is a
severity-ordered defect report and a `QA VERDICT: PASS|FAIL` line that can gate a merge.

## Inputs (from the invocation args)

- A **route URL** (e.g. `http://localhost:3000/graph`) — preferred; capture it yourself.
- and/or a **screenshot path**, and/or **code paths/globs** to review.
- Optional `--gate` flag → exit-style behavior: a FAIL (any Blocker or Major) is a blocking result.

## Procedure

1. **Load the rubric.** Read `.claude/skills/ui-ux-qa/checklist.md` (the priority-ranked ~99-rule
   taxonomy — WCAG 2.2 / Apple HIG / Material / CWV, adapted from `ui-ux-pro-max`). Review in priority
   order 1→10 and cite the rule id in each finding. Also read the **design system** if present
   (`docs/DESIGN_SYSTEM.md` or token files) — deviations from the project's own tokens are defects.
2. **Capture the screen responsively** (if given a URL and the app is up):
   ```bash
   node skills/ui-capture.mjs --url <url> --name <slug> --out-dir /tmp --full
   ```
   It writes `*-desktop.png` (1280), `*-tablet.png` (768), `*-mobile.png` (320) and prints an
   `overflow=` flag per width. **Read each PNG and judge the actual pixels.**
3. **Delegate the judgment to the `ui-ux-qa-reviewer` agent** (preferred — it holds the full rubric),
   passing the URL/screenshot paths/code and the design-system path. For a quick inline review you may
   apply the same rubric directly: Usability · Accessibility (WCAG 2.2 AA) · Visual · Interaction ·
   Copy · Data/content sanity.
4. **Note what a static capture can't verify** — screen-reader output, keyboard tab order, exact
   contrast without color values, and interactive states (hover/focus/open/error). Say what you'd test
   and how.

## Output

A defect list ordered Blocker → Major → Minor → Nit. Each defect: ID + title · Severity · Category ·
Where (element/screen/viewport/file:line) · What's wrong (observable, measured) · Why it matters (cite
WCAG SC when relevant) · Fix. End with a per-severity count and:

```
QA VERDICT: PASS   # only if 0 Blockers AND 0 Major
QA VERDICT: FAIL   # otherwise
```

## Rules

- Be specific and measured ("gap 12px vs 20px", not "spacing feels off"). Separate fact from opinion
  (mark subjective calls `Nit/opinion`). Don't pad — if a section passes, say "Pass." Flag missing
  empty/loading/error states as defects. Audit, don't redesign unless asked.
