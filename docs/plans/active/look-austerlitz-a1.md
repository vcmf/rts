---
status: active
last_reviewed: 2026-10-29
---

# Plan: A1, the look compiler and a first window of Austerlitz (Kobelnitz)

Stage A1 of the Austerlitz look plan (PR #255, "Stage A": `docs/plans/active/one-map-austerlitz.md` step 5, the look
compiler M4). The owner's decision of 2026-10-29: Kobelnitz first, then Sokolnitz; the Pratzen after A1b.

## Scope

- **In:** the look compiler for a named window of a map file; the look page's `?map=<map>&window=<name>`; the land
  (heights, cover, roads, villages' ground, trees) in PR (a); the yards and buildings in PR (b); the water drawn plain
  in PR (c). The window Kobelnitz: centre (−450, 350) in map metres, the tile ±400 m, play ±235 m, the far ring
  ±1300 m (today's `SPEC`, unchanged).
- **Out:** A1b (the camera's focus on the ground, the ground range per world), A2 (one water for every world), A3 (the
  demo as a map file), A4 (the armies and the checks on windows); the dev server's `?at=<x>,<z>` (with A4's checks, when
  a window is chosen by hand); new art beyond the three models below.

## Approach

**The window** (`src/look/world/windows.ts`): a name, its map file, its centre on even metres (so the cover's 2 m
cells are the map's). The look world's origin is the window's centre, with the map's axes; heights are taken down by
the far ring's lowest node, so the window meets `SPEC.ground.lo` = 0. The window's far ring must lie inside the map's
extent (Kobelnitz's and Sokolnitz's do); a collar past the edge waits for a window that needs it (stage B).

**The compiler** (`tools/build-look-data.ts --window <name>`; render-side maths, decision 0006 does not apply): the
map engine's `layersOf` (`maps/engine.ts`) once, then pure functions in `src/look/world/from-map.ts` turn the layers
inside the window into today's look inputs, and today's encoder writes `data/<map>-<window>.lookdata`. `--check`
compares, as today, and `npm run check:data` checks the demo and every named window. The page never compiles a map.

**The page** chooses its data by `?map` and `?window` (an unknown name throws); without `?map` it draws the demo
exactly as today. The look data's meta says which world it holds; the demo-only parts of the page (the hand-placed
copses, hedgerows, far woods and extras, the formation zones, the buildings' list) run only on the demo, a map world's
trees come from its data.

### What the map language lacked, and how A1 fills it

| Need | Filled by |
|---|---|
| The fields as fields (the arable is one `ground.field` over the whole map) | Temporary, in the compiler: the arable cut into strips 18–45 m wide in blocks of 240 m on the map's grid, each block turned its own way, each strip a crop (wheat, green, stubble, ploughed, a few pasture or fallow meadow) by a hash of the map's position, so two windows agree where they overlap. The language's field generator (#255) replaces it |
| Trees in a wood (`veg.wood` is an area) | The compiler scatters them: a jittered grid at the wood's spacing, kept by its `density`, the species by `leaf` (broad, needle, mixed) and the wood's rim (birch, hawthorn), sized by `height`, by a hash of the map's position |
| Orchards (`veg.orchard`, `rows`) | Apple trees in rows along `rows.dir` at `rows.spacing` |
| The cover class of each kind | meadow: `ground.meadow`, the water's cells, the orchard's floor; pasture: `ground.pasture`, `ground.rough`; wood: `veg.wood.*`; village: `built.village` and the buildings' cells; road: `way.road`, `.highway`, `.paved`, `.brick`, `.sunken`; track: `way.road.lane`, `way.track`, `way.path`; `ground.marsh` as meadow (no marsh paint) |
| A road's paint (`surface`) | Earth for every road (no paved paint yet) |

### The PRs

1. **(a) The compiler and `?map` with land.** Heights (tile, margin, far ring) from `Layers.height`; the cover's
   classes, fields, wear and the village ground from the layers; the roads' segments from the `way.*` lines (their
   widths from `lineReach`), resampled every 8 m as the demo's; the trees as above. No water yet: the water's data,
   bank normals and river are empty on a map world, so the streams' channels and the pond's bed show as dry hollows,
   and no buildings (the village's ground only). The look data's version 9: its meta names its world, and it carries
   the trees (the demo's file is rebuilt, its world unchanged).
2. **(b) Yards and buildings.** The buildings from `built.house` and `built.church` footprints: a model fitted by size
   and shape (house, farmhouse, manor; the church its own), turned to the footprint's long axis, its door to the
   nearest road, seeded by the id. The yards' shapes move from 16 uniforms to a texture (a byte's index, up to 239 a
   world), and a yard is clipped at its road on a map world instead of throwing (Kobelnitz's tile holds 17 buildings,
   a street village's houses stand 3 m from their road). The new models, from the raw packs in `assets/buildings/`
   (git-ignored) as `docs/plans/done/tripo-lowpoly-buildings.md` brought the farmhouse and the manor: the **church**
   (`church-low-poly.zip`), the **windmill** (`windmill-low-poly.zip`, for `built.mill` when the language has it) and
   the **stone bridge** (`bridge-low-poly.zip`, for `built.bridge` once M8 places them).
3. **(c) Water drawn plain.** The water data from the layers (depth from `Layers.depth` and the streams' levels, the
   distance to the shore by a distance transform, the flow along each stream), a flat ribbon per stream and a surface
   per pond at its level, the bank normals and the far mask from the water layer; the river's own features (riffles,
   stones, reeds, cut banks, reflections) off on map worlds until A2.

## Acceptance

- (a) `?map=austerlitz&window=kobelnitz` loads on the production build; the ground, the fields, the roads, the
  village's ground and the trees stand where the lit map view (`app/map.html`) puts them, shown side by side at 20 m,
  the default and the widest zoom.
- (a) Vitest: the compiler's pure parts (the window's grids, the cover's classes, the fields, the trees' scatter, the
  roads' lines, the rebasing) on small hand-made layers.
- The demo page unchanged: `tools/golden.mjs` against `origin/main` without `?map` equal; `npm test`,
  `npm run check:data`, `node tools/check-docs.mjs` and the build pass.
- Measured and written here: the compile's time and memory, the data's size, the bakes' memory and time, one bench
  round on the window (`tools/bench-look.mjs`, Metal, preview build) beside the demo's.
- (b) every footprint of the window has its building; (c) every water of the window drawn, `look-check` passing.

## Risks

- The roads' 16 segments a cell at the village crossings: measured by the compiler (it throws over the limit).
- A wood's trees are the forest's cost (`docs/plans/done/forest-bench.md`): Kobelnitz's far ring holds about 22 ha of
  wood, its tile none; measured by the bench.
- The dry channels and pond bed of (a) are not the look: (c) fills them.

## Results

### PR (a), measured 2026-10-29 (the dev Mac, Node 22)

| What | Value | How |
|---|---|---|
| The map's compile (`layersOf`) | 5.4–5.8 s, 485–570 MiB resident | `node tools/build-look-data.ts`, four runs |
| The window's compile on the layers | about 1.2–1.5 s (the cover at 1 m) | the window's build less the map's compile |
| `data/austerlitz-kobelnitz.lookdata` | 5,278,944 bytes (the demo's 4,269,060: no river, water or bank normals yet; the cover at 1 m) | file size |
| The window's build alone | 7.6 s, 716 MB peak resident | `/usr/bin/time -l` |
| The window's heights | the tile 4.0–22.3 m, the far ring 0–66.7 m (the Pratzen at its north-east), 5.53 m taken off | the data |
| Its trees | 4,723 in the far ring; on the tile only the pheasantry's 487 apples (the nearest wood lies past the frame's reach, as on the lit map view) | the data |
| Its roads | 134 segments on the tile, at most 8 a cell (of 16) | the data |
| The page's build (load to built, bakes included) | 1.18 s (the demo's 1.50 s); the meadow's bake 147 ms (197) | `window.__buildMs`, Metal, preview build, one load each (2 m cover) |
| Texture memory | 277.5 MB (the demo's 262.2): the fine cover for the bakes (27 MB) beside the frame's 2 m one | the bench's `textureMB` |
| GPU frame p50, the bench's nine cameras (the demo's), first round (2 m cover) | close 9.1, 9.3, 9.6 ms (7.3, 7.1, 6.6); default 8.6, 9.6, 9.6 (9.2, 9.1, 9.4); wide 9.9, 10.1, 9.9 (12.6, 13.9, 12.4) | `tools/bench-look.mjs --gpu metal`, one round each, 1-min load under 3 at the start |
| The close cameras (45 m), final data | 9.1, 9.2, 9.6 ms (the demo's 7.2, 7.0, 6.5) | `?benchr=45`, one round each, load 4.7 at the start |
| The same, over the window's pure meadow (`?benchat=-150,100`) | 13.1, 13.0, 12.9 ms | the same |
| The demo over its wheat field (`?benchat=50,48`) | 12.3, 12.4, 12.3 ms | the same |
| Both with `?meadow=off`, at the start | the window 6.1–6.6 ms, the demo 5.6–5.7 | the same |
| The demo page | pixel-identical to `origin/main` at the goldens' eight cameras | `tools/golden.mjs`, two preview builds |

**The close cameras' excess is the ground, not the compiler.** The close frame's cost follows how much of its ground
grows the meadow's grass and crops: round the start (the bench's focus) the demo's hill grows grass on 0.39 of its
ground and crops on 0.04 (the river and the formation zones grow none), the window's 0.40 and 0.24 (its green corn);
over pure meadow the window costs 13 ms, and the demo itself 12.3 ms over its wheat. Without the meadow the gap is
0.5–0.9 ms. A first cut of this fix (the fine warp in every per-frame cover read, the cover's whole pond outline as
meadow) cost 12–13 ms at the start; the warp now runs in the bakes only, the frame reads a 2 m cover, and the water
comes from the layers, back to 9.1–9.6 ms.

Stills (git-ignored, `output/austerlitz-a1/`): the window at 20 m, the default and the widest zoom round (100, 150)
of the window, north up (`kobelnitz-look-*`; before the 1 m cover and its warp: `kobelnitz-before-*`), the lit map
view (`app/map.html`) at the same spots (`kobelnitz-map-*`), and the pheasantry's orchard on both.

### Open questions

- **Kinds or attributes.** The compiler reads some things off a kind's name (`way.road.lane` as a track,
  `veg.wood.*` as a wood, `veg.tree.poplar` as a poplar) where an attribute could say it (a way's surface or use, a
  stand's growth and leaf). Whether the language should carry these as attributes, so a new kind needs no compiler
  change: with the field generator (the code review, 2026-10-29).

- **The fields' edges at the closest zoom.** Fixed for the paint (1 m cover, the fine warp at the bake); the crops'
  dark under-layer (the meadow map, from the cover's cells, unwarped) still shows faint 1 m steps at 20 m along a
  green-corn strip. The field generator in the language could give the look polygons instead of cells.