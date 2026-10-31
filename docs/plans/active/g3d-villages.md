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
