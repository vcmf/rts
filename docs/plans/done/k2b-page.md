---
status: done
last_reviewed: 2026-10-31
---

# Plan: K2b, the campaign page

Track K (`docs/plans/active/track-k.md`), on `epic/campaign`, after K2a (`docs/plans/done/k2a-bake.md`). The campaign
map in the game: a page in `app/` that draws the 1805 theatre as the K1 prototype (`prototypes/campaign-map.html`)
does, from the tiles K2a bakes. The prototype still bakes at load what is not the light (the water's mask and depth,
the lines of the roads and rivers, the contours' heights) from the theatre's own file; the page bakes nothing: every
input it reads comes from the tool. Labels and ink are K2d; streaming done properly (a ring of tiles, partial uploads)
is K2c.

Two PRs, each reviewed by the workflow in `AGENTS.md`:

## K2b1: the far level's fields, baked offline

- `src/render/campaign/bake.ts` gains, as pure functions on a grid:
  - `lakeMask`: the lakes as coverage bytes over the frame, `res` texels a cell (2: sharper shores than the heights),
    each texel's coverage from 4 × 4 samples inside the rings (the prototype filled them on a 2D canvas);
  - `lineOffsets`: for each kind of line (high roads, country roads, rivers of rank 6 or larger), a texel per cell
    holding the vector to the nearest point of such a line, in cells, to `reach` cells either way, as two bytes (the
    prototype's `bakeLines`, moved as is: a bilinear read of the vector gives the exact distance, the page draws the
    line crisp at any width);
  - the contours' heights: the despiked heights blurred over 3 cells (`blur`, as the prototype's).
- `src/render/campaign/fields.ts`, the fields' format (decision 0094 amended): one file a build, `fields.bin`, deflated:
  a header (`CMPF`, the version, the number of planes), then each plane: its name, its size, its channels, its kind
  (bytes, or Uint16 with a scale and an offset to read it back as a number) and its values. The lake distance (in km,
  -3 to 12) and the contours' heights (metres) as Uint16 at a step well under what the page draws (a 0.25 m contour
  height, a 0.25 m lake distance); the mask and the line offsets as bytes. `packFields` and `unpackFields` both ways,
  the compression the caller's, as the tiles'.
- `tools/campaign-tiles.ts` writes it into each build, from the theatre (its heights, lakes, rivers, roads), and lists
  it in the manifest with its parameters (the lines' reach and rivers' rank, the mask's resolution, the contours'
  blur). The prototype is unchanged.

**Acceptance**: Vitest: the mask of a square lake exact at its corners and half covered on its edges; the offsets
against the slow way (every segment for every texel) on a small grid; the fields packed and unpacked to the same
values, the Uint16 planes within half their step; a wrong magic, version or length refused. The fields against the
prototype's own at-load bakes, read from the prototype page in Chrome: the line offsets equal byte for byte, the
contours' heights within their step, the mask's differences explained.
The file's size and its bake time measured.

**Results** (K2b1): the fields 7.6 MB for the 1805 theatre (the contours' heights 6 MB of it), 2 s of the 70 s
build. Against the prototype's at-load bakes, sampled in Chrome on a stride (25,833 mask texels, 51,303 line bytes
each, 6,425 nodes): the roads and rivers byte for byte; the contours' heights within their step (0.125 m at most);
the lakes' distance different at 127 nodes (by 0.33 km at most) where K2a's bake, which the tiles' sunk lakes follow,
already differed from the prototype's; the mask different at 11 texels, each one the prototype's full where this
one is partly or barely covered: at the one measured, the texel's centre lies 53 m outside the lake's edge (the
prototype draws the lakes on a GPU canvas of 6400 × 4000 that stands about half a texel past the shore).

**Review rounds** (K2b1): round 1 (`/code-review high`), no severe finding; fixed: the contours' heights stored from
their own lowest (a theatre with sea deeper than 1 km stopped the build); `quantise` and `packFields` refuse a plane
of part channels, a size or channel count past the header, two planes of one name (`unpackFields` too); the tool
checks the fields' level is one of its levels; the fields made inside the level's bake, so the 100 m level keeps no
heights or lakes' distance; the mask's rows only over the texels their lakes span; the row differences one module
(`src/render/campaign/rows.ts`) for the tiles and the fields; the rings made once. Taken into K2b2: the mask is
6400 × 4000 texels, past a GPU whose textures stop at 4096: the page halves it there (a mean of 2 × 2, not a bake).
The fields and the tiles unchanged.

## K2b2: the page

