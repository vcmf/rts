---
status: active
last_reviewed: 2026-10-25
---

# Plan: M6, the lit map view in the game's code

Track M, on `epic/map-engine` (decision 0020). Phase M6 of `docs/proposals/map-engine.md` §10, step 2 of
`docs/plans/active/one-map-austerlitz.md`. Several PRs into the epic (below); this plan covers them all and details the
first.

## Problem

The map's one view is the lit map (decision 0058): paper, shaded relief, contours, woods, water as a wash, raised
houses, the armies as slabs, leaning 20° off straight down (decision 0055). It exists only in the single-file
prototype (`prototypes/staff-map.html?style=lit&relief=shaded`, settled by eye with the owner), drawn from invented
data. The map page (`app/map.html`) draws the compiled map as a flat raster of category colours (`src/map/draft.ts`).
The editor (M7) is to be built on the lit view, and the flat drawing is to become debug overlays switched on in the
settings (the owner, 2026-10-25).

## The split

| PR | What | Acceptance |
|---|---|---|
| **M6a** (this plan's detail) | The lit terrain in `src/render/lit/`, on the map page: paper and grain, the shaded relief, woods, water, contours, the tilt; the flat draft as an overlay setting; the outlines and ids drawn through the same camera | The same relief look as the prototype for Austerlitz; every example map draws; the bakes' time and memory at 6 km measured; the frame measured |
| **M6b** | Ink from the features' shapes: ways, banks and shores, wood edges, houses raised and lit, village yards, names; crisp at every zoom | The generated and valley maps against the prototype's look |
| **M6c** | The debug overlays as settings: the flat colours (M6a), outlines and ids (M6a), the hover readout, errors in place, passability per kind of unit, depth, slope, sight from a point | Each overlay checked by `tools/map-page-check.mjs` |
| **M6d** | The game's staff map from the lit view (the S1b page's `StaffMap` art replaced for maps with layers), the armies as slabs; or in M9 with the zoom | 150 fps at 30× on test machine A |

## Decisions taken here (decision 0064)

- **Host:** the map page first (the editor's base, M7); the game page in M6d or M9.
- **Babylon**, as the look page: M9 joins the two views on one camera, and the EASU pass exists (`src/look/post.ts`).
- **Flat at map zoom:** the prototype draws the terrain flat at the map's zoom (it rises only toward the painted
  world). M6a draws one flat plane; the relief is the bakes and the contours. The rising is M9's.
- **Exact heights in the shader:** the 2 m node heights go up as a float texture read with `texelFetch` (WebGL2,
  decision 0046) and interpolated in the shader, so the contours are those of the compiled heights, not of a
  decimated mesh.
- **The bakes run in the compile worker**, after `apply`, as pure functions in `src/render/lit/bake.ts`: the relief
  (slope light, cast shadow, exposure) on the 2 m nodes, and a cell mask (water depth, woods, water).
- **The light is a parameter:** one of the 8 directions of the grid for the cast shadow's walk (the prototype hard-codes
  the north-west diagonal), the exact vector for the slope light. North-west by default (one-map open question 6
  stays open; turning it later is a uniform and a rebake).
- **Contours every 5 m, index every 25 m**, in absolute heights (the map's datum added), as settled in the prototype.
- **No armies in M6a–c:** the armies language is out of scope; slabs come with the game page (M6d).

## M6a in detail

- `src/render/lit/bake.ts` (no DOM, run in the worker):
  - `bakeRelief(heights, nx, nz, cell, light)`: the prototype's bake on the node grid: cast shadow by a walk from the
    light's side along its grid direction, softened over a few metres; exposure from two box means (about 24 m and
    80 m); Lambert on heights exaggerated ×2, sun 30° up. RGBA bytes, the south row first.
  - `bakeMasks(layers)`: per cell, R water depth (0..1 over 0..1.5 m), G woods (vegetation with growth `stand`), B water.
- `src/render/lit/view.ts`: a `LitView` on its own canvas: an engine, a camera from the page's view (centre, pixels
  per metre at the centre, tilt), the plane over the map's extent, its shader (`lit.vert`, `lit.frag`, ported from the
  prototype's `TER_FS` lit and shaded paths: paper, worn border, woods, relief tone, water wash with the sunk bank,
  contours, paper grain), and `project` / `unproject` for the overlays and the hover.
- `src/render/lit/paper.ts`: the tileable paper and noise textures, from the prototype.
- The map page: the lit canvas under the overlay canvas; a "view" setting (lit, or flat colours), `?tilt=`;
  pan, zoom and hover through the view's projection.
- The worker's reply gains the bakes; the draft raster stays (the flat colours).

