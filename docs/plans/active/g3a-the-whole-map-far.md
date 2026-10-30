---
status: active
last_reviewed: 2026-10-30
---

# Plan: G3a, the whole map as the far ring, the camera free over it

Track G (`docs/plans/active/track-g.md`), the first sub-phase of G3 (`docs/plans/active/g3-austerlitz-in-3d.md`), on
`epic/gameplay-map`. The owner (2026-10-30): G3a first; the tile data built, not committed; the static light
invariant reworded.

## Problem

A map world on the look page (`?map=austerlitz&window=…`) is one window: the detailed tile (800 m) at the window's
centre, the far ring (2600 m, 14.3 m cells) around it, the camera's focus held within ±235 m of the centre
(`SPEC.play`, `holdView`). Past the ring nothing; past the map's edge the ring holds the edge's heights, meadow
(G1's stopgap, `checkWindowInside`). Off the tile the ground is unlit: the light map's `LM()` returns full light and
no sky occlusion (`painter.glsl`), the shadow map covers the tile alone.

## Scope

1. **The map ring.** In a map world the far ring covers the map's play area (`map.play`, 3000 m square about the
   map's centre, which is not the window's) and every view from it, and comes from the window's data: its corner and
   size are no longer `±SPEC.far/2`. Its cells are 17.86 m, ten tile cells (16 m, the G3 plan's figure, is not a whole
   even number of tile cells, which the apron needs: `derive`); its edges lie on the tile's grid. The side: the play
   area plus the camera's widest footprint each way (403 m on flat ground, `checkView`), rounded up: about
   3900 m, about 220² nodes, 96,000 triangles. The demo world keeps `SPEC.far`.
2. **What reads the ring as a square on the origin** reads its rectangle instead (a uniform, `uFar`: its corner and
   side): the far macro bake, the relief tone, the painted river mask, the far ring's mesh and the apron.
3. **The ring's cover:** the macro colour's far bake (4 m texels) reads a cover of its own over the ring at 4 m
   (`fineAreas` at 4 m, the ways cut to the ring); the fine cover (1 m, the tile's bakes and pixels) stays over
   `SPEC.far` about the window. The trees over the ring as far groups (`mapTrees`, `farCuller`).
4. **Paper past the map's edge** (the owner's choice, track-g.md): the ring's ground past the map's extent is the staff
   map's paper (`src/render/lit/`'s colour), unlit, its heights the edge's held as today, a fine ink line on the edge.
5. **The coarse light.** G2's `bakeLight` on the map's heights (2 m nodes, ×1, the look's sun `SUN_TOWARD`, a 2°
   disc), at build time, stored in the window's data (R the sun's soft shadow, G the open sky; 1501² × 2 bytes,
   4.5 MB): measured 1.6 s in Node on the dev Mac (load 10). Off the tile `LM()` reads it, the sun's shadow and the sky
   standing in for the tile's shadow map and occlusion; over the tile's last 60 m the two cross-fade (as the macro
   colour's bakes do).
6. **The camera free over the map:** `holdView` clamps the focus to the map's play area (in the window's metres, from
   its data), not `±SPEC.play`; `FocusFollow`'s height range is the map's ground in play (the ring's nodes), not the
   tile's; `checkView` holds the play rectangle plus the footprint inside the ring's rectangle. `SPEC.play` and
   `margin` keep their meaning for the tile (where the detail is whole: `nearFrameOf`); past it the ring shows, as
   G3a intends. The page's tools (`?benchat`, the armies' focus) clamp to the same rectangle.
7. **Off the tile, what is the tile's stays on it:** the meadow's grass fades out over the tile's last metres (its
   map is the tile's: off it the grass would stand on the edge texel's height), the armies stay on the tile (Track E's
   A4), the roads' live paint is the tile's (the ring shows the far bake's 4 m roads), the trees off the tile cast no
   shadow. These are G3b's and G3c's.
8. **The tile data built, not committed:** `data/austerlitz-*.lookdata` git-ignored, written by
   `npm run build:data`; a Vitest global setup builds a missing one before the tests that read it; CI builds them in
   the check job. `check:data` compares the demo world's file only. The demo world's stays committed.
9. **The static light invariant** amended (AGENTS.md, decision 0092): "static light is never computed per frame:
   baked once per map and sun, coarse for the whole map, fine lazily around the camera, deterministically; only moving
   things get per-frame lighting".

Out of scope: tiles (G3b), bakes per tile (G3c), the water, villages and woods past the window (G3d), the frame while
panning (G3e).

## Approach, in order

1. The data: the ring's rectangle and its heights (`windowHeights`), the ring's cover at 4 m, the ways and trees over
   it, the coarse light; `LOOK_VERSION` 10; `checkLookData` takes an offset ring on the tile's grid. Measure the build
   time and the files' sizes.
2. The page: `uFar` in the shaders and the mesh; the paper and its line; `LM()` off the tile.
3. The camera: the play rectangle, `FocusFollow`'s range, `checkView`.
4. The data built not committed; the decision record and AGENTS.md; `docs/systems/look.md`.

## Acceptance

- Tests: the ring's rectangle on the tile's grid and holding the play area and the footprint (`derive`, `checkView`,
  a failing case each); `holdView` clamping to an offset rectangle; `FocusFollow`'s range from the ring; the ring's
  heights at an offset; the paper past the edge (no cover, no trees there); the coarse light in the data equal to
  `bakeLight`'s; `checkLookData` refusing a ring off the tile's grid.
- Pan from edge to edge on both windows (`tools/shot.mjs`): no error, the coarse map everywhere, the window's detail
  where it is; shots in `scratch/g3a/` of the tile's edge (no seam in the light), the map's edge (the paper) and a view
  1 km from the tile.
- The frame at the widest zoom over the ring, measured on the preview build under the bench lock (`bench-look.mjs`),
  against the window's today.
- The look checks pass on the windows as today (the guard, `detail-check`, `water-check`, `water-look-check`).

## Branches in flight on `src/look/`

The smoke epic (#239: `main.ts`, `smoke.ts`, `units.ts`, `world/armies.ts`), `look/cavalry-artillery`, the farmland
and gun-smoke tests. G3a touches `spec.ts`, `world/from-map.ts`, `world/data.ts`, `terrain.ts`, `macro.ts`,
`relief.ts`, the shaders' far reads and `main.ts`'s camera lines; whichever merges second rebases.

## Risks

- The trees over the whole ring: the far groups' frustum test runs per instance on a view change (`farCuller`): to
  measure.
- The tile's edge: the fine light's shadow map and occlusion against the coarse light's sun and sky, two different
  measures: the cross-fade by eye.
- The build time and the files: the ring is 2.2× today's in area; the fine cover is not.
