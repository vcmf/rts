---
status: active
last_reviewed: 2026-10-30
---

# Plan: G1b, an area's mend meets the ground round it

Track G (`docs/plans/active/track-g.md`), a fix after G1, into `epic/gameplay-map`.

## Problem

The owner, on the staff map's new light (G2), 2026-10-30: a rectangle west of Újezd "must be a modern earth work, no
way it exists in the day". It is `pit-ujezd`, a mended work (decision 0073): the plane through its rim missed the
ground round it by up to 3 m (the ground curves there), and the blend over its 5 m edge made walls of it.

## Scope

- `src/map/apply.ts`: an area's or a circle's mend settled into a membrane on the ground round it (decision 0091).
- A test of it on ground no plane fits, failing on the plane.
- The look data of the Austerlitz windows rebuilt (their heights change where a mend lies in them).

## Acceptance

- The test passes; it fails with the plane (2.4 m off the ground along the outline, against under 0.4 m).
- Across the pit's rim the ground steps no more than the ground round it (profiled); the compile no slower (measured).
- The staff map with no rectangle there, for the owner.

## Results

- The test: under 0.4 m with the membrane, 2.42 m with the plane.
- The pit's rim (x = −35 m): the ground 12.6, 12.4, 12.3 m across it, where it was 12.6, then 15.0 (a 2.4 m wall).
- Austerlitz compiles in about 2.1 s in Node either way (three runs each, the dev Mac).
- On G2's light (`scratch/g2/pit-*.png` in its worktree): the walls gone; blended into the ground over its `edge` the
  membrane still left a ghost of the rectangle (the pit's stepped sides mixed back in), so an area's mend now takes
  its whole reach at full weight. What remains: a faint flat patch over the west half, where the ground falls over a
  rounded shoulder to the Goldbach, and a soft line along the north edge (a membrane's slope at its rim; a biharmonic
  fill is the next step if the owner still sees it).
