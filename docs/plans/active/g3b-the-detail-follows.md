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
| **G3b-2** | **The tile rebuilt.** The nature (the trees, the canopy, the trunks, the casters, the growth the meadow reads: one 870-line closure today) disposed and rebuilt for a tile; the tile's textures written in place; the bakes rerun; the shadow map's casters from the new nature. A test hook moves the tile (`__look.retile(x, z)`, from `--tileat` data). | A page whose tile moved draws as a page loaded with its tile there (the same views, the same frame); no leak over ten moves (the scene's meshes, materials, textures, cameras, render targets, observers and the GPU's textures counted) |
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

## Review

G3b-1, round 1 (`/code-review high`, 10 findings, none severe; fixed or answered, then stopped):
- fixed: the tile step checked against every grid over the tile (the roads', the covers', the meadow's, the bakes'
  texels), not only the far and tile cells (100 m passed with half road cells; tested); the compiler's tile check by
  the spec's step, not a literal; the checks' move of a tile without copying its trees and roads (`moveGrids`);
  `groundOf` given the tile's centre, not one worked out from the heightfield; the armies' field and the bench's
  focus about the tile's centre (a map window has no armies yet: for G3b-2); the tile's GLSL in one chunk
  (`shaders/tile.glsl`, `#include<tile>`), not five copies; `?tileat`'s messages, and the missing file's naming the
  command that builds it; a `--tileat` file written whole then moved; a dead fallback; the tile module's comment;
- answered: a `--tileat` file is a check's, built only when asked (not rebuilt by `--missing`: G3b-3 builds tiles on
  the page); `windowBase` samples the window's heights a second time, only for a `--tileat` build.

## G3b-2: measured

- **A moved tile against one loaded there** (Kobelnitz, its tile moved to (400, 0) by `__look.retile`, against a page
  loaded with `?tileat=400,0`, four views, SwiftShader): with the relief's tone off, the frames identical (largest
  difference 1/255, mean 0); with it on, within 13/255 (mean 0.5–1.1). The relief reads the far ring's heights, which
  the two files hold to within 0.00006 m (each window's far ring is sampled at float32 places in its own frame), and
  the far macro bake's hash follows it; with the relief off the far bake's hash is the same.
- **No leak:** ten moves (to (400, 0) and back, five times), the scene's meshes (90), materials (33), textures (26),
  cameras (3), render targets (3), per-frame observers (13), the painted materials (28) and the GPU's textures (28)
  as before; the home view after them as on a fresh page (the frame readout and a few isolated pixels apart).
- **A move's time:** 594–766 ms on the dev Mac's GPU (Metal, four moves), 6–9 s on SwiftShader: one long frame, until
  G3c spreads the bakes.

G3b-2, round 1 (`/code-review high`, 8 findings, 1 taken as severe):
- fixed, severe: a refused tile could leave the page half moved (the covers' size checked after the ground had moved):
  every check now before the first change (the data, the world, the covers' and far ring's sizes, no water or banks);
- fixed: the page's hooks for the tools (`window`'s trees, shadow map and light camera, `__look`'s meadow and flow)
  read the tile's parts now, not the first tile's; the macro colour's checks bound on materials made later (a moved
  tile's trees); a page with buildings or armies refuses a move (their light and shade hang on the bakes: not on a map
  world yet);
- answered: the relief's tone over the whole ring and the trees' generated models built again on each move: a move's
  cost, G3c's (it spreads and trims the move).

G3b-2, round 2 (10 findings, 3 severe):
- fixed, severe: the page's `window` hooks set by `Object.assign` (it copies a getter's value: they stayed the first
  tile's; now property descriptors); the new tile checked against the far ring drawn (the page's: its edges on its
  grid, a far cell inside it), not its own; a move that fails midway (a build that throws) now puts back the tile it
  came from, and an owner's build that throws takes away what it had added (tested: fails at the owner before);
- fixed: the camera's checks (`checkView`) on the new tile's ground before the move, and `GROUND` the tile's now; the
  scatter pass the scene's now (the bench's A/Bs); an owner keeps no snapshot of the parts that stood at its build;
  the far ring's heights kept on a move (its hole and normals alone); the meadow's bake time the map's now;
