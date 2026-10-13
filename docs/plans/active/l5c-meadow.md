---
status: active
last_reviewed: 2026-10-13
---

# Plan: L5c, a dense meadow near the camera, and wheat without a lattice

Track E, stage 1 (`docs/plans/active/track-e-look.md`, L5 the ground and L7 foliage). Research:
the grass research note (PR #69, grass-and-fields in the research notes once merged) (Tiny Glade, Total War, the techniques). Art direction: `docs/art-bible.md` §3
(edge breakup), §4 (the ramp), pillar 1 (readable: armies the most saturated, never hidden).

## Problem

The owner (2026-10-13): "the grass … it's needy and sparse (like u see clearly the matrix) but in reality it must
be like tiny glade: random, dense". In the code (`src/look/nature.ts`):
- the grass is about 4,200 tufts over a 175 m circle, one a ~23 m²: separate props on painted ground;
- the wheat field is a lattice, one tuft every 1.25 × 1.3 m nudged ±0.25 m: rows and columns read as a matrix;
- every tuft is drawn every frame whatever the zoom, so making them denser everywhere multiplies the cost.

## Scope

- **A. The meadow near the camera** (`src/look/meadow.ts`, `shaders/meadow.vert|frag`): the new pack's two light
  grass clumps (`Grass_Small`, 58 triangles; `Grass_Large`, 108; exported once from the owner's pack into
  `data/meadow-grass.json`), drawn as static thin instances on three square rings around the camera's focus (cells
  0.5, 1 and 2 m), snapped to their cell so nothing swims. The vertex shader places each clump from its slot and a
  hash of its world cell (jitter, size, lean, yaw), reads a baked meadow map (the ground's height and a growth
  density from the cover and the placement rule: none on roads, tracks, village ground, fields, banks or water) and
  a clump field (cells of a few metres sharing height, lean and shade: the patchwork), and fades each clump out by
  its distance with its own hash (no hard edge). Lit like the ground (its normal), darker at the root, lighter at
  the tip (the pack's `Grass.png` is that gradient), the ground's colour under it.
- **B. The meadow's pattern on the ground** (`terrain.frag`, a shared `shaders/meadow.glsl`): the same clump field
  as a light and dark patchwork on grass cover, so the far meadow reads as grass and the near clumps grow out of
  the same pattern. Procedural first; a painted greyscale brush picture can replace it later.
- **C. The wheat without a lattice:** the field's tufts placed by a hash per cell (no rows or columns), denser, with
  a ragged edge.
- `?meadow=off` puts back the old scatter; `?bench=meadow` benches the two.

Not in scope: the flower clumps from the pack's `Flowers.png` (next), the attribute data and new ground kinds (the
terrain plan's other phases), trampling under formations.

## Acceptance

- `npm test`; the goldens are expected to differ (a look change, reported).
- Pairs (`?meadow=off` against the meadow) at the near, mid and far views, summer and winter, for the owner.
- The cost on the dev Mac, a one-page A/B (`?bench=meadow`) read on the frame interval with its repeat spread, at
  every zoom; the triangles drawn.
- `node tools/guard.mjs` against main: no new failing block (the grass must not swallow a formation).

## Results (2026-10-13, the dev Mac, a proxy)

Pairs (not committed; `scratch/compare/meadow/` in the main checkout): `?meadow=off` beside the meadow at the near,
mid, far and winter views.

- **Look:** near the camera the ground is covered in grass (clumps a 0.5 m cell, about four a square metre, with the
  patchwork of the clump field); at the mid zoom the meadow reads as grass, not paint; the wheat has no rows nor
  columns and a ragged edge; in winter the grass shrinks under the snow.
- **Cost** (`?bench=meadow`, one page, A B B A, the frame interval; the arms' difference per camera, yaw −45°, 0°,
  +45°): the first version cost +3.5 ms at the closest zoom and +4.5 to +5.3 at the default; after the early exits,
  the small clump on the outer rings, the lean shading and rings 20 % smaller:

  | Zoom | meadow, none (ms) | paired difference | repeat spread |
  |---|---|---|---|
  | Closest | 5.63, 3.82 | +2.00, +2.00, +1.45 | 1.20 |
  | Default | 7.17, 5.12 | +1.40, +2.45, +2.30 | 0.30 |
  | Widest | 8.63, 7.45 | +1.25, +1.25, +1.05 | 0.20 |

  About +1.1 to +2.5 ms a frame: a large share of L7's 3 ms for all foliage. A flat fragment shader (a measurement,
  not shipped) put the shading at about half of it and the vertices (every slot's, early exits included) at the
  other half. The meadow map's bake: 64 ms on load (the CPU).
- **Readability guard** (against main): passes after the grass was brightened (a first, darker meadow dropped
  `meadow.Russia` to 0.077). The meadow blocks keep less margin than on main: `meadow.Russia` 0.110 (main 0.155),
  `meadow.France` 0.149 (0.222).
- **Not measured:** the min-spec laptop; the meadow with formations standing in it (the guard's blocks only).
