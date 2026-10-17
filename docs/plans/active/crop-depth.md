---
status: active
last_reviewed: 2026-10-17
---

# Plan: straight crop stalks and a dark ground under the near grass and crops

The owner (2026-10-17): the wheat (the grass clumps reused) should stand "more straight upward" and higher; the grass
and crops cast no shade among themselves: "use the grass texture on the terrain with darker tone (dark green for
grass, dark orange for wheat) then put the grass/wheat on".

## Scope

- **Straight crops** (`meadow.vert`): a crop's clump CROP_WIDE (1.5) times the grass clump's spread at its root, its
  fan undone (the grass's blades spread about 1 + 1.15 aV up their height: measured from `data/meadow-grass.json`),
  so its stalks stand parallel; barely any lean.
  The height cap stays (decision 0026, 1.2 m): straight stalks lose none of it to the lean.
- **The dark ground under the near clumps** (`meadowUnder`, `shore.glsl`): the ground's colour times a deep green
  under grass and the green crop, a deep ochre under wheat and stubble, as the meadow map's growth says, within the
  meadow's reach (60 to 100 m from the focus), less as the camera rises past 130 m, none with the meadow off; the
  terrain and the water's land side alike (one ground, no seam).
- Docs: `docs/systems/look.md` (the meadow).

## Approach

- The crop's shape in `meadow.vert` (no new mesh): the grass clump's horizontal spread divided by its measured fan
  (1 + CROP_FAN aV) and scaled by CROP_WIDE; a crop's normals less pulled up in `meadow.frag`.
- The under-layer in `shore.glsl` (`meadowUnder`, both the terrain and the water's land side), reading the meadow
  map, its reach and strength set each frame by `src/look/meadow.ts` (the outer ring's band, the zoom's WIDE), its
  season factors shared with the clumps (`meadow.glsl`); off with the meadow, and while the checks draw the ground
  alone (`terrainOnly`).

## Acceptance

- Captures before and after (the wheat close and at the default zoom, the meadow grass); the owner judges.
- The bench against main; the guard (its crops view: a formation in a field), the coat, negatives, water, macro
  checks, the goldens: once, at the end. `npm test`, `node tools/check-docs.mjs`.

## Results

- **The owner** (2026-10-17): "looks good"; the stalks first came out sparse (each clump narrower): fuller since.
- **The bench** (Metal, the frame interval, main / this branch, twice, before the review's fixes): close 4.43 / 4.70
  to 4.83 ms, default 5.76 / 6.33 to 6.42, widest 6.54 / 6.75 to 6.83: +0.3 to 0.6 ms.

## Review

- **Round 1:** the stalks leaned inward (a cone, CROP_STRAIGHT 0.4): 0.64 from the mesh's measured fan; their
  normals were the fan's; the green crop lost its under-layer in late autumn and was darkened ochre; the meadow's
  switch left the ground dark; the water's land side had none (a seam); the lab hill took it; the map bound to every
  material. Fixed as above.
- **Round 2** (severe: the checks' ground alone kept the dark under-layer, so the macro check measured darkened
  ground): `terrainOnly` turns it off. Also: the taper by the measured fan (a linear one left the stalks fanning on
  the outer rings), a crop's normals less pulled up in the fragment shader (the vertex levelling was undone there),
  the season factors shared with the clumps, the reach and the zoom fade from the meadow's own numbers (each frame),
  the cover read only under a crop, the plan's approach.
