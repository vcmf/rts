---
status: accepted
date: 2026-10-27
---

# 0077 A pond with no level of its own levels at its lower bank; a dam is drawn, never implied

## Context

A pond's level was the lowest point of its shore less a freeboard, and its whole outline was cut down to it. The
outlines come from a period map, the ground from today's relief: where a pond lies across a slope, its uphill side
was dug into the hill (Austerlitz's Nowetitz ponds, 22.8 m, #230). A first fix raised an implicit dam on the downhill
shore so the whole outline could hold water; three review rounds found it colliding with everything else in the
water step (streams through it, neighbouring ponds, the edits, its own water). The owner's reading: water lies level
at its lower bank, and the higher ground is simply dry.

## Decision

- A pond with no `level` levels at the lowest point of its shore (less the freeboard), read from the ground as the
  water step finds it: the landforms and the edits, before any water (so the water features' order changes nothing).
- Its water stands only where its bed lies under that level. The bed is the shallower of the old basin (the level
  less the depth, reached 10 m in from the drawn edge) and the ground less the freeboard, less the depth reached 10 m
  from the ground inside too high to hold water: a pond digs its basin, never more than its depth and freeboard, only
  in the ground near its level. Every other node is left as it is.
- On flat ground this is the old basin, bit for bit; a pond given its own `level` is cut to it as before.
- A dam is never implied. Where a scenario wants a pond on a slope full, its dam is drawn as a feature of its own (a
  raised line across the valley) and the pond given the dam's level.

## Consequences

- Good: no pond digs into a hill; the rule needs nothing from streams, edits or other ponds.
- Bad: a pond drawn across a slope holds water only at its low end, and on a steep one only a shallow wedge (on a
  17 % slope, about 0.3 m deep): its survey outline is larger than its water.
- Neutral: ponds on flat valley floors (most of Austerlitz's) are as they were.

## Alternatives considered

- **An implicit dam on the downhill shore** (the first fix): the whole outline full, but a hidden heightfield edit in
  the water step that met every other feature there; dropped after three review rounds.
- **The old basin with a cap on its depth below the ground**: still a trench across the dry part of the outline.
