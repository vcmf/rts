---
status: active
last_reviewed: 2026-10-20
---

# Plan: frame headroom, 1: the road split

The owner (2026-10-19): the look holds 120 fps in most views but tops out at 114-118 at the river-and-wood view at
default zoom, on main's production build, and the armies are still to come. Target: the world at about 6.5 ms a
frame at the reference views (about 150 fps uncapped, so about 1.7 ms stays for the armies within decision 0036's 120
fps soft target), measured on production builds (`vite build` + `vite preview`) with `tools/bench-look.mjs`. This
plan records what was measured and its first step, the road split; each step after it gets its own plan (below).

## Findings (2026-10-19/20)

Ablation on the production build (`tools/bench-look.mjs`, Metal, headless 1920×1080, `?benchat=-60,-20&season=0&dof=1`,
each variant interleaved with the full page; the full page about 10.5 ms at default zoom, about 8.5 ms in the
owner's browser). Cost of each, by its absence, default / widest / closest zoom, ms:

| Off | Default | Widest | Closest |
|---|---|---|---|
| the terrain's colour detail (`?macro=flat`: dirt, roads, comb, earth, colour variation) | 3.4 | 1.6 | 2.2 |
| meadow grass (hidden) | 1.8 | 0.4 | 2.8 |
| 4× MSAA (against 1×) | 1.8 | 1.6 | 1.5 |
| far trees | 0 | 2.5 | 0 |
| water | 0.85 | 0.7 | 0.1 |
| 2× MSAA instead of 4× | 0.7 | 0.3 | 0.7 |
| valley mist (with the shafts) | 0.4 | 0.3 | 0.7 |
| bloom | 0.4 | 0.3 | 0.5 |
| grade | 0.3 | 0.2 | 0.5 |
| near trees (crowns and cards) | 0.3 | 0.6 | 0.1 |
| props | 0.2 | 0.1 | 0.2 |
| shadows, occlusion, grain, edges, clouds, backlight, detail layer | ~0 | ~0 | ~0 |

The depth of field is not in the table: its switch (the panel's, set on load) left the passes built, so its run
measured the full page. Inside them:

- **The terrain's colour**: the roads 1.9 ms of it at default zoom (the earth 0.4, the meadow's dark under-layer 0.2,
  the dirt and the comb about 0). Of the roads, about 0.7 ms was the shader's size alone (compiled in, never run:
  every ground pixel paid it) and the rest the road path. Early-outs in the road paint (exact: no pixel changed) and
  a tighter search reach (below) gained nothing measurable on their own: the loop over the segments is not the cost.
- **The meadow**: its fragment shading about 1.3 ms at default zoom and 2.0 closest (a flat colour in its place), the
  rest the vertex work. Of the shading, the snow, cloud, mist and haze together 0.55 / 1.0 ms, each alone within the
  bench's noise (±0.4 ms); the ground colour under the root and the light map read about 0.
- **MSAA**: the depth attachment invalidated before the resolve gained nothing (dropped).
- **The render scale** (fixed, against 1): 0.9 about 1.1 ms less at default zoom and 1.0 closest; 0.8 2.4 and 1.9.
- **The bench itself**: its per-pass GPU timers split the Metal render pass on alternate frames; whole frames only
  (`?passes=0`, added here) measured the same frame times (so the table stands).
- **Draw order**: Babylon sorts the opaque draws by the mesh's material's creation; a material made late puts the
  ground after the trees, which costs (`docs/plans/done/trees-perf-trunks.md`) and changes pixels at ties.

Code inventory and research (the agents' reports, not committed) agree on the structural levers: the terrain's
colour is almost all a function of the world position (a camera-following cache of it, updated at the edges, as
Battlefield 3's and Unreal's virtual texturing), the meadow's per-clump terms evaluated per vertex and per fragment
(a per-clump state texture), the leaf cards' `discard` drawn among the opaque draws, and the render scale's upscale
(today the browser's bilinear stretch; FSR1's EASU ships with Babylon 9.29).

## Scope (this PR)

- **The road split**: near the camera too, only the tile's triangles within reach of a road take the live roads'
  material (`ROADS`); the rest take the material without them, whose `roadPaint` returns the colour unchanged, so
  the pixels are the same (but for a step of rounding between the two programs). The test is the shader's own first
  one (the cover's wear distance under the road gate: `ROAD_NEAR`, the cover's warp `macro.warp`, and slack), on the
  cover's nearest texels under a triangle's grid cell and 1 m round it, with a texel of slack (`splitByRoad`,
  `src/look/terrain.ts`). One `MultiMaterial`, made with the terrain's materials so the ground keeps its place in the
  opaque draws. Far out the baked material as before. `?split=0`: the live material on the whole tile (the A/B).
- **`ROAD_NEAR` 5.5 → 2.6 m**: the paint reaches at most `road.edge` (1.07 m; the shader clamps its ragged edge there)
  past a side at the warped point where the cover is read; a cover texel's centre within √2 m, its distance rounded
  to 0.05 m. The spec's check counted the warp twice. Fewer triangles live.
- **The bench's `?passes=0`** (whole frames only; the result says so). The investigation's mesh and panel switches
  are not kept (they changed the bakes, or left passes built).

## Acceptance

- Golden screenshots (`tools/golden.mjs`) against main: every view's pixels identical (the far-edge view differs by
  a few pixels from main to main too). Met: 0 differing pixels, 2026-10-20; after review round 1 (the triangles classed by
  their grid cell, a few more live) 4 pixels of 1/255 in two views: the two shader programs round apart by a step.
- The bench against `?split=0`, whole frames, interleaved, 3 rounds: about 1.1 ms less at default and closest zoom
  (10.37 / 10.43 / 10.67 against 11.57 / 11.67 / 11.62 default; 8.05 / 8.22 / 8.32 against 9.37 / 9.65 / 8.95
  closest; the machine loaded, so the absolute numbers high), none at the widest (the baked material there).
- The checks as main; `npm test`.

## Next (each its own plan and PR; drafted and measured first, reviewed once it works: the owner, 2026-10-20)

- **The meadow's clumps**: their per-clump state (root, height, growth, crop, flow; the light, snow, cloud and air at
  the root) in a texture per ring, rendered when the ring moves; the vertex shader one read. Estimate 0.9-1.6 ms.
- **The render scale 0.9 at default and close zoom** (the owner, 2026-10-20), upscaled by FSR1's EASU with the grain
  after it at full resolution; decision 0036's full-resolution pass for units then owed from default zoom.
- **The leaf cards** alpha-tested and drawn front to back. Estimate 0.2-0.6 ms.
- **The terrain's colour cached** in camera-following levels, the live pass a few reads. Estimate 2-2.7 ms; pixels
  close but not identical up close (the owner's call).
- Fallbacks, the owner's call: 2× MSAA (0.7 ms), far-tree impostors (the widest zoom).
