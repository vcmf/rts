---
status: done
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
- **B. The meadow's pattern on the ground** (`groundAt`, a shared `shaders/meadow.glsl`): a brush tile
  (`data/meadow-brush.png`, stamped by `tools/meadow-brush.py` from the owner's grass brush pack, which stays out of
  git) and the clump field as a painterly light and dark patchwork on grass cover, so the far meadow reads as grass;
  the near clumps take their shade from the same tile and field.
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

  About +1.1 to +2.5 ms a frame. After review round 1 (round rings, no grass in the formation zones):

  | Zoom | meadow, none (ms) | paired difference | repeat spread |
  |---|---|---|---|
  | Closest | 5.17, 3.95 | +1.25, +1.20, +1.20 | 0.20 |
  | Default | 7.32, 5.67 | +1.95, +1.65, +1.35 | 0.60 |
  | Widest | 9.57, 8.55 | +0.85, +1.15, +1.05 | 0.60 |

  About +0.9 to +2.0 ms a frame. After review round 2 (the height capped, the pattern moved into the macro colour's
  bake, the instanced slots without matrices, a half-float map):

  | Zoom | meadow, none (ms) | paired difference | repeat spread |
  |---|---|---|---|
  | Closest | 4.70, 3.78 | +0.80, +0.85, +1.10 | 0.70 |
  | Default | 5.83, 4.65 | +1.25, +1.15, +1.15 | 0.20 |
  | Widest | 7.82, 6.85 | +0.55, +1.15, +1.20 | 0.30 |

  About +0.6 to +1.25 ms a frame for the grass. The ground's pattern is in the macro colour's bake (the default arm):
  nothing a frame (the "none" arm, the pattern baked and the grass off, against `?meadow=off`, separate runs: 4.65
  against 4.68 ms at the default zoom). Measured before that move, the pattern computed a pixel cost +0.75 to +1.95
  ms on its own. The bake holds it a little softer than the pixel did (its 0.5 m texel). A flat fragment shader (a measurement,
  not shipped) put the shading at about half of it and the vertices (every slot's, early exits included) at the
  other half. The meadow map's bake: 64 ms on load (the CPU).
- **Readability guard** (against main): passes. A first, darker meadow dropped `meadow.Russia` to 0.077; the grass
  was brightened (0.110), kept out of the formation zones, as the placement rule asks (0.124), and its colour taken
  from the painted ground: `meadow.Russia` 0.149 (main 0.155), `meadow.France` 0.221 (0.222).
- **The grass's height:** 0.62 m typical, never over 0.85 m (`HEIGHT_MAX`), the same on every ring.
- **Checks:** `tools/river-check.js` (the meadow's growing cells stand in for the grass tufts in its population) and
  `tools/look-check.js` pass on the page; river-check also checks the baked growth (none in the formation zones nor
  over the water, a metre grid over the near field; between a fifth and four fifths of the tile growing: 0.45); the
  wheat is 690 tufts (the lattice's 382 or so).
- **Not measured:** the min-spec laptop; the meadow with formations standing in it (the guard's blocks only).

## Review (`/code-review high`)

- **Round 1** (50de70a): severe: `tools/river-check.js`'s population failed (the grass tufts gone); grass in the
  formation zones, against the placement rule. Moderate: the pattern's class unwarped (square steps at painted
  edges); the growth copied a 2 m grid into 1 m texels (stepped grass edges); the pattern's fine octave aliasing
  with distance; the wheat 3.4 times the lattice, not twice, unmeasured, its edge on the cover's grid; the meadow's
  identity matrices walked by the look check; slots outside the round band; the bank rule copied. Light: uniforms
  set again each frame. All fixed; the brush tile added in the same round (B).
- **Round 2** (5f49ec9): severe: the outer rings scaled the grass to 1.5–2.5 m (hiding a formation); the brush's
  two octaves shared a 91 m period (a grid); the growth's interpolation carried grass up to 2 m into the formation
  zones and onto banks. Moderate: the wheat skipped the cover's edge rule; the grass took the class's flat colour,
  not the painted ground; the ground pattern's cost unmeasured; per-clump work at every vertex and a 10 MB float map;
  a population check that could not fail; identity thin-instance matrices needing special cases; the cull margin in
  clip units. Light: the brush tile's seam column, a comment, no tool to rebuild the grass data. Fixed: one height
  for every ring under `HEIGHT_MAX`; unrelated scales, turn and a slow warp; the hard rules applied at every texel;
  the wheat through the one placement rule; the grass coloured by the macro arm under its root; the pattern moved
  into the macro bake and measured (above); a half-float map; river-check's meadow checks; `forcedInstanceCount`
  with an instanced slot buffer (no matrices, no special cases); the cull at two heights; `math.floor` in the tile;
  `tools/meadow-grass-export.py`. Left: the per-clump work at every vertex (WebGPU compute, later).
- **Round 3** (6afaa8c): severe: the grass brush stamps were not git-ignored (a comment on the ignore line), fixed
  at once (941b2bd). The owner chose to continue (2026-10-13) over a redesign; fixed in one pass: the rule leaks
  (the shader's blend carried grass up to 1 m into zones and onto banks, and the double blend up to 1.5 m onto
  roads and the wheat): the rules now zero each texel and the growing area shrinks a texel, so the GPU's single
  bilinear read stays inside the allowed ground (one read, not four), and river-check samples the growth as the GPU
  reads it, at every half metre, against the full bank rule; the grass's shade from the clump field alone (the ground
  colour under it already holds the brush pattern); one hash a trait (yaw and lean no longer tied to the jitter);
  the ground colour read from the bake (one read), the flat class colour on the other arms; the meadow's meshes in
  the bench's scatter pass; the macro arm registered as a binder, so later materials get it. The meadow map's bake
  now takes 272 ms on load (the rules at every texel; 64 ms before). Guard: `meadow.Russia` 0.157 (main 0.155),
  `meadow.France` 0.222 (0.222). A confirming round follows.
- **Confirming round** (5ea8a72): round 3's fixes hold. Found: the rule held at each root, not across a clump's
  blades (an outer-ring clump reaches 1.3 m: blades about 0.5 m into a zone, 0.9 m onto the bank strip), and the
  checks looked at roots only, within 200 m. Fixed: the growth keeps roots `CLUMP_REACH` (1.45 m,
  `src/look/meadow-spec.ts`) from the zones and the banks; river-check tests every growing point's footprint
  (its root and eight points 1.4 m round it) over ±335 m, the ground the rings can reach; look-check tests that no
  clump floats (it found the map's 1 m height off the drawn tile by up to 5.2 cm where grass grows, 31 cm at
  creases where none does: the clumps now sink `MEADOW_SINK`, 6 cm); the slot margin 2.2 cells (the diagonal); the
  brush tile loaded only with the meadow, with its own error; the outer rings' ground colour read at their cell's
  footprint; no meadow on WebGL1 (a half-float texture in a vertex shader); stale comments and docs; the
  `groundArm` alias and an unused field; the rules tested per texel only near their edges (the bake 272 to 151 ms).
  Final: `npm test` 255 of 255; river-check and look-check pass; guard `meadow.Russia` 0.157 (main 0.155),
  `meadow.France` 0.222 (0.222); the grass +1.0 to +1.1 ms a frame at the closest and default zooms, +0.2 to
  +0.95 at the widest (`?bench=meadow`, repeats within 0.1 ms but 0.8 at the widest); the ground's pattern nothing a
  frame (baked). Review stops here, as the owner agreed.
