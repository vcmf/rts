---
status: active
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

## Decisions

- The page's renderer is its own (`src/render/campaign/`), not the battle map's lit view (`src/render/lit/`): its
  inputs are tiles baked offline at a thousand times the scale. Whether the two views share their light model stays
  the track's open question (decision 0058), settled in K3.
- Every input baked offline: the page reads and uploads, so its load time is the network's, and every machine draws
  the same map.

## Open questions

- Where the built page finds its tiles (a CDN, the build's own `public/`): with the theatre as data, K3.
