---
status: research
last_reviewed: 2026-10-12
---

> Decision 0021 (2026-10-12) chose a 2 m cell for every map grid instead of keeping 1.79 m as recommended
> below; the rest of this research stands.

# Map grids for a battalion-scale RTS: grid or no grid, square or hex, what cell size

Research note, 2026-10-12. Tags: **[primary]** source code, official docs or a developer's own talk or text;
**[secondary]** a third party reporting on the primary; **[forum]** community wikis, forums and guides;
**[unverified]** a claim found but not checked against a primary; **[inference]** my reasoning or arithmetic.

## 0. What we have today (grounding)

From `/Users/haquangle/workspace/rts-map-editor` [primary, repo]:

- **Authoring.** `maps/battlefield.ts` is a set of formulas over metres: a stream centre line `streamZ(x)` 6 m wide,
  a road `roadX(z)` 6 m wide, two fords (±10 m), woods as noisy circles, crops and ploughland as rectangles, hedges
  as 2 m strips. `docs/proposals/map-format.md` turns this into a JSON intent file whose features are
  "resolution-independent … Grids, meshes and masks are the compilers' business".
- **Sim heights.** One float64 heightfield at **1.79 m** nodes (decision 0012: one heightfield, built offline),
  read with bilinear interpolation in exact operations (`src/sim/terrain.ts`, `heightAt`).
- **Sim cost grid.** **7.16 m** cells (= 4 × 1.79 m, aligned to the heightfield), a u8 speed factor, harmonic
  mean of 8 × 8 ground samples, times the slope factor of the steepest rise (`tools/build-sim-data.ts`). It is
  read only by an accessor today: no A* exists yet (`sim-design.md` §7 plans A* with per-kind clearance).
