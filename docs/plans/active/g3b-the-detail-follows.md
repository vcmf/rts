---
status: active
last_reviewed: 2026-10-31
---

# Plan: G3b, the detail follows the camera

Track G (`docs/plans/active/track-g.md`), the second sub-phase of G3 (`docs/plans/active/g3-austerlitz-in-3d.md`), on
`epic/gameplay-map`, after G3a (`docs/plans/done/g3a-the-whole-map-far.md`, #291). The owner (2026-10-31): G3b–e
first, then G4.

## Problem

Since G3a the camera's focus goes anywhere over the map, but the detail (the 1.79 m ground, the 0.52 m light, the
grass, the live roads, the tree shadows) is one fixed 800 m tile at the window's centre; elsewhere the far ring's 4 m
bake shows, soft and streaked up close.

## Design: one tile that moves (not a block of tiles)

The G3 outline proposed 400 m tiles, 3 × 3 in detail. An inventory of the page (2026-10-31) costs it against one
800 m tile that moves with the camera:

- **A block of tiles:** every tile-bound material binds one texture a sampler for all materials (`mats.bindAll`): nine
  tiles are nine copies of every tile material (three each for the ground's split), or texture arrays in every
  shader; the shadow, light and bounce bakes each assume one ground mesh; the far ring's hole and the apron become a
  moving 3 × 3 outline.
- **One tile that moves:** every material keeps one texture a sampler; the shaders read the tile's place from one
  uniform (about 25 reads in 10 files take `xz − uTileO`); most textures keep their size and are written in place;
  the bakes already rebake on demand (the shadow and light maps' refresh counters, the macro bake's `draw(x0, z0)`).

**One tile that moves.** The tile (800 m, as today) is re-centred when the focus comes within 200 m of its edge, on a
200 m grid (the tile holds the play margin today's checks prove: `nearFrameOf`), with hysteresis so a pan along the
edge does not flip it. The camera's widest view reaches about 400 m from the focus (`checkView`), so the far ring
shows only toward the top of the frame, as on today's window.

## The data: compiled on the page, in a worker

A moved tile's data (its heightfield, fine cover, roads, trees) is the look compiler's window build at the new centre.
Not prebuilt: 64 centres over Austerlitz would be about 130 MB and two minutes a build (estimates). The map is
compiled once in a worker (the map page's worker already compiles a map with its DEM in the browser:
`src/app/map/worker.ts`), and each new tile's data is built there from the layers (`src/look/world/from-map.ts`, pure
TypeScript), off the page's thread, sent as transferable arrays. The page keeps **one frame: the first window's** (its centre the origin, its lowest node the height base, as today),
and a tile's data is built in it, at an offset: the tile's centre on a **200 m grid** about the origin. 200 m is 14 far
cells (14.29 m), 112 tile cells (1.79 m), 25 road cells, 384 light-map texels and a whole number of every other grid's
cells, so a moved tile's grids meet the far ring's and the apron joins them as today. The look tools keep their views
(they look about the origin, the first tile).

## Sub-phases (each a PR)

| | What | Acceptance |
|---|---|---|
| **G3b-1** | **The tile off the origin.** The tile's centre in the data (`tileAt`, on the 200 m grid; the compiler's `--tileat`), `uTileO` in every shader that reads the tile (about 25 reads), and the CPU's tile-bound code taking the centre (the heightfield, the ground mesh, the apron, the far ring's hole, the bakes' cameras, the meadow map, the flow, the roads' grid, the water data, the units' ground, the trees' tile and far split). The tile is still fixed for a page's life. | At the origin the windows draw as on #291 (golden shots, identical); Kobelnitz's data with its tile 400 m east (`--tileat 400,0`) draws as Kobelnitz's own where the two tiles overlap (the same frame: the painted grain lies in world metres, so two frames cannot match pixel for pixel), within the golden's limits |
| **G3b-2** | **The tile rebuilt.** The nature (the trees, the canopy, the trunks, the casters, the growth the meadow reads: one 870-line closure today) disposed and rebuilt for a tile; the tile's textures written in place; the bakes rerun; the shadow map's casters from the new nature. A test hook moves the tile (`__look.moveTile(x, z)`). | A tile moved to three places (Kobelnitz, the Pratzen, Sokolnitz) looks as a window built there; no leak over ten moves (the GPU's memory, the meshes counted) |
| **G3b-3** | **The tile follows the camera.** The map compiled in a worker on load; a new tile's data built there when the focus nears the edge, swapped in when ready (the old tile drawn until then); the re-centring's rule and its hysteresis. | Pan across Austerlitz: the detail under the focus everywhere; the swap's frame measured (G3c spreads the bakes) |

## Out of scope

The bakes spread over frames (G3c); the water, villages and woods past the windows' data (G3d); the frame while
panning (G3e).

## Risks

- **The nature closure** (`src/look/nature.ts`, 870 lines) has no rebuild path: G3b-2's largest piece.
- **Track E's work in flight on `src/look/`** (the smoke epic, cavalry-artillery): G3b-1 touches every shader that
  reads the tile; whichever merges second rebases.
- **The swap's hitch:** the bakes today run once at load (the light map 14 ms, the bounce 7 ms, the meadow map about
  150 ms of CPU): until G3c a move costs a visible frame.
- **Float precision:** a tile 1.5 km from the origin: float32 world positions hold millimetres there; to check on the
  goldens.
