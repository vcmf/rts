---
status: active
last_reviewed: 2026-10-20
---

# Plan: the first buildings, a windmill and village houses

The owner (2026-10-20): put a windmill in the wheat field and houses in the village of the demo map, to make the scene
more complete and to find what new trouble buildings bring (light, shadows, the ground under them, readability, the
frame's cost). The models are Tripo exports from the owner's concept images (art bible §10): `assets/buildings/
windmill.zip` (from `10-reference-windmill`) and `house.zip` (from `06-reference-stone-house`), each one mesh of about
4,500 faces normalised to a unit box, with one baked colour texture. Out of git, as the other asset packs.

The owner's choices (2026-10-20): the sails static (the X pose; turning sails later, with a runtime shadow: only moving
things get runtime light); the colour by palette roles with the texture's value as fine detail.

## Approach

- **Import** (`tools/building-to-js.py`, Blender headless, as `tools/blend-to-js.py`): the FBX to a JS data file
  (`prototypes/buildings.data.js`, generated, like `prototypes/nature-pack.data.js`): positions in metres (the model
  scaled to a set height: the windmill about 14 m to the cap, the house about 11 m long), normals, UV0, and a
  per-vertex role. The
  role per face by its texture: the median colour under the face's UV triangle, nearest (in Lab) to a short list of
  reference colours per model (wall, roof, timber, opening), the list in the script beside the model. The value
  detail: the texture to greyscale, each role's own mean divided out (so it varies about 1 per role), a small
  mipmapped texture per model (`data/buildings/<model>-detail.png`, generated).
- **Material** (`src/look/buildings.ts`, `shaders/building.vert/.frag`): the painter (`withPainter`, as nature.frag):
  the role's palette colour (new mood-aware role colours: a pale stone wall, an ochre tower, a slate roof, a red tile
  cap, dark timber, dark openings) times the detail value (its contrast set low: 0.25-0.4, the paint's grain on top),
  the ramp, the cast shadow and the sky's occlusion from the bakes, the snow on upward faces in winter, the grade.
  Readable first: the buildings' saturation under the armies' (the guard).
- **Placement** (`src/look/world/buildings.ts`, authored, deterministic): the windmill in the large wheat field (its
  north-east part, `rect(50, 48, ...)`), the houses (6-8, the one model turned and scaled ±10 %) in the village
  ground east of the road, facing the road; none in a formation zone, on the floodplain, on a road or track. Each
  sits on the heightfield at its footprint's lowest corner, sunk 0.2 m.
- **The ground under them**: the cover grid's footprints (and a metre round them) as the village's trodden ground
  (`village`, not `bare`: the scatter keeps its stones off the village, not off bare earth), so nothing grows through
  a floor (the meadow's and the scatter's own rules read the cover; a hidden placement keeps the scatter's stream).
- **Light**: in the shadow bake (it takes the scene's meshes: check the name filter), in the light map's occlusion if
  the trunks' route fits, and in the ground bounce; static, baked once.
- **Performance**: one draw a model (instanced), about 9k faces in all; the bench before and after.

- **The paving** (the owner, 2026-10-20: "makes more sense"): a paved yard under each building, the owner's seamless
  painterly cobbles (`data/paving-v1.png`, 1024²; its prompt: "top-down seamless tileable cobblestones and flagstones
  in packed earth, hand-painted, even flat light, muted grey stone and ochre joints, each stone ~1/30 of the image").
  The house's footprint grown 2.5 m all round and 6 m at its door (a yard toward the road), the windmill's a ring 3 m
  round its base; exact shapes (the footprints' centre, half sizes and turn, or a circle) as uniform arrays (≤ 16),
  its edge ragged into the ground by a noise-wobbled distance (as the roads' edge). Painted in `roadPaint`'s path
  (shore.glsl, `pavePaint`) only where the cover paints the village's ground worn to nothing: the buildings' cover
  grows to the paving's reach, so the road split's live material carries it and the rest of the ground pays nothing.
  Tiled at 4.5 m (stones about 15 cm), mipmapped, read with explicit gradients; its colours kept at 0.8 of their spread
  round the mean; the season, snow and light the ground's. The macro bake paints the cobbles' mean (at 0.5 m texels
  the stones average to it).

## Acceptance

- The windmill and the houses on the map, painted in the look: screenshots at the start view, close, wide, each season,
  shown to the owner.
- Nothing grows through a building; no building in the water, on a road or in a formation zone (a check in the
  placement, failing the page's load as the cover's checks do).
- Their cast shadows on the ground (baked), no shadow acne on the walls.
- The guard as main (the armies still the most saturated); the bench against main: the cost stated.
- `npm test`; the checks as main (#118, #120).

## Open questions

- The light map's sky occlusion near a building (a dark ring at its foot, as under the trees?).
- The windmill at the field's edge or centre: the owner's eye.

## Status (2026-10-20)

- Built: the import (roles: windmill 727 wall, 144 roof, 6,947 timber, 24 openings of 7,842 faces; house 2,408 wall,
  1,691 roof, 2,450 timber, 863 openings, 865 accent of 8,277), the material, the placement (the windmill at (78, 66),
  seven houses in the village facing the road), the footprints in the cover (the look data rebuilt), the shadow bake
  and the light map's occlusion (a blob at each building's foot, as the trees').
- The instance yaw measured on the page: a local point (x, z) goes to (x cos − z sin, x sin + z cos) (a yaw of π/2
  turned the houses' fronts east: fixed to −π/2).
- The paving built (2026-10-20): `pavePaint`, the cover's footprints grown to the yards (`onPaving`).
- To do: the owner's look; the bench against main; the guard and the checks.

