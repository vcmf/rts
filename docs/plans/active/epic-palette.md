---
status: active
last_reviewed: 2026-10-18
---

# Plan: an epic mood, after Tiny Glade

The owner (2026-10-18), after Tiny Glade's look: "can we make our theme a bit more contrasted, a bit more epic, but
someway so it's look more like 'epic version' of tiny glade". Stacked on the dark water (`docs/plans/active/dark-water.md`).

## Scope

- **A new mood, `epic`** (`src/look/mood.ts`, `?mood=epic`), beside `temperate` (the default until the owner picks):
  the air cleared (the valley mist at about a third, little haze at the frame's top), a warmer sun against cooler,
  deeper shade, more of the world's own colour kept, the values spread about a mid grey, a darker frame edge.
- **Two new mood fields:** `mist` (the valley mist's amount) and `grade.contrast` (the values spread, the colour
  kept: `gradeOf`). The existing moods keep their look (1 and 0).
- Later, in its own PR: the autumn grass and the tall orange wheat (the owner's other ask).

## Approach

Mood data, and one line each in `mist()` and `gradeOf()`. A/B captures (temperate against epic: the default view in
summer and autumn, close on the river, the widest); the owner judges, then whether it becomes the default.

## Acceptance

- The owner's look check.
- The guard, coat and negatives checks under `?mood=epic` (armies stay the most saturated, readable first), the macro,
  water checks and goldens (unchanged under temperate); the bench (no cost expected). `npm test`,
  `node tools/check-docs.mjs`.
