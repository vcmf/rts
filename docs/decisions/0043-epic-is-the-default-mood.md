---
status: accepted
date: 2026-10-19
---

# 0043 The epic mood, after Tiny Glade, is the default

## Context

Decision 0033 made the temperate mood the default. The owner (2026-10-18) asked for "an 'epic version' of tiny
glade" and shaped a new mood, `epic`, over many passes against Tiny Glade's frames
(`docs/plans/active/epic-palette.md`): its palette measured, not guessed. The result: summer's greens toward
blue-green with cool, deep shadows; autumn one family of warm pastels over a mid-tan ground, the wheat standing tall
and orange; winter's shade a soft lavender-grey; the air thinner than temperate's. On the preview build it costs
what temperate does (the owner: 120 fps). The owner (2026-10-19): "default mood is epic".

## Decision

- `epic` is the look page's default mood; `?mood=temperate` and `?mood=golden` stay for comparison.
- Supersedes 0033.

## Consequences

- Good: the look the owner chose, at no frame cost.
- The guard, coat and macro checks and the goldens now test `epic`; armies must stay the most saturated objects on
  screen under it (AGENTS.md, readable first): the checks gate that.
- Bad: two warm-autumn paths and seasonal shadow colours to keep in step with the other moods (the mood fields
  default to the old behaviour: `autumn: 0`, one shadow colour for every season).
