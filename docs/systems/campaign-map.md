---
status: current
last_reviewed: 2026-10-30
---

# The campaign map's bake and tiles

What is built of the campaign map in the game's code (Track K, `docs/plans/active/track-k.md`; the look is decision
0093 and `docs/proposals/campaign-map.md`): the bake that makes the map's one shape and its light, and the tiles it
is stored in. The page that draws them is K2b; until then the K1 prototype (`prototypes/campaign-map.html`) draws
the map, from its own tiles written by the same bake.

## The bake

`src/render/campaign/bake.ts`, pure functions on a grid (nodes `cell` metres apart, the south row first), no DOM and
no Node. Renderer data, not the campaign's rules: plain float, outside the exact-number lint of `src/campaign/`.

| Step | Function | What it does |
|---|---|---|
| Heights | `despiked` | each node clamped to the range of its eight neighbours (the terrain tiles' single-node spikes drew dark dots) |
| Shape | `buildShape` | the large forms kept (a 3 km blur), detail scaled by `fine`, mountain regions lifted, the whole raised `vert` times, flattened over 12 km to the frame's edge |
| Lakes | `lakeDistance`, `sinkLakes` | the signed distance to the shores, blurred; the lakes sunk 70 m below them |
| Light | `bakeLightRows` | the sun's soft shadow (a ray toward a sun disc 2.5° across, to about 60 km) and the sky's occlusion (the horizon in eight directions, to 9 km), a byte each, by bands of rows |
| Forests | `smoothCover`, `resampleField` | the tree cover smoothed by three box means of 500 m either side (copses fade, large forests stay), made once at 100 m and resampled to each level |

Its parameters are the prototype's defaults (`tools/campaign-tiles.ts`: a sun 20° high from 55°, the relief raised
2.5 times). Tested in `test/campaign-bake.test.ts` (the box mean against the slow way, the despiking, the lakes'
distance, a ridge's shadow, the same bytes by bands as in one pass) and `test/worldcover.test.ts` (the smoothing,
the resampling).

## The fields

`src/render/campaign/fields.ts` (decision 0094): the far level's fields, the page's every input besides the tiles,
in one file a build (`fields.bin`, deflated): a header (`CMPF`, the version, the planes), then named planes, each
bytes or Uint16 at a scale and an offset (a Uint16 plane's rows as differences, as the tiles' shape:
`src/render/campaign/rows.ts`). On the far
level's grid (`bake.ts`):

| Plane | Made by | What |
|---|---|---|
| `lakes` | `lakeMask` | the lakes' coverage, two texels a cell (a texel 125 m), each from 4 × 4 samples in the water; the pieces Natural Earth splits a lake into count as one |
| `lakeD` | `lakeDistance` | the signed distance to the shore, in km (the lakes' steps), at 0.25 m |
| `high`, `country`, `rivers` | `lineOffsets` | a texel a cell: the vector to the nearest high road, country road or river of rank 6 or larger, in cells to 6 either way, two bytes (a bilinear read gives the exact distance, so the page draws the line crisp at any width) |
| `contour` | `blur` | the heights blurred over 3 cells, for the contours, at 0.25 m from their lowest |

For the 1805 theatre: 7.6 MB, 2 s. Against the prototype's own bakes at load (sampled in Chrome): the roads and rivers
byte for byte, the contours' heights within their step; the lakes' distance is K2a's, which the tiles' sunk lakes
use (the prototype's differs near some shores); the prototype's mask, drawn on a GPU canvas, stands about half a
texel past the shore, where this one follows the rings. Tested in `test/campaign-fields.test.ts`.

## The tiles

`src/render/campaign/tiles.ts` (decision 0094): a level cut into tiles of 256 × 256 nodes, each one binary file,
deflated. A 16-byte header (`CMPT`, the version, the level, the column and row, the size, the planes), then the
shape as Uint16 in 0.5 m steps above the level's base (-70 m: the lakes sink below the lowest ground), each row as
differences from the node before, then a byte plane each for the sun, the sky and the forest. Nodes past the level's
grid repeat its edge. `packTile` refuses a place past the header's range; `unpackTile` takes the place it was asked
for and refuses a tile of another; `inflate` uses the platform's `DecompressionStream`; `cutTile` takes a tile from a
level's bake, `levelLayout` says how a level is cut. Tested in `test/campaign-tiles.test.ts`.

`tools/campaign-tiles.ts` bakes and writes them under `scratch/campaign/` (git-ignored):

| Level | Cell | Nodes (1805 theatre) | Tiles | On disk |
|---|---|---|---|---|
| `l0` | 250 m | 3201 × 2001 | 104 | 18 MB |
| `l1` | 100 m | 8001 × 5001 | 640 | 91 MB |

with `manifest.json`: its own format's version, its build, the fields' file, the frame, every parameter the bake depends on (the shape's, the
theatre's lowest ground, the sun's, the lakes', the forests' and their field's), the levels (cell, nodes, tiles, the
shape's step and base, the heights' zoom, the tiles' path) and the credit. Each level's grid must span the frame
exactly (its cell divides it, or the tool stops). Each build goes into a directory of its own,
`scratch/campaign/b-<time>-<pid>/`, its files flushed to the disk, and the manifest that names it is written last, to
a temporary file renamed over the last one; only then are the older builds removed, all but the one replaced (a page
may still be reading it) and any started later (a run under way) (`tools/campaign-builds.ts`, tested in
`test/campaign-builds.test.ts`). A run that fails or is killed at any moment leaves the last manifest naming a whole
build. One run at a time: two at once do not remove each other's builds, but the last to finish is the live one. The build takes 69 s on 8 cores (the i7-9700K of the owner's WSL machine): 10 s for
`l0`, 58 s for `l1`, most of it the light; the tiles are deflated on libuv's thread pool. It also writes the 100 m
level as the prototype's base64 tiles (280 MB) under `scratch/campaign-tiles/`, from the same cut, their shape held
at zero as the prototype expects, in a build directory of their own the same way: their meta file, written last, names it,
and the prototype reads its tiles from there, so it never draws a mix of two runs.

The tools around it: `tools/campaign-theatre.ts` (the theatre's data, its 250 m heights, the forest field),
`tools/worldcover.ts` (the forests' source), `tools/terrarium.ts` (the heights' source).

## Open questions

- One light model for both map views (decision 0058): the battle map's lit view bakes its own relief
  (`src/render/lit/bake.ts`), at another scale; settled with the renderer in K2b.
- A smaller format (a predictor for the light planes, another codec), if the size matters once the whole of Europe
  is baked (K6).