## Acceptance (M6a)

- Austerlitz in the lit view beside the prototype's `?style=lit&relief=shaded&dem=` at a matching zoom: the same
  relief style (the prototype squeezes its ground 2.5×, so the shapes differ in scale).
- Every map in `maps/` draws in both views with no console error; the map page check passes.
- The bakes' time in the worker and their memory at 6 km, and the frame time on the dev Mac, measured (test machine A
  is not here: its 150 fps is M6d's acceptance).

## Results (M6a)

- The map page draws every map in `maps/` in the lit view and in the flat colours, with no console error; the outlines,
  ids and play area follow the tilted camera. `tools/map-page-check.mjs` passes (a save to a redraw in 0.52 s).
- Austerlitz (6 km): the bakes take 0.48 s in the worker (relief on 3001² nodes and the mask), beside `apply`'s
  0.52 s; the textures are about 144 MB on the GPU (heights, relief, mask, flat draft). The relief reads as the
  prototype's `?style=lit&relief=shaded&dem=` (same shader, same palette), at true scale where the prototype squeezes
  2.5×: more contours, steeper-looking slopes.
- The frame on the GPU is not measured: headless Chrome returned 0.05–0.08 ms a frame for `gl.finish` timing, which
  does not wait for the GPU there. M6d measures it on test machine A with the game page.

## Open questions

1. The water wash needs the distance to the bank for its sunk-bank shading; the prototype takes it from a blurred
   depth. M6a uses the depth's gradient as the prototype does; a true distance field may read better.
2. The bakes at 6 km: 9 M nodes. Measured in M6a; if the worker takes over a second, a 4 m bake for maps over 3 km.

## Review rounds (M6a)

- **Round 1** (`/code-review high`): severe. Three severe findings:
  - ground points behind the tilted camera projected mirrored or huge, so outlines and the play area could draw
    stray lines across the screen when zoomed in;
  - the first frame after a map loaded could be blank (the shader still compiling), with nothing to redraw it;
  - without WebGL2 the whole page failed to load, error list included.

  Fixed: `LitView.depth` gives a ground point's clip w and `project` returns null at or under a near limit; the
  page's outlines and play area are clipped where they meet it, and marks and ids behind it are skipped; the page
  redraws when the view is ready (`ready`); the view refuses a WebGL1 engine with a clear error, and the page then
  keeps its panel, errors and readout. With them: the textures' list is emptied after disposal; the view setting is
  applied as the browser restores it; the plane reaches 100 km past the map, so no paper edge shows at the widest
  zoom; the slope at the grid's edges is taken over its true span (no seam), with a test; the light travels with the
  bake to the shader; the noise helpers are the look's (`src/look/noise.ts`); the page drops the bakes' buffers once
  they are on the GPU.
- **Round 2**: moderate and light only, so the review stops. Fixed:
  - picking another map clears the lit view, so a failed compile no longer shows the last map's picture under the new
    map's errors, and the error tint shows then too;
  - without WebGL2 the page projects straight down and flat, as before, so the readout, pan and zoom still work;
  - the engine no longer keeps every texture's source bytes for a lost context (144 MB at 6 km); a lost context is
    reported in the panel;
  - one draw a displayed frame (`requestAnimationFrame`), however many pointer events arrive;
  - the overlays' near limit is a twentieth of the camera's distance, so a clipped line ends a few screens away at
    most, not millions of pixels;
  - one wait for the view's readiness at a time, failing after 10 s with the shader's error;
  - no camera from a canvas with no size or a zoom of 0;
  - picking a map keeps the other settings in the URL (`?tilt=`);
  - `project` and `unproject` read the camera's matrix and its inverse, kept with the canvas's size in `setCamera`:
    no layout read or matrix inversion per point.

## M6b: ink and houses (decision 0065)

- **Redesigned after round 3** (the owner, 2026-10-25: "Cells, edges smoothed"): the water, the woods and the
  barriers come from their cells, the ways' edges from their shapes. Decision 0065 was amended in this PR, before it
  merged, to say so. The first design (every fill from the shapes) is in the review rounds below.
- `bakeInk` (`src/render/lit/bake.ts`), in the worker: R the ways' edges from their centrelines at the width apply
  paints them (`waysOf`, `lineReach`), cut square at free ends, outside away from the ways' cells; G the water, B the
  barriers, A the woods, each the signed distance field of its cells (`cellField`: a two-pass chamfer, the 0 on the
  cells' sides; smoothed by a binomial blur for the water and the woods, each cell held on its own side; saddle
  corners joined; square for the barriers). The contract (the owner, 2026-10-25): every cell reads as its own kind at
  its centre, and an edge lies within half a cell of the cells' sides. No texture is mipmapped.
