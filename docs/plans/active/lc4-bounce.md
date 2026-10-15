---
status: active
last_reviewed: 2026-10-15
---

# Plan: LC4, bounced light on units and crowns

Track E, LC4 (`docs/plans/active/track-e-look.md` §LC). The owner's review (2026-10-13): "global illumination changes
a lot of things, like a blue coat in an orange light has an orange tilt". The look has no bounced light. Its one
stand-in, a 15 % tint of a tree's albedo toward the ground under it (L5), colours the leaves rather than lighting them,
and units have nothing.

## Scope

- **The ground's bounce** in `paint()`, for units (the army blocks, the figures to come) and the trees (`nature.frag`,
  `canopy.frag`): light from below, in the colour of the ground under the point, on faces that look down or sideways,
  in the shadow and mid bands (the sun's band is the sun's), times the occlusion.
- **It replaces the trees' albedo tint.** The grass blades keep theirs: they are painted from the ground.
- **Units take the bounce's hue at their share** (`wb`, decision 0027), its value whole.
- **The sky's part needs no new term:** the shadow band is already the sky's colour (`shadowOf`, the mood's).
- Not in scope: the ground's own bounce (LC5), buildings.

## Approach

- The caller sets `pBounce` before `paint()`: the ground's colour under the point (`groundBounce`, the class's
  colour, through `earthOf` and `groundSeason`). The painter includes no ground code, so it cannot read the ground
  itself. `block.frag` gains `#include<shore>` to read it.
- In `paint()`, under `BOUNCE`: `c += alb * pBounce * k * down * (1 - lit) * occ`, where `down = (1 - N.y) / 2` and
  `lit` is the sun band's share. `k` is the mood's (`bounce`, about 0.35), tuned by eye. Units take the bounce's colour
  white-balanced, as the sun's.
- The trees' `bw` tint goes.

## Acceptance

- Pairs: a coat block on wheat and on grass, close; a copse's crowns. A warm underside on the wheat, a green one on the
  meadow.
- `tools/coat-check.mjs` passes; `tools/guard.mjs --base` main, three views and seasons: no new failure.
- The goldens: they change on the trees (expected), the ground unchanged.
- The frame's cost: the bench against main.
- `npm test`, `node tools/check-docs.mjs`; `docs/systems/look.md`; decision 0027 extended if needed (a record).

## Results

(filled in before merge)