- **Sim fine grid.** Terrain class (u8) and water depth (u16 mm) per node: **1 m** on the formation test field,
  **2 m** on the battlefield (1.2 km, a 4.7 MB `.simdata`). At load, `buildTerrain` expands it to Float64Arrays:
  depth, gx, gz (slope from the bilinear heights), and per formation kind an impassable mask plus a two-pass chamfer
  distance to impassable ground (`impd`, the gate's quick reject). Classes are sampled nearest-node (`cellK`).
- **Renderer.** An 800 m tile of 448 cells (1.786 m, matching the sim's 1.79 m), a coarse far ring of 2600 m / 182
  cells (14.3 m), and a 2 m RGBA8 cover grid (class, field id, furrow direction, distance to roads) in
  `src/look/world/cover.ts` (track-e worktree).

So the engine is already *vectors authored, grids compiled, square everywhere, multi-resolution*. The questions
below are whether that is right and what to change.

## 1. Grid or no grid: what shipped games do

| Game | Height | Terrain / passability | Pathfinding | Tag |
|---|---|---|---|---|
| **0 A.D.** (Pyrogenesis) | u16 vertex heights on **4 m** tiles, 92 height units per metre | per-tile terrain; passability per **1 m navcell** computed from water depth, *tile* slope and shore distance per passability class; clearance by dilating impassable cells per class | long-range A*/JPS on the navcell grid (4-connected, uniform cost); short-range vertex pathfinder against obstruction shapes | [primary] `Terrain.h` `TERRAIN_TILE_SIZE = 4`, `HEIGHT_UNITS_PER_METRE = 92`; `Pathfinding.h` `NAVCELL_SIZE = 1`; [Pyrogenesis docs](https://docs.wildfiregames.com/pyrogenesis/namespacePathfinding.html) |
| **Spring / Recoil** (BAR) | float heights at corners of **8-elmo** squares (`SQUARE_SIZE = 8`; 1 elmo ≈ 1/8 m by the engine's own constant `ELMOS_TO_METERS`) | slope map at **half** resolution (16-elmo cells), `1 − normal.y`; per MoveDef `maxSlope`, `minWaterDepth`/`maxWaterDepth`, `slopeMod` and `depthMod` speed curves; footprints in 16-elmo units | grid pathfinders (legacy multi-resolution, QTPFS quadtree); navmeshes rejected because terrain deforms | [primary] [GlobalConstants.h](https://github.com/beyond-all-reason/RecoilEngine/blob/master/rts/Sim/Misc/GlobalConstants.h), [ReadMap.h](https://github.com/beyond-all-reason/RecoilEngine/blob/master/rts/Map/ReadMap.h), [MoveDefHandler.cpp](https://github.com/beyond-all-reason/RecoilEngine/blob/master/rts/Sim/MoveTypes/MoveDefHandler.cpp); [forum](https://springrts.com/phpbb/viewtopic.php?p=547083) on navmeshes |
| **StarCraft II** | painted **cliff levels** (3, raised to 15 in patch 5.0) plus smooth height | 1-bit pathing grid of 1 game unit per cell exposed by the API; painted pathing layer (unpathable, no-build, no-fly) | constrained Delaunay triangulation (CDT) + A* + funnel with unit radius + steering/boids | [primary] [s2client-proto raw.proto](https://github.com/Blizzard/s2client-proto/blob/master/s2clientprotocol/raw.proto), [Blizzard patch notes](https://news.blizzard.com/en-us/article/23320965/multiplayer-map-updates-march-20-2020); CDT [secondary/forum](https://gamedev.net/forums/topic/648438-how-to-do-starcraft-2-pathfinding/) (GDC 2011 talk, not checked) |
| **Warcraft III** | tile corners every **128** units; explicit cliff levels | pathing texture of **32 units** per pixel (4 × 4 per tile); build grid 64 units | grid | [forum] [Hive](https://www.hiveworkshop.com/threads/pathing-map-help.260822) |
| **Age of Empires II (DE)** | tiles | units and buildings are axis-aligned rectangles; "somewhat grid based" | hierarchical (tile) long-range; short-range is *geometric*: expand obstructions by the unit's radius, build hulls, edge-walk; fixed-point rewrite after float precision bugs | [primary] Raymi Klingers, [*25+ Years of Pathfinding Problems with C++*](https://meetingcpp.com/mcpp/slides/2025/25+%20Years%20of%20Pathfinding%20Problems442903.pdf), Meeting C++ 2025 |
| **Age of Mythology / AoE III** | tiles | adaptive quadtree regions 8 × 8 tiles down to 1 × 1 | quadtree long-range, exact shapes locally | [forum] reverse-engineered by a 0 A.D. developer, [Wildfire forum](https://wildfiregames.com/forum/topic/13042-aom-like-pathfindingmovement/) |
| **Age of Empires IV** | — | — | no public data found | — |
| **Supreme Commander 2** | heightmap | **1 m** cost cells (u8, 255 = wall, slope and swamps add cost), in **10 × 10 m sectors**; 50–70% of sectors "clear" and shared; cost per movement type; "wall cushioning" dilates walls for large units | portal graph between sectors, then per-sector **flow fields** | [primary] Elijah Emerson, [*Crowd Pathfinding and Steering Using Flow Field Tiles*](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf), Game AI Pro ch. 23 |
| **Supreme Commander (1)** | e.g. 513² heightmap for a 10 km map (~20 m per sample) | — | — | [secondary] [Courrèges graphics study](https://www.adriancourreges.com/blog/2015/06/23/supreme-commander-graphics-study/) |
| **Company of Heroes 2** | — | IMPASS map, a passable flag per **1 m** point; a "precise map" of distance to nearest impass per crush class | A* (Relic says CoH3 deliberately does not want the shortest path for tanks) | [forum] [coh2.org](https://www.coh2.org/topic/107270/title/post/847376); [primary, not fetched] Relic CoH3 1.6.0 pathfinding blog |
| **Total War** (Warhammer AK) | heightmap edited in layers; resolution not published | "Land No-Gos" generated where slope > **45°**; designers override with Go / No-Go regions; ground-type map gives speed | physics and pathfinding within a **2048 m** usable square; rendering to 8 km | [primary] [TW wiki: Terry intro](https://wiki.totalwar.com/w/TWW_Assembly_Kit_Terry_Intro), [heightmap](https://wiki.totalwar.com/w/TWWAKT_Editing_the_Heightmap); [forum] [tw-modding](https://tw-modding.com/wiki/Battle_Maps:Land_Battle_Maps) |
| **Men of War II** (GEM) | landscape mesh | a "Terrains" grid painted over the mesh, each type with physical properties (speed, swim, sink); water depth computed from a water altitude | — | [primary] [Bestway docs](https://docs.bestway.com.ua/editor/map-editor/3-landscape-editor/terrains-editor) |
| **Ultimate General, Wargame / Steel Division** | — | — | no public technical data found | [unverified] |
| **Civilization V+** | hex | hex tiles | hex graph | [secondary] Jon Shafer: corners made reach ambiguous, diagonal moves were an exploit, hexes look less blocky ([Gamereactor](https://embed.gamereactor.eu/jon-shafer-on-civilization-v/)) |
| **Battle for Wesnoth** | — | hex; terrain code = base + overlay; aliases take worst movement, best defence (bridges: best of both) | hex graph | [primary] [Wesnoth wiki](https://wiki.wesnoth.org/Terrain_Terms) |
| **Board wargames** | contour per hex side | hex | — | La Bataille **100 m/hex**, 20 min turns, battalion/regiment counters; Napoleon's Last Battles **480 m/hex**, 1 h turns [secondary] ([analog.games](https://www.analog.games//gameItem/show/419cd83f9654fe4b01965605159e01a3), [SPI NLB](https://www.spigames.net/Quad_Images/NLB.pdf)) |

**Patterns** [inference from the table]:

1. **Every real-time engine uses square rasters for height and ground.** Hexes appear only where *pieces* are
   tile-bound (Civ, Wesnoth, board games). No continuous-movement RTS found uses hex for its sim grids.
2. **Passability is finer than height.** 0 A.D. 4 m tiles → 1 m navcells; WC3 128 → 32; CoH 1 m impass;
   SupCom2 1 m cost. The reason is always the same: the smallest *unit* or the narrowest *gap* sets passability
   resolution, while the ground shape is smooth.
3. **Slope is read coarser than heights.** Spring's slope map is half-resolution; 0 A.D. reads the *tile* slope
   because "exact slopes give kind of weird output, so just use rough tile-based slopes" ([primary]
   `CCmpPathfinder.cpp`).
4. **Big units get clearance, not a coarser grid.** 0 A.D. dilates impassable cells per class
   (`ExpandImpassableCells`), CoH stores distance-to-impass, SupCom2 runs "wall cushioning" per movement type.
5. **Designers can override derived passability.** Total War Go/No-Go regions, SC2's pathing layer, SupCom2 cost
   editing in the editor.
6. **Navmeshes** win for static, mostly-blocked worlds (SC2) and lose where terrain changes or costs are graded:
   Spring rejected them because rebuilds are slow; graded costs (marsh 0.75×, ploughland 0.88×) do not fit a
   binary walkable mesh without area labels [forum + inference].
7. **Geometry evaluated at query time is a determinism hazard.** AoE II/AoM/AoE III's hull pathfinder broke on
   nearly collinear points under float precision, changed behaviour when SIMD and x87 80-bit precision changed, and
   was finally rewritten to use only `> < == + −` in fixed point (Klingers [primary]). Rasterizing vectors *offline*
   and shipping integers avoids this class of bug entirely; this is what decision 0012 already does for heights.

### Vector vs raster vs navmesh, for us

- **Vector at query time** (point-in-polygon for woods, distance to a river spline): exact, tiny, but O(features)
  per query, and every query is a float-geometry decision that must agree across browsers. Our sim samples terrain
  per *man* (≈ 400 places per battalion each step for the footprint gate), so queries are hot [inference].
- **Raster compiled offline**: O(1) per query, byte-identical everywhere, memory linear in area. Edges are
  quantized to the cell, which matters only for features narrower than ~2 cells.
- **Navmesh**: excellent for point-agents in corridors; poor fit for graded costs, per-kind wading depths,
  clearance of a 150 m line, and a sim that reasons about *fraction of frontage on bad ground*
  (`terrain-movement-speed-models.md`). Not recommended [inference].

The sound pattern is **vectors as the source of truth, rasters as the runtime, with a few thin linear features
also kept as vectors where the raster cannot hold them** (§4).

## 2. Square vs hex for the simulation's grids

**Arguments for hex** [primary/secondary]:
- Isotropic sampling: a hexagonal lattice needs **13.4% fewer samples** than a square one to recover a circularly
  band-limited signal (Petersen–Middleton; [Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_sampling)).
- Six equidistant neighbours: no diagonal ambiguity, so 6-connected paths have no √2 bias and Civ's "corner"
  problems vanish.

**Arguments for square**:
- **Our units are not on the grid.** A battalion is a continuous rectangle of 400 figures; grids are only sampled.
  The hex advantages (uniform adjacency, no corner ambiguity) are properties of *movement between cells*, which our
  formation layer never does. They would matter only for the A* graph [inference].
- **Grid-path anisotropy is cheap to remove on squares.** 8-connected grid paths are at most ≈ 8% longer than true
  shortest paths, and any-angle searches (Theta*, Lazy Theta*) or string-pulling post-passes recover nearly true
  paths ([Nash, Koenig, Tovey 2010](https://ojs.aaai.org/index.php/SOCS/article/view/18152);
  [Daniel et al., JAIR 2010](https://www.jair.org/index.php/jair/article/view/10676)) [primary]. Hex 6-connected
  paths have their own zig-zag bias and need the same smoothing [inference].
- **Interpolation.** Bilinear on squares is 4 lookups and is what our exact-operation `heightAt` already does.
  Hex interpolation is barycentric on a triangle after a non-trivial point-to-hex step that needs rounding
  ([Red Blob](https://www.redblobgames.com/grids/hexagons/): "we need to round to the nearest hex") [primary].
  Rounding at cell borders is exactly where cross-browser disagreement would bite [inference].
- **GPU.** Textures, mip-maps, bilinear samplers and `texelFetch` are square. The renderer already uploads the cover
  grid and heightfield as square textures; a hex sim grid would need a resampling step and two sets of numbers that
  can disagree at feature edges (decision 0012 exists to prevent that) [inference].
- **Heightfields are always square-indexed** in the engines above (0 A.D., Spring, Unity's 2ⁿ+1
  [primary, [Unity docs](https://docs.unity3d.com/Manual/terrain-OtherSettings.html)], SupCom). The *mesh* is
  triangles, i.e. a square grid split along a diagonal; a "hex heightfield" is just a triangular lattice, which
  renders the same way but loses the square texture addressing [inference].
- **Storage.** Hex maps fit in arrays with sentinel cells, wasting up to 2× for some shapes (Red Blob [primary]);
  conversions between hex sim data and square render data cost a resample each and a source of drift.
- **Distance transforms** (clearance) are standard and exact enough on squares (two-pass chamfer, already in
  `terrain.ts`; or exact Euclidean in two passes) [inference].

**Verdict**: square for every layer. The isotropy gain (≈ 13%) is smaller than the cost of conversions and
non-GPU addressing, and its main benefit (fair movement between cells) does not apply to continuous formations.
Hex has one legitimate home: a *presentation* overlay (e.g. a hex-ruled staff map for a wargame feel), drawn from
the square data, never sampled by the sim.

## 3. Cell size

### What sets each resolution [inference, arithmetic]

- **Heights** must carry the relief that matters to *fire and morale* (crest lines, reverse slopes, sunken lanes'
  banks) and to *speed* (grades). Lowland relief has wavelengths of tens to hundreds of metres; a crest is
  resolved to ~2 m by a 1.79 m grid. Figures 0.65 m apart standing on a bilinear surface do not need finer
  sim heights; the renderer can add sub-cell detail it never reports to the sim.
- **Slope for speed** should be read over a few metres (one man's stride is ~0.75 m, but a battalion's pace
  responds to grades over its depth, ~10–30 m). 0 A.D. and Spring both read slope coarser than height. Today we
  derive slope per fine node from the bilinear heights, which is fine as long as we do not refine heights.
- **Terrain classes** must hold the narrowest feature that changes a man's footing: a 2 m hedge, a 3–6 m road, a
  6 m stream, a 10 m bridge or ford. With 0.65 m figure spacing a 2 m cell is 3 men; a 1 m cell resolves a 2 m hedge
  as 2–3 cells instead of 1–2. Linear features 1–2 m wide (walls, hedges, ditches) are the only thing 2 m cells
  hold badly, and they are better as vectors (§4).
- **Water depth** follows the class grid (fords 20 m wide, streams 6 m).
- **Movement cost for planning**: the decision "can this 120 m line go through that gap" is made with clearance, not
  cell size. A* nodes need only be fine enough that the narrowest *useful* passage (a 6–10 m bridge, a 20 m ford)
  spans ≥ 1 cell after clearance. 7.16 m does this for bridges ≥ ~7 m; a narrower bridge is "marked explicitly"
  (sim-design §7), which is the right call.
- **Clearance** for a line of 100–150 m is 50–75 m half-width; columns ~10–20 m. Distances are stored per kind/width
  class on the class grid or the cost grid.

### Memory over a 1.5 km square (one ruleset, one season) [arithmetic]

| Layer | Cell | Nodes | Stored as | Size |
|---|---|---|---|---|
| Heights | 1.79 m | 839² = 0.70 M | float64 today / **u16 at 1 cm** | 5.6 MB / **1.4 MB** |
| Classes | 1 m | 1501² = 2.25 M | u8 | 2.25 MB |
| Classes | **2 m** | 751² = 0.56 M | u8 | **0.56 MB** |
| Water depth | 2 m | 0.56 M | u16 mm (or u8 cm to 2.55 m) | 1.1 MB (0.56) |
| Cost, per kind | 7.16 m | 210² = 44 k | u8 | 44 KB × kinds |
| Clearance, per kind | 2 m | 0.56 M | u8 in 0.5 m steps (to 127 m) | 0.56 MB × kinds |

The shipped file is small at any of these choices. **The runtime expansion is not**: `buildTerrain` turns the fine
grid into Float64Arrays (depth, gx, gz, and `impd` per kind). At 1 m over 1.5 km each such array is
2.25 M × 8 B = **18 MB**, so depth + gx + gz + 3 kinds of `impd` ≈ **108 MB** [arithmetic from
`src/sim/terrain.ts`]; at 2 m it is ≈ 27 MB. That, not the file, is the browser-memory risk. Keeping these as the
quantized integers they were shipped as (u16 depth, i16 gradients or on-demand slope from heights, u8/u16
distances), and doing float64 arithmetic only on the sampled values, cuts it by 4–8× and keeps determinism trivially
(integers are exact) [inference].

### Multi-resolution, sparse and hierarchical

- **Shipped practice is already multi-resolution**: 0 A.D. (4 m tiles, 1 m navcells), Spring (8-elmo heights,
  16-elmo slope, multi-resolution pathing), SupCom2 (1 m cells, 10 m sectors, shared "clear" sectors) [primary].
- **Sparse storage** pays off when most of the map is uniform: SupCom2 found 50–70% of sectors clear and shared one
  static field [primary]. Our maps are mostly meadow and crops; a tiled class grid (e.g. 32 × 32-cell tiles, uniform
  tiles stored as one byte) would shrink a 1 m class grid to a fraction, but at 2 m the dense grid is only 0.56 MB, so
  sparsity is not worth its complexity yet [inference].
- **Quadtrees** (QTPFS, AoM) help pathfinding on huge maps; on a 210² cost grid plain A* (≤ 44 k nodes) with a
  binary heap is cheap, and SupCom2-style portals would be over-engineering [inference]. Measure before adding.
- **Hierarchical by consumer** is the useful split: heights fine, classes medium, cost coarse, each derived from
  the vector source by its own compiler step, with aligned origins so one cell maps to a whole number of finer
  cells (already enforced between the look tile and far ring by `src/look/spec.ts`).

## 4. Blocking and passability

Three mechanisms, all found in shipped games:

1. **Derived from slope.** Spring: per-MoveDef `maxSlope` on the slope map plus a continuous `slopeMod` speed curve
   [primary]. 0 A.D.: each passability class tests `IsPassable(depth, slope, shoredist)` with the *tile* slope [primary,
`CCmpPathfinder.cpp`]. Total War: auto No-Go above 45°
   [primary]. SupCom2: slope converted to cost in the editor [primary].
2. **Explicit flags / painted layers.** SC2 pathing layer, WC3 pathing texture, CoH IMPASS, Total War Go/No-Go,
   Men of War `no_pass` [primary/forum]. Used for things the heightfield cannot express and for designer intent.
3. **Per-unit-kind clearance.** 0 A.D. (dilate per passability class), CoH (distance per crush class), SupCom2
   (wall cushioning per movement type), Spring (footprint + MoveDef) [primary/forum].

**Cliffs.** RTS games with painted cliff levels (SC2, WC3) make cliffs *explicit* because the heightfield's
interpolation would otherwise produce a walkable ramp between levels [inference]. Engines with continuous terrain
(Spring, 0 A.D., Total War) derive cliffs from slope. For Napoleonic ground there are few true cliffs, but several
**sub-cell barriers** that matter enormously: sunken roads (Ohain road at Waterloo), stone walls, ha-has, ditches,
steep stream banks. A 1.79 m heightfield cannot represent a 2–3 m drop over 1 m without smearing it into a 50–100%
grade over 2–4 m, which a slope threshold would then over-block or under-block depending on the cell alignment
[inference].

**For us** [inference]:
- Passability for open ground stays **derived**: class `g = 0` per kind, depth > per-kind wading limit (0.9 m
  infantry, 1.2 m cavalry, 0.7 m guns per `terrain-movement-speed-models.md`), and the slope curve falling to 0. Read
  slope over a *larger* baseline than one fine cell for the impassability test (0 A.D.'s lesson), so noise in the
  bilinear surface does not create speckled walls.
- **Barriers are explicit vector features** in the map file (`wall`, `bank`, `sunkenRoad`, `cliff`), each with a
  height and per-kind crossing rule from the ruleset (cross at a cost, cross only in column, impassable to guns).
  The compiler rasterizes them *conservatively* into the class grid (any touched cell) for the gate and the cost
  grid, and the sim may also keep them as a segment list for exact "does this file cross the wall" tests at
  order time. Explicit features are also what the renderer needs to draw them.
- **Clearance per formation kind** (line, column, square, skirmish screen, battery) as distance fields: already the
  plan in sim-design §7 and partly built (`impd`). Quantize to u8/u16 to save memory.
- **Designer override**: a `noGo` / `go` polygon kind in the map format, as in Total War, for the inevitable case
  where derived passability is wrong.

## 5. Water: plane, per-cell surface or depth

- **Global water plane.** Spring/Recoil: water is at y = 0, anything below is under water (`IsUnderWater` tests
  `height < 0`) [primary, `ReadMap.h`]. 0 A.D.: `CCmpWaterManager::GetWaterLevel(x, z)` ignores x and z and returns
  one `m_WaterHeight` [primary]. Men of War II: depth computed from a water altitude parameter [primary]. These work
  for seas and lakes; a river that falls 2–5 m along a 1.5 km valley cannot be one plane. Spring maps fake rivers by
  carving channels below 0, which forces the whole map to sit above sea level and every river to be at the same
  level [inference].
- **Depth as negative height** has the same limit and conflates "the bed is low" with "there is water here"; a dry
  ditch and a flooded one look identical [inference].
- **Per-cell water surface or depth layer.** What our sim already does (u16 mm depth per fine node), and what
  SupCom2-style cost fields bake in (swamps as cost). Fords become a property of the bed: depth under the wading
  limit for a kind. Seasons change the depth layer (and ice turns it passable), matching the map format's per-season
  outputs [inference].
- **Rivers as vectors vs painted cells.** Vectors (centre line, width, bed profile, surface gradient, per-segment
  overrides) are the authoring truth for both the renderer (the ribbon, banks and foam need a flow direction and
  distance-to-bank, which painted cells do not carry) and the sim compiler (which rasterizes depth). Painted cells
  lose flow direction and make width edits destructive. Fords and bridges must be explicit features that reference
  the water they cross (the map-format proposal already requires this): a ford raises the bed over a stretch; a
  bridge is a level deck class with a width that becomes a flow limit (1.2–1.3 men/m/s) rather than a speed factor.

## Recommendation for our engine

All grids **square**, aligned origins, integer ratios between layers, compiled offline in Node from the vector
map file, shipped as **quantized integers**. The sim does float64 arithmetic only on values it samples.

| Layer | Representation | Cell | Why |
|---|---|---|---|
| **Authoring** | **Vector** JSON features in metres (relief ops, polygons, polylines, points) | none | Resolution-independent; reviewable diffs; every compiler and both consumers derive from it; changing a cell size never touches a map. |
| **Heights** | Square vertex grid, one for sim and renderer (decision 0012) | **1.79 m** (keep; = 800/448) over the play area plus margin; far ring 14.3 m for the backdrop only | Resolves crests and reverse slopes to ~2 m; finer adds nothing to formations whose men sit on a bilinear surface. Ship as **u16 at 1 cm** (0–655 m) or i16 around a base: 1.4 MB over 1.5 km, exact across browsers. Renderer may add sub-cell detail it never feeds back. |
| **Slope (speed and impassability)** | Derived at load from heights | per height cell for speed; over ≥ 2 cells (≈ 3.6–7 m) for the impassability threshold | Avoids speckled walls from bilinear noise (0 A.D. reads tile slope; Spring halves resolution). Do not store float64 gx/gz per fine node. |
| **Terrain classes** | Square cell grid, u8 class id | **2 m** (as on the battlefield; drop 1 m except on test fields) | Holds roads, streams, fords, wood edges; 3 men per cell is fine for the footprint gate and the "fraction of frontage on bad ground" model; 0.56 MB over 1.5 km. Sample nearest-cell (as now) for the gate. |
| **Thin barriers** (walls, hedges, banks, sunken roads, cliffs) | **Vector segments** kept in the sim + conservative raster into the class grid | n/a (exact) | Below the class and height resolution; need per-kind crossing rules and exact crossing tests at order time; renderer draws them from the same segments. Precompute in fixed/integer coordinates to stay deterministic (AoE lesson). |
| **Water** | Vector rivers/ponds/fords/bridges → **per-cell depth layer** (u16 mm or u8 cm) at the class grid, per season | **2 m** | A river is not a plane; depth gives wading limits per kind and seasonal ice; fords are bed edits, bridges a level deck class with a width. |
| **Movement cost** | Square cell grid, u8 speed factor per formation kind (per ruleset, season) | **7.16 m** (= 4 × 1.79 m; keep) | Planning resolution only; 210² cells over 1.5 km; harmonic-mean aggregation already right. Narrow bridges/fords marked explicitly. |
| **Clearance** | Distance-to-impassable field per kind (or per width class), u8/u16 | **2 m** for the gate (have it: `impd`), **7.16 m** for planning | Lets a 120 m line refuse a 10 m bridge and a column take it (0 A.D., CoH, SupCom2 all do this). Quantize: today's Float64 `impd` is 18 MB per kind at 1 m over 1.5 km. |
| **Pathfinding** | 8-connected **A\*** on the 7.16 m cost grid with clearance per kind, then **any-angle smoothing** (Lazy Theta* or string-pulling) | 7.16 m | ≤ 44 k nodes, trivial per order; removes the ≈ 8% grid bias without hex. No navmesh (graded costs, per-kind depths). No hierarchy until measured. One **flow field per side** toward its retreat edge is worth adding for routers (shared goal, many movers). |
| **Rendering masks** | Square textures | cover **2 m** RGBA8 (as now); detail tile 1.79 m; far ring 14.3 m | GPU-native; derived from the same vectors as the sim grids so drawn and simulated edges agree. |
| **Presentation** | Optional hex overlay on the staff map | — | Only place hex has value (board-wargame feel); drawn from square data, never sampled by the sim. |

**What stays vector at runtime**: thin barriers (walls, hedges, banks, sunken roads), bridge and ford extents (with
widths for flow limits), river centre lines for the renderer (flow, banks, foam), and designer go/no-go polygons
for the compiler. Everything else the sim reads is a quantized square raster.

**First actions suggested** [inference]: (1) quantize the runtime terrain arrays (largest memory win, no behaviour
change if tests compare quantized results); (2) settle 2 m as the default class/depth cell; (3) add a `barrier`
feature kind to the map format; (4) build A* + smoothing on the existing 7.16 m cost grid with per-kind clearance;
(5) measure before adding any hierarchy, sparsity or flow fields beyond the routers' one.