- The shader fills the water and the woods from their fields, draws hairlines where a field is 0 (banks, road
  edges), a pond's or a river's lining at 4.5 m and 7.5 m (not on the water's middle line, where the field folds), the
  barriers solid; a road's ground a little lighter; the edges fade from a metre a pixel to three. Contours fade below
  half a percent of slope (gated on the ground's slope, not the pixel's).
- The houses (`LitView.setHouses`): `built.house`, `.barn` and `.church` footprints (`ringsOf`) as boxes at their
  wall height, roofs by ear clipping, faces lit by the map's light in the prototype's colours; each footprint swept
  away from the light as its shadow, every pixel darkened once (a stencil); hidden in the flat colours.
- The names: `zone.label` texts at the middle of a line or at a point, in italic on the overlay, with a paper halo.
- **Results:** the generated map's wood stops at the brook's bank, its village stands raised and lit along an
  unbroken road; the valley's hedges keep their gates; every map in `maps/` draws with no console error. The bakes:
  0.2 s for the generated map, 1.45 s for Austerlitz (6 km), in the worker.
- **Open:** up close, a stream's carved channel still steps in the relief's shading and contours (`apply` carves it
  cell by cell into the heights). The cells' fields at 6 km take about a second; a faster transform if saves need it.

### Review rounds (M6b)

- **Round 1** (`/code-review high`): severe. The ink was drawn from the raw shapes where the map engine applies rules
  to them:
  - hedges and walls were continuous lines across their gates (`gaps`; the valley's and two-ridges' hedges), so
    the map showed walls where units pass;
  - woods filled over the lines they keep clear of (`clear`, as `follow` records it), against the cells the sim reads;
  - a path or stream narrower than a cell could vanish between the cells' centres;
  - the far bank's light was lost (the shapes' water covered the cells it lit).

  Fixed: the barriers' field comes from their cells (on the grid by design, §3.6), gates open; a wood's field cuts out
  each line it clears by the reach apply gives it (`lineReach`, a sunken way's cut, the offset); a line keeps at least
  a cell of half-width in its field, as apply paints every line at least a cell wide; the far bank's light reads the
  cells' water again. With them: an area's field by per-segment bands and a scanline fill (no distance to every edge
  for every cell); the pond's lining at 3 m and 6 m, inside the field's 8 m; the barrier fill in a portable
  `smoothstep`; the houses hidden in the flat colours; a house's ring from `ringsOf` (circles and ellipses as apply
  paints them) and its roof by ear clipping (a concave footprint); the names read once a compile. Also found while
  checking, from M6a: flat ground lying exactly at a contour's height (the valley at 0 m) was drawn all in contour
  ink; a contour now needs the ground to slope on screen. `MAP.look(x, z, ppm)` aims the page for checks.
- **Round 2**: severe. The round-1 contour fix judged flatness per screen pixel, so contours on gentle slopes would have
  vanished zoomed in. Fixed: the gate reads the ground's slope in metres a metre (`fwidth(h)` over the pixel's ground
  size), the same at every zoom. With it: a narrow line keeps cell·√½ of half-width, not a whole cell (a 1.5 m path no
  longer inks as 4 m); line fields and a wood's cleared bands end square at a line's free ends, as apply paints them,
  and the cut bands are clipped to the wood's box; the lining at 4.5 m and 7.5 m, clear of a stream up to 9 m wide;
  a house's shadow is its footprint swept away from the light (a concave one too), drawn on one plane with a depth
  test so overlapping shadows darken once; ear clipping ignores corners on a straight edge; the names take the
  features' `anchor`; the mask's G is unused (the woods come from the ink). Found while checking: the square-end rule
  first took `max(d − half, over)` everywhere, which emptied every line's inside (roads and streams drawn solid); a
  test now checks a line's inside and its square ends.
- **Round 3**: severe, the third: the woods' field (the union of their shapes) ignored the vegetation layer's
  priority, so a field painted over a wood drew as forest. Three rounds had each found a rule of the engine the
  shapes did not follow (gaps, `clear`, priority): the design was wrong, not the code. Stopped and redesigned with the
  owner (above). The round's other findings went into the redesign: shadows darkened once by a stencil (the depth
  trick could double-blend), names at a line's true middle, the fields mipmapped against far-zoom dashes, the far fade
  on the metres a pixel spans, the lining kept off the water's middle line, no dead mask channel, one rule for a
  way's width (`lineReach`). The review count restarts with the redesign.
