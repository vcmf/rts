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
   size are no longer `±SPEC.far/2`. Its cells stay the demo's 14.3 m, eight tile cells (16 m, the G3 plan's figure,
   is not a whole even number of tile cells, which the apron needs: `derive`; one far cell size kept); its edges lie
   on the tile's grid (`ringFor`). The side: the play area plus the camera's widest footprint each way (544 m on the
   map's whole range of heights), rounded up a cell: on Austerlitz 4.1 km, 291² nodes, about 170,000 triangles. The
   demo world keeps `SPEC.far`.
2. **What reads the ring as a square on the origin** reads its rectangle instead (a uniform, `uFar`: its corner and
   side): the far macro bake, the relief tone, the painted river mask, the far ring's mesh and the apron.
3. **The ring's cover:** the macro colour's far bake (4 m texels) reads a cover of its own over the ring at 4 m
   (`fineAreas` at 4 m, the ways cut to the ring); the fine cover (1 m, the tile's bakes and pixels) stays over
   `SPEC.far` about the window. The trees stay within `SPEC.far` about the window, as today (the whole map's: G3d).
4. **Paper past the map's edge** (the owner's choice, track-g.md): the ring's ground past the map's extent is the staff
   map's paper (`src/render/lit/`'s colour), unlit, its heights the edge's held as today, a fine ink line on the edge.
5. **The coarse light.** G2's `bakeLight` on the map's heights (2 m nodes, ×1, the staff map's `SUN`: the look's
   direction, a 2.5° disc), at build time, stored in the window's data (R the sun's soft shadow, G the open sky;
   1501² × 2 bytes, 4.5 MB): measured 1.6 s in Node on the dev Mac (load 10). Off the tile the far ring reads it in
   the light map's place (`COARSE_LIGHT`), the sun's shadow and the sky standing in for the tile's shadow map and
   occlusion; switched at the tile's edge, not cross-faded: the tile's materials use 15 of Metal's 16 samplers
   (measured, `__look.mats.samplers`), and no seam showed in the shots.
6. **The camera free over the map:** `holdView` clamps the focus to the map's play area (in the window's metres, from
   its data), not `±SPEC.play`; `FocusFollow`'s height range is the map's ground in play (the ring's nodes), not the
   tile's; `checkView` holds the play rectangle plus the footprint inside the ring's rectangle. `SPEC.play` and
   `margin` keep their meaning for the tile (where the detail is whole: `nearFrameOf`); past it the ring shows, as
   G3a intends. The page's tools (`?benchat`, the armies' focus) clamp to the same rectangle.
7. **Off the tile, what is the tile's stays on it:** the meadow's grass fades out over the tile's last metres (its
   map is the tile's: off it the grass would stand on the edge texel's height), the armies stay on the tile (Track E's
   A4), the roads' live paint is the tile's (the ring shows the far bake's 4 m roads), the trees off the tile cast no
   shadow. These are G3b's and G3c's.
8. **The tile data built, not committed:** `data/<map>-<window>.lookdata` git-ignored, written by
   `npm run build:data`; a Vitest global setup (`test/look-data-setup.ts`) builds a missing or out-of-version one
   before the tests (CI's test jobs so build them). `check:data` compares the demo world's file only. The demo world's
   stays committed.
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
- The frame at the widest zoom over the ring, measured on the preview build under the bench lock (`tools/bench-look.mjs`),
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

## Open questions

1. **The combed meadow's near bake** (`?grass=flow`) reads the window's cover about the focus; with the focus more than
   1300 m from the window it reads past it (the edge's texels). Off the tile no grass grows, so only the comb's strokes
   on the far ring show it: G3b's tiles bring the cover with them.
2. **The paper's season:** the far ring's paper is the staff map's summer tone; the staff map's changes by season. One
   paper for both views comes with the zoom handover (G4).

## Review

Round 1 (`/code-review high`, 10 findings, none severe; fixed or answered, then stopped):
- fixed: the look tools' views checked against ±235 m (`__proto.play` is now the world's play rectangle); the built
  page with no windows' data (`npm run build` builds a missing or stale one first, `--missing`); a stale or cut-short
  window file kept (rebuilt when older than its map or its sources, written whole then moved); the ring's far side
  counted in metres in `checkLookData` (now in far cells; tested); the bake budget blind to a map world's ring (its far
  bake, cover, relief tone and coarse light counted: `bakesMB`, tested); the coarse light baked once a window (once a
  map now); the macro bake's demo fallback without `FAR_O`; the paper's colour copied (the staff map's `PAPER`
  shared); the meadow's rings drawn off the tile (skipped on the CPU when their band misses it);
- answered: the near comb bake past the window (open question 1); the paper by season (open question 2).

## Measured

The bench (`tools/bench-look.mjs --gpu metal`, the preview build, under the bench lock; the dev Mac, load 4.9 at the
start, 7.2 at the end; the Kobelnitz window, the frame's p50 averaged over the three yaws, the arm l2):

| Camera | The epic before (53a91bfc) | G3a on the window | G3a 1 km off the tile (`?benchat=-900,-200`) |
|---|---|---|---|
| close | 6.12 ms | 6.01 ms | 2.74 ms |
| default | 6.54 ms | 6.66 ms | 2.88 ms |
| wide | 5.20 ms | 5.34 ms | 2.71 ms |

On the window within the runs' noise (about ±0.15 ms), 100,000 more triangles (the larger ring: 769,288 against
667,336); off the tile cheaper (the ring alone). Textures 261.8 MB against 243.3 MB. The look checks (the guard, the
detail and water checks) fail in the same places as on the epic before (the same 24 guard blocks; #295, #78, #120).
