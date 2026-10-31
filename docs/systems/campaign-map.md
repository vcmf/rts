---
status: current
last_reviewed: 2026-10-31
---

# The campaign map

What is built of the campaign map in the game's code (Track K, `docs/plans/active/track-k.md`; the look is decision
0093 and `docs/proposals/campaign-map.md`): the bake that makes the map's one shape and its light, the tiles and
fields it is stored in, and the page that draws them (`app/campaign.html`, K2b to K2d), with its names.

## The bake

`src/render/campaign/bake.ts`, pure functions on a grid (nodes `cell` metres apart, the south row first), no DOM and
no Node. Renderer data, not the campaign's rules: plain float, outside the exact-number lint of `src/campaign/`.

| Step | Function | What it does |
|---|---|---|
| Heights | `despiked` | each node clamped to the range of its eight neighbours (the terrain tiles' single-node spikes drew dark dots) |
| Shape | `buildShape` | the large forms kept (a 3 km blur), detail scaled by `fine`, mountain regions lifted, the whole raised `vert` times, flattened over 12 km to the frame's edge |
| Lakes | `lakeDistance`, `sinkLakes` | the signed distance to the shores, blurred; the lakes sunk 70 m below them, eased over 500 m across the shore at every level (over one cell, the 100 m level drew a staircase along the shore) |
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

## The page

`app/campaign.html` and `src/app/campaign/main.ts`: `npm run dev`, then `/app/campaign.html` (the tool's output under
`scratch/campaign/`, which the dev server serves; `?tiles=` another manifest of the page's origin). It fetches the
manifest (`readManifest`: its format, its levels spanning the frame, its fields), the far level's 104 tiles (eight
at once) and the fields, inflates them with the browser's own stream, and hands them to the view; nothing is baked.
Drag pans, the wheel zooms to the cursor; `?view=x,z,km`, `?upscale=off|<factor>`, `?fps=0` as the prototype's. The
page keeps `window.__campaign` for the checks: `setView`, `view`, `detail`, `upscale`, `bench(n)`, `start` and `stop` (the render loop) and the load's
`loadedMs` and `readyMs`.

`src/render/campaign/`:

| Module | What |
|---|---|
| `view.ts` | `CampaignMapView`: Babylon, the map raised by the far level's shape on a mesh (a vertex every two nodes), the plate's sides and the table; the textures from the tiles and fields (the lakes' mask halved, a mean of 2 × 2, where the GPU's textures are smaller); the detail area of the close level around the camera (`ring.ts`), 6 tiles loading at once, 320 kept, 2 uploaded a frame; FSR 1 above 1080p; a frame every display frame (the clouds drift) |
| `shaders/print.vert`, `shaders/print.frag` | the prototype's print: the paper, the forests, the contours, the water's steps, the lines, then the sun and the sky per pixel, the clouds, the lamp, the haze; `shaders/side.*` the plate's sides; `shaders/patch.vert` the patch (below); `shaders/detail.glsl` and `shaders/farmesh.glsl` shared by them, registered as Babylon's includes `campaignDetail` and `campaignFarMesh` |
| `patch.ts` | pure (K2c2): the patch near the camera, a mesh of 501 × 501 vertices on the close level's nodes (50 km a side) that follows the target up close on the far mesh's grid, raised by the 100 m shape where its tiles are drawn (a tile fades in over 0.4 s, and toward a neighbour not yet drawn over 1 km, in the light and the geometry alike); the detail eases out from 19 to 22.5 km from the target, moving with it, and beyond, out to its edge, the patch lies on the far mesh's own surface (`farMeshHeight`, its triangles), where the far mesh is drawn too with the same fragments, so the two meet without a crack; the far mesh's vertices further inside drop under the plate; the patch drawn first, so the far mesh under it is hidden by the depth test |
| `level.ts` | pure: the manifest checked, a level put together from its tiles, a tile copied into a window, the fields' planes made ready for the GPU |
| `ring.ts` | pure (K2c1): the detail area as a ring of 12 × 12 tile slots, the tile at (i, j) always in slot (i mod 12, j mod 12) of textures that wrap, so a move loads only the tiles that come in; the area's place (moved when the target is more than a tile off its middle), its tiles nearest first, the slots' table (the tile each slot holds, 16 bits a column and a row: the shader draws a tile by its slot's fade-in, 0.4 s as it is first written, and fades it toward a neighbour not yet drawn over 1 km from their edge, in `shaders/detail.glsl`), the tiles to load (not cached nor in their slot, a failed one again after 5 s, doubling to 60 s), the uploads waiting (one a slot, each tile into its own rectangle of the textures, 2 a frame) |
| `camera.ts` | pure: the tilt (30° far to 45° at the closest), the view kept on the map and above its ground, the camera's place, a ray's ground point |
| `paper.ts` | the paper's grain and the clouds' noise, two canvases drawn at load |

Tested in `test/campaign-page.test.ts`, `test/campaign-ring.test.ts` and `test/campaign-patch.test.ts`. Against the prototype (`docs/plans/done/k2b-page.md`): the same image to a
mean of 1 to 2 levels a channel at four views; 2.7 to 5.3 ms a frame at 1080p on test machine A, 2.7 to 6.7 ms at 4K
with FSR 1; ready in 2.4 s (the prototype 6.5 s, 5.5 s of it its bake).

Panning up close (K2c, `docs/plans/done/k2c-stream.md`): a mean of about 3 ms a frame and the 95th centile about
4.5 ms at 1080p on test machine A, the patch drawn (single frames of 7 to 13 ms when the GPU is shared), where the
refilling window of K2b took 80 to 100 ms.

Babylon's shader preprocessor reads a `#include<…>` even in a comment (it waits for a file that is never there, and
the material is never ready, with no error), and fails on a semicolon in a comment on a `uniform` line: the shaders'
comments avoid both.

## The names

K2d (`docs/plans/active/k2d-ink.md`). The tool writes `labels.json` into each build (the manifest's `labels`): the
1805 data file's towns (names, sizes, fortresses) and regions (names, angles), placed through the theatre's projection, and the
theatre's named rivers, their points thinned to every other one (`tools/campaign-data.ts` reads the data file for both
tools). The page draws them on a 2D canvas over the map (`src/render/campaign/ink.ts`), redrawn when the view changes:

| Module | What |
|---|---|
| `labels.ts` | pure: the towns shown at a zoom (capitals always, small towns from 2.2 px a km), a town's mark and its name's font, the four places a name is tried (right, left, above, below), the placement (every mark first, then the names, the largest towns first, then the rivers' in the box round their turned text, `turnedBox`: a name never over a name or a mark; the regions' lettering lies under them), a river's name where half its longest visible run is reached, upright, the regions' fade |
| `ink.ts` | the canvas: the regions lettered across the land, the towns as dark blocks (a fortress ringed) with their names, the rivers' names in italic blue, the prototype's fonts (Instrument Serif), halo and colours, clipped to the frame; a label is drawn only where the ray from the camera to it passes over the ground as drawn (`seenFrom` in `camera.ts`, at most 96 samples a ray); the towns and regions off the screen skipped, the rivers whose box is off it not projected; redrawn in every frame where the view or the surface as drawn changed (the close tiles written or fading in) |

The view gives the ink the projection of a map point at its height as drawn (`clipOf`), the camera's place and the
map's height. Tested in `test/campaign-labels.test.ts`. A redraw takes 0.25 to 1.9 ms on test machine A.

## Open questions

- One light model for both map views (decision 0058): the battle map's lit view bakes its own relief
  (`src/render/lit/bake.ts`), at another scale; the campaign page has its own renderer (K2b), the question settled in
  K3.
- A smaller format (a predictor for the light planes, another codec), if the size matters once the whole of Europe
  is baked (K6).