- answered: one holder of the tile's parts with a registry of who reads them (the reviewer's suggestion, against
  stale captures): the parts are few and every reader goes through a getter or the live variable now; a registry if
  G3c adds parts; the flow's comb built again on a move: G3c's cost.

G3b-2, round 3 (10 findings, 2 taken as severe): the rollback put the last tile back with the new tile's ground range;
a build that failed midway left the rollback disposing the last parts a second time; and smaller ones of the same
root (a first tile with water, overlapping moves). A third round with severe findings: **redesigned** (AGENTS.md).
Every round had found an edge of one flaw: the move disposed each last part, then built its successor, so a failure
needed a rollback that rebuilt the last tile, and the rollback was where the bugs lived. Now the move **builds beside,
then swaps**: every check first; then, in one task (no frame between), the tile's place set to the new tile's, every
new part built while the last ones stand; a build that throws takes its new parts away, puts the place back and lets
each last part bind again what the new had overwritten (`Owned.rebind`, its own bindings alone), the last tile
untouched; else the last parts go. One move at a time (a queue); neither tile may have water (G3d); `?far=off` in the
trees' builder. Checked on the page: a move made to fail (`__look.moveFault`) leaves the page as a fresh one (the
frame identical, every count the same); a move draws as a page loaded there (relief off: identical); ten moves leak
nothing. The round count restarts.

After the redesign, round 1 (8 findings, 2 taken as severe):
- fixed, severe: the new bakes took their shadow casters from the scene while the last tile's trees still stood in it
  (they cast in the new shadow map until disposed, and stayed in its list): a part going away now casts nothing
  (`buildBakes`' `leaving`, from the last parts' owners: `Owned.has`; after a move no caster is disposed); the swap
  could still throw after the last parts were gone (the ground's split, the relief's tone): both now in the build's
  guarded half, the swap left with assignments, disposals and hooks;
- fixed: the tools' `retile` hook checks the place asked for and that the file holds it; the focus range's comment;
- answered: owners that find their parts by the scene's lists (the reviewer's explicit disposables: a larger change
  to every builder; the lists cover what the tile's builders make, the bakes' casters now leave the last parts out);
  the relief's tone over the whole ring, the far macro bake on every move, the first tile's data kept: a move's cost
  and memory, G3c's.

After the redesign, round 2 (9 findings, none severe; fixed or answered, then stopped):
- fixed: a move waits for a colour bake under way (it would bake the new covers on the last tile's place); the move's
  fault fires once; the first tile's flow and meadow map named as the load's (`flowAtLoad`, `meadowMapAtLoad`); the
  hooks' comments; the design's decision record (0096, proposed);
- answered: the bakes' casters by the scene's list with the leaving parts left out, and owners that record four
  observables (explicit caster lists and disposables: a change to every builder; decision 0096's consequences); the
  apron's buffers and the flow's comb made again on a move: G3c's cost.

## G3b-3: built

- **The worker** (`src/look/tile-worker.ts`): a map world's page sends it the window's map, its catalogue and its
  heightfield's bytes once (the built page's assets); it compiles the map (validate, the files, expand, apply: the CLI's
  `layersOf` steps) and bakes the coarse light, then builds each tile asked for with the compiler's own window build
  (`src/look/world/window-build.ts`, moved out of `tools/build-look-data.ts` so the browser runs it; the compiler's
  bytes unchanged).
- **The rule** (`tileWanted`, `src/look/tile.ts`): when the focus comes within 200 m of the tile's edge, the centre on
  the 200 m grid nearest it, kept so the whole tile lies inside the map (the compiler builds none past it: within about
  130 m of Austerlitz's east and north edges the far ring shows under the focus), is asked for; it takes the tile's
  place (`retile`) when it comes; one request at a time. Not on a frozen page (the look tools keep their tile) nor under
  `?follow=0`.
- **Measured** (the dev Mac, Kobelnitz, the focus sent 1 km east): the map compiled in the worker in 3.3 s on load;
  the tile built in 1.6–1.7 s, off the page's thread; its swap 0.93 s on Metal (12 s under SwiftShader). Shots in
  `scratch/g3b3/` (the far ring, then the tile come).
