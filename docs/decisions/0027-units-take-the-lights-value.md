---
status: proposed
date: 2026-10-14
---

# 0027 Units take the light's value, not its hue

## Context

The owner (2026-10-13): "a blue coat in an orange [light] has an orange tilt". Measured
(`docs/research/colour-and-light-review.md`): on the valley floor the French blue fell from an HLS saturation of
0.58 to 0.08, the Russian green from hue 133 to 93, and the Austrian white turned cream. Three warm tints stack: the
sun's colour, the valley mist and the grade. That breaks art bible pillar 1 (the armies are the most saturated objects
on screen). Pillar 3 ("light as colour": warm where the sun hits) asks for the opposite, for every surface. The eye
resolves this in life by white balance: under a warm sun we still see a blue coat as blue.

## Decision

We will light units (the painter's `KEEP_HUE` path: the army blocks now, the figures from L3) with the light's
value and only part of its hue. The share is a mood's `units.tint` (`src/look/mood.ts`, 0.25 in `golden`); the
lit band's warm lift is a cast, not light, so units take that share of it (a grey lift in its place would wash a
dark coat's colour out). The valley mist over a unit is capped (`units.mist`, 0.04), and units take
a share of the grade (`units.grade`, 0), now that the grade is part of each material (`gradeOf`,
`src/look/shaders/painter.glsl`). Their shadow band keeps its cool hue, as before. Pillar 3 holds for the world and
for a unit's shadow side; a unit's lit side is white-balanced. Each coat's lit colour is checked by
`tools/coat-check.mjs`.

## Consequences

- Good: the coats keep their colour. At both of the note's spots every coat stays within 10° of its painted hue and
  at 70 % of its saturation or more, and the white stays white (`docs/plans/done/lc1b-coats.md`). Readability
  improves: 45 of the guard's 48 default-view blocks separate better than before, and none newly fail.
- Bad: a unit is a little less a part of the scene's light; its warmth comes from the shadow's contrast and the rim,
  not a warm cast. It also takes none of the grade's haze toward the frame's top (a depth cue): with it, the coats at
  the top lost about a third of their saturation (the valley spot, measured), against pillar 1.
- Bad: every mood must set the three shares, and the coat check holds them to the bound.

## Alternatives considered

- A cooler, whiter sun for everything: it fixes the coats but changes the world's mood. That is LC2's choice
  (candidates judged blind), not a fix for units.
- Grading in the finishing pass with a unit mask: the frame's alpha carries the depth for the depth of field, and a
  mask there would blur unit edges under anti-aliasing.