- The page (a new HTML page in `app/`, built beside the others) and its script `src/app/campaign/main.ts`: it loads the manifest (`?tiles=`, by default
  `/scratch/campaign/manifest.json`, which `npm run dev` serves: the built page needs the tiles beside it, settled
  with the theatre as data in K3), checks its format and parameters, then the far level's tiles and its fields;
  drag to pan, the wheel to zoom to the cursor, the prototype's `?view=`; the fps meter.
- `src/render/campaign/view.ts`: the Babylon scene, the prototype's: the map raised by the shape on a mesh, the plate
  and the table; the print material with its shaders in files (`src/render/campaign/shaders/`: the paper, the
  forests, the contours, the water's steps, the lines, then the sun and sky light, the clouds, the lamp, the haze);
  the camera tilting from 30° far to 45° close; FSR 1 above 1080p. The far level's tiles assembled into whole-level
  textures (one texture: 3201 × 2001 nodes).
- The close zoom: the 100 m tiles in a detail area around the camera, the prototype's as it is (a window of tiles,
  loaded as the camera moves, faded in); K2c replaces it with proper streaming.
- The fields uploaded as textures; the lakes' mask halved (a mean of 2 × 2) where the GPU's textures are smaller.
- `src/render/campaign/paper.ts`: the paper's grain and the clouds' noise, the prototype's canvases.
- Pure parts tested in Vitest: the tiles assembled into a level (their edges, the last ones padded), the manifest's
  checks, the camera's tilt and its ground pick.
- Docs: `docs/systems/campaign-map.md` (the page), `AGENTS.md`'s commands.

**Acceptance**:
- The page against the prototype: screenshots at the same views (the whole theatre, the Danube, the Alps up close, a
  lake), side by side and through `tools/golden.mjs`; the differences explained.
- 150 fps at 1080p on test machine A (`docs/plans/active/perf-150.md`; Windows Chrome on its RTX 3080 over CDP): the
  frame time panning and zooming over a scripted path, at 1080p and at 4K with FSR 1.
- Nothing baked at load: the time to the first frame measured, against the prototype's.

**Results** (K2b2), on test machine A (Windows Chrome on its RTX 3080, headless over CDP, 1920 × 1080):
- The page against the prototype (its ink hidden: names and towns are K2d) at four views (the whole theatre at
  1,150 km, the Danube at 250 km, the Alps at 60 km, Lake Constance at 90 km): a mean difference of 2.1, 1.1, 1.4 and
  2.0 levels a channel; 0.7 to 1.1% of the pixels off by more than 48. Where they differ: the lakes' steps (the
  page's lakes' distance is K2a's, which its sunk lakes follow; K2b1's results), and the light slightly, the page's far
  light baked at 250 m where the prototype's is at 500 m.
- The frame (`bench(60)`, each frame waited for on the GPU), over four runs (the same build measured 3.7 ms and
  then 5.5 ms at the far view, an hour apart: the GPU's state, not the page): 2.7 to 5.3 ms at the four views at
  1080p, the far view the dearest; 2.7 to 6.7 ms at 4K (device pixel ratio 2, FSR 1 at ×1.87), the far view at the
  150 fps line in the slowest run. Panning up close over 120 steps: a mean of 3.0 to 4.8 ms, the 95th centile 2.1 to
  5.1 ms, the worst 82 to 98 ms: the detail area's refill and upload, K2c's.
- The load (three runs each): the far level's tiles and the fields fetched and inflated in 0.6 s, the page ready in
  2.4 s; the prototype ready in 6.5 s, 5.5 s of it its bake.
- `tools/shot.mjs` gains `SHOT_DPR` (the device pixel ratio, for the 4K runs).

**Review rounds** (K2b2): round 1 (`/code-review high`), no severe finding; fixed: the haze's screen height the
height the scene is drawn at under FSR 1 (at 4K it had almost gone); the plate's top below the deepest lake (a lake
near the lowest ground was hidden under it); the pointer's map point on the raised surface, not the plane under it (a
drag over the Alps slid); a tile that failed tried again once the area moves; the mesh's last column and row on the
frame's edge for any count of nodes; the manifest's HTTP status reported; a wheel that counts lines zooms as one that
counts pixels; the map's mesh made before the table (measured: no change in the frame); doc comments. Left to K2c:
a tile's arrival uploads the whole detail area (75 MB), the cause of the panning frames of 80 to 100 ms.

## Decisions

- The page's renderer is its own (`src/render/campaign/`), not the battle map's lit view (`src/render/lit/`): its
  inputs are tiles baked offline at a thousand times the scale. Whether the two views share their light model stays
  the track's open question (decision 0058), settled in K3.
- Every input baked offline: the page reads and uploads, so its load time is the network's, and every machine draws
  the same map.

## Open questions

- Where the built page finds its tiles (a CDN, the build's own `public/`): with the theatre as data, K3.