- **Redesign, round 1**: severe. The smoothing blurred narrow features away: a stream one or two cells wide drew
  outside its own edge (a 1-cell stream not at all, a 2-cell one 0.4 m wide), and a clearing one cell wide in a wood
  filled with forest, against the cells. Fixed: after the blur each cell stays on its own side of the edge by at least
  half its raw distance (a 1-cell stream draws about a metre wide, a 2-cell one about 3 m, a 1-cell clearing stays
  open), with tests that measure it; the ink's fields are no longer mipmapped (averaged, a hedge or a brook two cells
  wide vanished from the far view; the cells' mask still is). With them: a house's shadow as long as its wall is high;
  a roofless house (a ruin) stands low; the names keep their stroke to themselves (`save`/`restore`); `ccw` from
  `ringArea2`; an empty mask skips its distance transform.
- **Redesign, round 2**: severe. A feature one cell wide stepping diagonally broke into beads (its cells' shared
  corners read as the other kind), and the road ink's gate (the ways' cells widened by a cell, mipmapped) let a road
  draw across a stream that took its cells. Fixed: cells meeting only at a corner are joined, the corner given to one
  kind (water and barriers their insides, the woods their outsides, so streams, hedges and clearings stay one line);
  the road's field itself is outside on every cell neither a way's nor beside one, and on water that took a way's
  cells, so no separate gate; no texture of the view is mipmapped now (the water's depth and its fill read alike at
  every zoom). With them: a roofless (burnt) house stands at its own wall height with no roof drawn; a long way segment
  is scanned in 16 m pieces; a closed way has no square cut at its seam; no names over the fallback view.
  **Open:** far out, features a cell or two wide are sampled, not averaged, and may shimmer while the view moves; a
  min-filtered mip chain would keep them steady.
- **Redesign, round 3**: severe, the redesign's third. The corner join pulled every stair-step cell, not only true
  diagonal corners, moving 45° shores and hedge steps about half a metre onto the other kind's cells; and the road
  gate's water test never applied (apply keeps a way's cells under the water it crosses). The rounds kept holding a
  smoothed edge to the cells' exact sides, which no smooth edge can meet: the rule was the problem. Stopped and asked
  the owner, who set the contract: every cell reads as its own kind at its centre, an edge within half a cell of the
  cells' sides (decision 0065, amended in this PR). Under it: the corner join holds only saddles (a stair-step is left
  alone), with a test of the contract over stair-steps, saddles, one-cell lines, diagonals, a blob and clearings; the
  road gate is the ways' cells alone (an unbridged crossing shows both, as the sim has both); a loop's seam is cut
  square as apply cuts it; the join writes in place and the gate dilates the way cells once; the road surface is
  anti-aliased like the fills; the lining's fold test reads the field's gradient in any direction; the docs no longer
  say the fields are mipmapped. The review count restarts with the contract.
- **Contract, round 1**: severe. The road gate overwrote the field beyond a cell of the ways' cells with 8 m, a jump
  that drew a second hairline about a metre outside a road, and left the cells beside a gap reading as road at their
  centres; a diagonal hedge's fill pinched to a point at each step (the fill began below −0.4 m, the saddle corner's
  value); houses stood from their shapes even where another built feature took their cells. Fixed: the road's field
  keeps the shape's true distance and only holds each way cell inside at its centre and every other cell outside (no
  jump, the contract met, with a test over every cell); the barriers' fill is anti-aliased at its 0, so a diagonal
  hedge stays solid; a house stands only where every cell under it is its own, and a courtyard gets no roof; the docs
  say how far a saddle's cells yield; the decisions index names 0065 as decided; the unused `mips` parameter is gone.
  Left: the worker's peak memory for the cells' fields at 6 km (five grids a channel) and a shared exact distance
  transform (`src/look/world/water-data.ts`'s `edt`, generalised) instead of a third one.
- **Contract, round 2**: moderate and light only, so the review stops. The fields and the road hold were checked by
  hand against the contract and meet it. Fixed: the buildings' logic moved out of the page into a pure, tested module
  (`src/render/lit/houses.ts`: `standing`, `bridged`, `triangulate`, `ccw`): a building stands where at least half
  the cells under it are its own (one cell lost on a shared wall or a curve's sliver no longer hides a house); a
  courtyard is bridged into the outline, so the roof leaves it open and its walls stand, and a burnt house alone is
  roofless; a footprint is triangulated once for its roof and its shadow. Left: the road's field re-derives apply's
  line rule (the per-cell hold keeps the contract wherever the two differ; building it from apply's `nearLine` would
  make them one), the worker's memory for the cells' fields, and a shared exact distance transform.
