---
status: accepted
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

The owner accepted the rule (2026-10-14) after judging the two ends side by side: units in the full light wash into
the ground, units with almost none of it (LC1b's first shares) read as pasted onto the scene. They asked for the
middle (`docs/plans/done/lc1c-unit-share.md`).

## Decision

We will light units (the painter's `KEEP_HUE` path: the army blocks now, the figures from L3) with the light's
value and only part of its hue. The share is a mood's `units.tint` (`src/look/mood.ts`, 0.4 in `golden`); the
lit band's warm lift is a cast, not light, so units take that share of it (a grey lift in its place would wash a
dark coat's colour out). The valley mist over a unit is capped (`units.mist`, 0.08, against the ground's 0.42), and units
take a share of the grade (`units.grade`, 0.2), now that the grade is part of each material (`gradeOf`,
`src/look/shaders/painter.glsl`). Under all of the air (the mist, the distance haze, the grade) a unit keeps its value
(`airOf`), so the air turns its colour, not its contrast with the ground. Their shadow band keeps its cool hue, as before. Pillar 3 holds for the world and
for a unit's shadow side; a unit's lit side is white-balanced. Each coat's lit colour is checked by
`tools/coat-check.mjs`.

## Consequences

- Good: the coats keep their colour. At both of the note's spots every coat stays within 20° of its painted hue and
  at 45 % of its saturation or more, and the white stays white (`tools/coat-check.mjs`,
  `docs/plans/done/lc1c-unit-share.md`); in the full light the blue fell to 16 % in the valley and the green moved
  55°. Keeping the value under the air keeps the guard: no block that separates on LC1b's shares fails.
- Bad: a unit is a little less a part of the scene's light: it takes some of its warmth, the air and the grade, not
  all. The Russian green, a dark coat near the meadow's hue, sets the bound: a share past golden's turns it olive.
- Bad: a far unit no longer fades in value with the distance haze (it did up to LC1b), only in colour: the depth
  cue on units is the haze's hue, not its value. A unit's own highlights stop at 1 (clamped), so they bloom a little
  less.
- Bad: every mood must set the three shares by eye, and the coat check holds them to the bound.

## Alternatives considered

- A cooler, whiter sun for everything: it fixes the coats but changes the world's mood. That is LC2's choice
  (candidates judged blind), not a fix for units.
- Grading in the finishing pass with a unit mask: the frame's alpha carries the depth for the depth of field, and a
  mask there would blur unit edges under anti-aliasing.
