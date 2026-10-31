---
status: active
last_reviewed: 2026-10-31
---

# Plan: G3d, the map's villages on the 3D page

Track G (`docs/plans/active/track-g.md`), the fourth sub-phase of G3 (`docs/plans/active/g3-austerlitz-in-3d.md`), on
`epic/gameplay-map`. The owner (2026-10-31): the villages now, the water with Track E's A2 (one water for every world,
not started); the woods already follow the tile (a tile's data holds the trees within 1300 m of it, past any view).

## Problem

A map world draws no building in 3D: the look page's buildings are the demo's seven (`BUILDINGS`, Tripo's low-poly
models: a house, a farmhouse, a manor, a windmill), `worldBuildings = onMap ? [] : BUILDINGS`. Austerlitz's expanded map
holds 121 houses and 5 churches in 11 villages (the street-village generator's footprints, 51–111 m², each a 4-corner
ring turned to its road; the churches 11 × 24 m); on the 3D page their ground is the village class alone.

## Approach

1. **The compiler places a model per building** in a tile's data (`src/look/world/window-build.ts`): each standing
   house, barn and church inside the tile (the staff map's rule: `standing()`, `src/render/lit/houses.ts`) becomes a
   model, its centre, its yaw (the footprint's long axis, its front, the model's −z, toward the nearest road's segment)
   and a scale fitting the model's footprint (`FOOT`) to the building's: the house, the farmhouse or the manor by its
   size, a seeded pick among the fits; a church the manor scaled to its length until a church model is imported (the
   owner's Tripo church waits in the git-ignored assets). `LookData.buildings` (five floats a building), moved with
   the tile (`moveLook`), `LOOK_VERSION` 12.
2. **The buildings a part of the tile** (`src/look/main.ts`): `buildBuildings` and their baked light
   (`buildBuildingLight`, an atlas tile a building) built under an owner as the trees and the bakes are, a move's new
   ones beside the last (decision 0096), the light bound to the new bakes; `retile`'s refusal of buildings lifted on
   map worlds.
3. **No yards on map worlds yet:** the yards' paving reads at most 16 buildings (the shader's uniforms, the cover's
   mark) and wants them 4 m apart and off the roads; the street-village houses stand 3 m from their road, and a tile
   holds 17–40 buildings. Their ground stays the village class. Yards on map worlds: a texture of shapes, later.

## Acceptance

- Kobelnitz, the Pratzen and Sokolnitz show their villages: shots for the owner (`scratch/g3d/`), the tile moved there
  by the follower; the buildings in a tile's data are the map's standing buildings inside it (tested: counts, places,
  a front toward its road).
- The demo draws as before (goldens identical); a move with buildings draws as a page loaded there, and ten moves leak
  nothing (G3b-2's checks).
- A move's time with the buildings and their light measured (it adds to G3c's 0.33 s: G5's).

## Risks

- **The light's atlas** grows with the buildings in a tile (one 256² tile each: 40 buildings, 1792²): measured.
- **Fit:** four models for 126 footprints: villages of repeated models; the owner's eye.

## Built

- **The compiler** (`src/look/world/map-buildings.ts`, `mapBuildings`; in a tile's data as `buildings`, moved with
  it, `LOOK_VERSION` 12): each standing house, barn and church (`standing()`) whose centre is on the tile a model:
  a house or a barn the house, the farmhouse or the manor whose shape fits its footprint best (the fits within 12 %
  picked among by its place), a church the manor scaled to its length; the long side the model's x, the front toward
  the nearest road within 60 m; ruins (roofless) left out. Kobelnitz's first tile: 8 buildings, the Pratzen's 9.
- **The page:** the buildings and their baked light parts of the tile (`tileBuildings`, `tileBldLight`, built in the
  move beside the last: the trees, the buildings into their canopy, the bakes, the light bound to the new bakes); the
  owner (`src/look/owned.ts`) also records the engine's context-restored hooks and calls a part's own `release()`
  (the light's effect wrappers); no yards on map worlds.
- **Checked** (Kobelnitz): a move with its buildings draws as a page loaded there (five views, relief off: identical,
  1/255 at most); ten moves leak nothing (100 meshes, 40 materials, 35 GPU textures throughout); a move made to fail
  leaves the page as a fresh one. A move followed (Metal): 280–330 ms (the buildings 1 ms, their light's setup 3–5 ms;
  its bake on the GPU in the next frames). Shots of Pratze, Šlapanice, Újezd and Telnitz, the tile carried there by
  the follower: `scratch/g3d/villages.png`.

## Review

Round 1 (`/code-review high`, 10 findings, 3 severe):
- fixed, severe: a house's model picked by its place on the tile, so a move gave the same house another model (now by
  its place on the map; tested: fails at the pick before); the light's effect renderer left on every move (its
  buffers: now undone with its wrappers); the buildings' detail textures made again on a move (their materials wait on
  the images' loading: the buildings dropped out for frames; now made once a page, outside any part);
- fixed: the window's data rebuilt when the staff map's buildings' rule changes (`src/render/lit` among its sources);
  the buildings' records checked on decoding (`decodeBuildings`, with `BUILDING_FLOATS`; tested); what a build makes
  outside the scene's lists handed to its owner as it is made (`release`), so a build that throws undoes it too
  (tested, with the context-restored hooks); the map's standing buildings found once a map in the worker; a stale
  comment; the shared hash.

Round 2 (`/code-review high`, no severe finding: fixed what was worth it, stopped):
- fixed: a model scaled to its footprint's length could stand wider than it (the churches, 24 × 11 m, drew 14 m
  wide): now the lesser of the length's and the width's scale (tested); an end-on house's front flipped by a road's
  rounding: a road within `END_ON` of the long axis turns it no way (tested; both fail at the code before); the light's
  wrappers and renderer handed to the owner as each is made; a detail texture asked for before `loadBuildingDetails`
  throws (one made inside a part would go with it); `noise.ts` among the window data's sources; the segment's nearest
  point shared (`segNear`, `geom.ts`); a dead refusal (armies never reach a map world's move); doc comments.
- answered: the light's atlas made again on each move and the road scan a building are G5's costs (measured: the
  buildings 1 ms, the light's setup 3–5 ms of a 280–330 ms move).
