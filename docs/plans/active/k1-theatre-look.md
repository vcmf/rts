---
status: active
last_reviewed: 2026-10-29
---

# Plan: K1, the 1805 theatre in the lit style (a prototype)

Track K, on `epic/campaign` (`docs/plans/active/track-k.md`). The look: `docs/proposals/campaign-map.md`.

## Problem

The owner asks whether a campaign map of Europe can look like the shaded relief prints in `design/campaign/refs/`,
in the style of the battle map's lit view. Before any game code, one experiment: the 1805 theatre, from Strasbourg to
Austerlitz, drawn from real heights, with its rivers, towns and roads, judged by eye.

## Scope

- `prototypes/campaign-1805.data.js` (committed, written by hand): the theatre's frame (its centre and extent), about
  70 towns (name, position, size) and about 120 roads between them (high road or country road), and the region names.
  The towns' positions are their modern ones; the roads are the period's main routes as far as known, a sketch for
  the look, not a traced network (K4).
- `tools/campaign-theatre.ts`: reads the data file and writes scratch/campaign-1805.js (git-ignored, never
  committed):
  - the heights on a 250 m grid in a Lambert azimuthal equal-area projection centred on the theatre, from the AWS
    terrain tiles (Terrarium PNGs; SRTM, GMTED2010 and EU-DEM; their attribution shown on the page), cached under
    `scratch/`;
  - the rivers and lakes of Natural Earth (public domain; its 10 m rivers with the European supplement, and lakes),
    clipped and projected;
  - each road routed over the heights: the cheapest path on a 1 km grid, slope costing more than distance, so a road
    follows the valleys as real ones do, then smoothed.
- `prototypes/campaign-map.html`: loads both files and draws the theatre:
  - the relief baked at load from the heights (the battle map's bake: the slope's light, a cast shadow from the
    north-west, the exposure), heights exaggerated for the light (`?rz=`), the sun's height (`?sun=`);
  - the parchment paper and its grain, the relief in the paper's hues, lakes as a sunk wash;
  - the ink on a canvas above: rivers widening downstream, roads in red ink (country roads dashed), towns as blocks
    sized by importance, names in serif small caps, regions letter-spaced across the map; what is shown thins out
    as the camera pulls back;
  - the plate: the map's edge with a thin worn border, a soft shadow on a darker paper beyond;
  - the camera tilted 20° off straight down (decision 0055), pan by drag, zoom by the wheel toward the cursor;
  - `window.__bakeMs`, `window.__readyMs`, `window.__proto` for the tools.

Out of scope: armies, orders and turns (K2); the offline bake (K3); a checked data format (K4); Europe (K7).

## Acceptance

- `node tools/campaign-theatre.ts` writes the file; heights plausible (the Danube at Vienna about 160 m, the Alps
  above 3,000 m).
- The page renders with no console error (`tools/shot.mjs`), screenshots at the theatre zoom and closer (the Danube
  at Ulm, Vienna and Austerlitz), on test machine A's GPU (Windows Chrome over CDP).
- The bake and the frame measured on test machine A.
- The owner's verdict on the look against `design/campaign/refs/`.

## Results

- `node tools/campaign-theatre.ts`: 187 terrain tiles, 84 river lines, 22 lakes, 111 roads routed; 3201 × 2001 nodes
  at 250 m, heights 53 to 4,033 m; 7.8 s with an empty cache, 4.4 s from it. Spot heights against the real ones:
  Vienna 189 m, Ulm 481 m, Munich 525 m, the Pratzen 314 m (324 m); peaks are softened by the grid (the
  Grossglockner 3,562 m against 3,798 m). St. Pölten to Vienna by the routed road: 58 km (about 60 km today); Stockach
  to Bregenz goes round Lake Constance, 70 km. The tool's pure parts (`tools/campaign-theatre-lib.ts`: the projection,
  the grid, the router) are tested in `test/campaign-theatre.test.ts`; it reuses the heap and the simplification of
  `tools/streams.ts`, the PNG reader of `tools/png.mjs` and the ring helpers of `src/map/geometry.ts`. The Terrarium
  decoding (red · 256 + green + blue / 256 − 32768) is checked only by the spot heights below.
- The look, settled by eye on the first rounds: the battle map's exaggeration and its hard shading floor crumpled
  every hill at this scale (×8 read as crushed paper, the shade a muddy olive). Now: heights ×3 for the light, the
  slope light from heights smoothed over about 750 m, a soft knee toward the darkest and lightest tones (0.76 and
  1.08 of the paper) instead of a clamp, a cooler shade, a paler parchment (`#e6d8b4`). `?rz=`, `?sun=`, `?floor=`,
  `?top=` to try others. Then, after the owner's first look (2026-10-29: "sun higher and shadow deeper and brighter lit
  slopes"): the sun at 38°, the tones 0.68 to 1.16 of the paper, the cast shadow down to 0.7. Second look (2026-10-29: "less relief exaggeration … more white … the shadow must look more
  contrasted (darker) … contour line will make it more cool"): heights ×2, the slope light from heights smoothed over
  about 1.25 km (`?smooth=`), a warm off-white paper (`#eeeadf`), tones 0.55 to 1.16, the cast shadow down to 0.6, and
  contours every 200 m with an index line every 1,000 m (`?contour=`), drawn from heights smoothed over about 1.75 km
  in a half-float texture (8 bits drew them in 16 m stairs), each fading where its lines crowd on screen. How to
  simplify further: `docs/research/relief-generalization.md`. Third look (2026-10-29: "give contour a darker color and water ocean blue, and shadows of mountain …
  darker (near black, warm black)"): the shade runs from the paper to a warm black ink (`#2a2119`, `?dark=` how far,
  0.88), contours in a dark warm brown, faded sooner where they crowd, lakes and rivers an ocean blue (`#3b78b0`).
  Darker than the battle map's readability bound (#141: the darkest about 0.6 of the paper): to check once the
  armies are on it (K2). Fourth look (the owner's grey contour reference: "u have dark shadow, but u also have light, like near
  true white"): flat ground a mid tone (0.86 of the paper, `?base=`), so the lit slopes rise to near white (`#fdfcf8`)
  above it and the shade falls to the warm black below; illuminated contours (Tanaka): a line near white where its
  slope faces the light, dark where it faces away. The page draws the print every frame again: drawing only on a
  change left an empty frame in a visible Chrome (its shader compiles in the background); the ink is still redrawn
  only on a change. Fifth look (the owner: "contour line must not have 'light' part … put close height to same bracket … low
  become flat"): contours in dark ink only; the light reads terraced heights: the contour field snapped down to its
  200 m band (`?terrace=`, 0 off), each step softened over a cell either side, 0.3 of the smoothed real relief mixed
  back (`?detail=`). Low ground goes flat and the relief reads as stacked layers, their banks on the contour lines. Sixth look (the owner: the terraces "too soft … must be less than the contour so the contour lines not
  align with the slopes all the time … too grey, make the map lighter, whiter … only see the shadow texture at zoom
  from a certain threshold"): terraces of half the contour interval (100 m) from heights smoothed over one cell, the
  real relief smoothed over one cell; flat ground 0.96 of a whiter paper (`#f4f1e8`), lit slopes to pure white; the
  shade's strength 0.45 over the whole theatre, rising to full from about 3 px a km (`?far=`). Seventh (the owner: "exaggerate, just like in total war campaign map, the mountains are big and
  representative"): the relief's shape at about 6 km kept whole and its smaller detail halved (`?fine=`, the
  research note's band smoothing in its simplest form), then heights above the lowlands lifted up to three times
  where the wider region (about 12 km) stands from 500 to 1,600 m (`?mount=`): the plains stay flat, the ranges rise
  as masses with long shadows. Eighth (the owner: "yes try that and makes mountains even bigger"): the map raised in 3D, a
  mesh with a vertex about every km, displaced in the vertex shader by the representative heights lifted ×4
  (`?mount=`), 1.5 km of map a km of them (`?rise=`), smoothed over 2 cells, flat over the last 12 km to the plate's
  edge; the ink projected at the same height, so roads and rivers drape over the ranges; the camera kept above the
  ground. The light reads a milder lift (×1.5, `?mountlight=`): lifted as much, the cast shadows swallowed the
  valleys. Ink behind a raised range still shows through it, and picking still reads the flat plane (K3). A frame,
  GPU waited for, at 1600 × 900 on test machine A: 0.9 ms still, 7.3 ms with the ink redrawn. Ninth (after `docs/research/epic-campaign-maps.md`; the owner: "it doesn't look epic enough … at close
  zoom i want crisp details"): the slope light computed per pixel from the light's heights read bicubically (half
  floats), so it stays sharp at any zoom; two windows of finer heights (50 m, Terrarium zoom 11: Ulm, 140 × 100 km,
  and Vienna–Austerlitz, 160 × 130 km), written beside the theatre and loaded after the first frame, add their detail
  to the light from about 6 px a km and to the contours from about 3; the contour sheets drawn per pixel every 100 m
  (`?sheet=`), a lit rim toward the light and a shadow under the sheet above, from about 2 px a km; the cast shadow
  thrown by the large forms only; faint cloud shadows drifting from the west (`?clouds=`); the camera tilting from
  20° far out to 40° at the closest zoom (`?tilt=`), with a haze toward the top of the view (the top edge stays about
  54° off straight down: no sky); the plate 8 km thick, its sides lit from the north-west, its shadow on the table.
  Measured on test machine A, 1600 × 900: a frame 1.8 ms still, 6.5 ms with the ink. Up close, the 1 km mesh shows
  its facets on the alpine skyline (a finer mesh near the camera: K3). Then the owner: "there's black points a lot on the map now". The cause, a bug in the page's half-float
  conversion: a mantissa rounding up to 1,024 was or-ed into the exponent instead of added, so a height just under a
  power of two (511.9 m) was stored as half of it (256 m): a sharp pit, lit per pixel as a black dot (the bake had
  hidden it). Fixed (added; the round trip now within 2 m to 5,000 m), with: single-node spikes in the heights
  clamped to their neighbours (3,335 above and 476 below them by 15 m or more); the contours and sheets read the real
  heights only from about 10 px a km, the contours far out only the index lines, fainter; the plate's hidden top face
  in paper, not black (it showed as specks along the edge); the clouds at two crossed scales, larger. Then (the owner, on the Inn valley: "too soft … the sampling basically create some kind of contour lines
  which make the contour lines with bizarre shadow"): one sheet per contour line (they were 100 m against 200 m
  contours, so every other step was a lit rim and a shadow with no line); up close, the light gets back the real
  relief's detail the simplification removed (0.6 of it, `?crisp=`, from about 3 px a km) and the finer windows'
  detail, both lit at their true slope (with the ×2 exaggeration and the mountain lift they turned the Alps black and
  white); a third window of 50 m heights over the Inn valley (Innsbruck, 160 × 100 km); the sheets' shadow lighter. Then (the owner: "we still have some shadows casted from the contour lines, not good … even at crisp=1
  at low zoom it still looks soft"): the sheets off by default (`?sheet=200` to compare): their rim and shadow read as
  shadows cast by the lines; the light's heights read by Catmull-Rom (through the data; the cubic B-spline blurred
  them by about half a cell); the real detail at 0.8 from under 1 px a km (full from 3), the 50 m windows from 2 px a
  km (full from 6). A frame on test machine A at 1600 × 900: 3.2 ms still, 10.3 ms with the ink. Then (the owner: "strange pattern and artifacts", in the Alps by Salzburg): the light's heights are lifted
  to about 10 km, where a half float steps every 8 m, and the per-pixel light drew the steps as rows of dots: the
  height textures are 32-bit floats where the GPU filters them (half floats otherwise); the textures the Catmull-Rom
  read takes at texel centres sampled nearest (the bilinear filter rounded the coordinates and mixed in a neighbour:
  specks on steep slopes); the baked cast shadow read by a cubic B-spline (bilinear, its edges stepped along the
  250 m grid). Still seen up close: the 1 km mesh's facets on the alpine skyline (K3). A frame at 1600 × 900: 2.8 ms
  still, 9.9 ms with the ink. Then (the owner: "somewhere there's still this carreaux effect"): every smoothing at load (the large
  forms, the mountain lift's region, the cast shadow's forms, the exposure, the contour field, the displacement) a
  box mean, whose square, grid-aligned edges showed in the light: now three box means of a third of the width, which
  approach a Gaussian. The bake at load went from 1.5 to 3.2 s on test machine A (an offline bake, K3). Then the owner's Valdez print ("make the map white cold, the light warm yellow, and the contour line a big
  orange brown"): a cold white paper (`#eceef1`) and table, lit slopes a pale warm yellow (`#fff1d6`) turning orange
  (`#f2a35e`) on the brightest faces, a cool grey-violet shade (`#4a4656`, 0.78 of the way), contours in orange-brown
  (`#a4542a`). And (the owner's grey relief model: "make the mountain steeper, exaggerate more its height, and look at
  the map from an angle"): the 3D rise doubled (`?rise=3`), its shape smoothed over one cell instead of two, the camera
  tilted 30° far out to 52° at the closest zoom (the top edge of the view about 66° off straight down: still no sky). Then (the owner: "tallest and tiltest … only some contour lines … thicker and orange-dark, the others a more
  muted grey … make the light texture noisy"): the tilt up close at 60°; the rise tried at 8, which broke the ranges
  into shards and stretched the 1 km mesh into sheets, so 4 (`?rise=` up to 8), its shape smoothed over three cells;
  index contours (every 1,000 m) thicker in dark orange (`#93421c`), the others thin muted grey (`#8b8a92`); a grain
  on the slopes (`?grain=`, 0.2): smooth noise streaked downhill, cells about 300 m across and 2 km down the slope, on
  the final colour (before the tone knee it vanished), its level of detail set by hand (the streak frame turns with
  the slope from pixel to pixel, and the automatic level read the flat top mip). Lakes are a mask at twice the heights' resolution (125 m), for smoother shores.
- At the theatre's zoom it reads as a relief print: the Alps, the Bohemian ranges, the Black Forest and the Jura
  stand off the plains, and the plains carry the rivers, lakes, roads and towns. Closer (the Danube at Ulm, about
  20 km across the screen) the Swabian Jura and the moraines south of the Danube read well. In the Alps up close the cast
  shadow filled most valleys at a 28° sun; at 38° the ridges and valleys read.
- Natural Earth's rivers and lakes are generalised: the Danube line sits up to a few km off its valley in the relief
  at the closest zoom, and Lake Constance's eastern shore is cut short of Bregenz. K4 traces the water (or uses
  HydroRIVERS).
- Measured on test machine A's GPU (RTX 3080, Windows Chrome, D3D11, over CDP, headless): the bake at load 0.78–0.79 s
  (relief and lakes, main thread; a canvas blur on the lake mask had cost 1.8 s of the first 2.6 s), the page ready in
  1.3–1.4 s (the 17 MB theatre file included). A frame, GPU waited for, after review round 3 (mipmapped textures): at
  1600 × 900, 1.8 ms still, 6.0 ms with the ink redrawn (as while panning); at 3840 × 2160 (device ratio 1), 2.7 ms
  still, 6.5 ms with the ink. The page draws only when the view changes. The ink (rivers and labels on a 2D canvas) is
  the cost; it moves to the GPU with K3.

### The rebuild (2026-10-29)

The owner, on the last tuned look: "huhu it looks weak for us". The causes, not the tuning: the 3D shape and the light
read different heights (lifted ×4 and ×1.5, the detail added to one only), so light and form did not match; the 1 km
mesh stretched into shards at that height and tilt; the grain was a pattern, not detail; the lines floated on a 2D
layer over the 3D view. Rebuilt on one principle, as the references are made (a model lit once, as a photograph):

- **One shape** (`buildShape`): the real heights, their large forms (about 6 km) whole and the rest at 0.75
  (`?fine=`), mountain regions lifted up to ×2 (`?mount=`), all raised ×2.5 (`?vert=`), flat over the last 12 km to
  the plate's edge. The surface is displaced by it and the light is computed from it.
- **A mesh at 500 m** (a vertex every two cells, 1.6 million), wound for Babylon's left-handed culling.
- **Light like a render**: a warm sun 28° high from the north-west (`?sun=`, `?az=`) and a cool sky light (`?sky=`,
  0.62 of the light), the sky dimmed by **ambient occlusion** and the sun by **soft shadows**, both baked from the shape
  at load on a 500 m grid (`bakeLight`): the shadow by a ray toward a sun disc 2.5° across (`?soft=`), its penumbra
  widening with the distance to the ridge; the occlusion from the horizon in eight directions within about 9 km. A
  slight fall-off of the light across the map from the sun's side (`?lamp=`). No grain, no tone curve tricks: the
  print (paper, contours, lakes, rivers, roads) is multiplied by the light.
- **Lines on the ground**: rivers and roads printed on the raised paper from about 3 px a km (2D ink further out), so
  they follow the relief and hide behind ridges; stored as offset fields (the vector to the nearest point of a line,
  linear, so a bilinear read gives the exact distance; a blurred line, then a distance, broke into dots).
- **The camera** 30° far out to 45° at the closest zoom (`?tilt=`).

Measured on test machine A: the bake 4.9–5.1 s at load (the light's rays and the line fields; K3 moves it offline),
ready in about 6 s; a frame at 1600 × 900 2.3 ms still, 3.8 ms with the ink. Then (the owner: "it looks awesome, though we don't have the warm yellow-orange light source anymore … at the top
right", the Valdez print): the sun from the north-east (55°), 20° high, a warm orange (1.3, 0.98, 0.66); the lamp's
fall-off 0.55, the sun warmer still on its side of the map and cooler on the far side. Then (the owner: "contour line … lighter orange … time to do water", a stepped Black Sea model and a blue
bathymetric relief): index contours a lighter orange (`#d08450`), the others a lighter grey; the lakes part of the
one shape before the light: sunk 70 m (of the raised shape) below the shore, then stepped every 0.7 km from it
(`?stepkm=`), six steps of 45 m (`?steps=`), each bank a crisp edge per pixel, the colour from a pale shallow blue
(`#a9d0ec`) to a deep blue (`#2b67b0`) by depth. The depth comes from the distance to the shore (a chamfer distance,
blurred), as no lake bathymetry is loaded; the sun, its shadows and the sky's occlusion fall on the basins as on the
land. The bake rose to about 5.4 s.

### Performance (2026-10-29)

The owner: "150 fps at 1080p and also for high resolution … the current upscaling … show me fps". Then:
- **The 50 m windows' seam** (sharp inside, soft outside): their detail now fades over 20 km into the coarse ground
  instead of 4.
- **The light's slope:** up close one Catmull-Rom pass with its derivative (16 reads) instead of four (64); further
  out, where a cell is under a pixel, four bilinear reads across the pixel, which also average what it covers.
- **Rivers and roads on the GPU at every zoom** (no 2D strokes), and the 2D ink projects only the named rivers it
  can label, every other point: projecting every river cost about 2 ms of the 3 ms ink while panning at 1080p.
- **FSR 1 on high-resolution screens** (decisions 0045, 0059; Babylon's `FSR1RenderingPipeline`, EASU then RCAS):
  when the canvas holds more than about 1080p's pixels, the map renders at a scale back to about that many
  (×1.87 at 3840 × 2160). `?upscale=off` or a factor.
- **An fps meter** at the top centre, as the staff map's (`?fps=0` hides it): the frame rate over half a second, the
  CPU time of a frame, the upscale factor.

Measured on test machine A (RTX 3080, D3D11, headless over CDP; frames waited for with a pixel read), still / with
the ink redrawn (panning), the theatre's view and the Inn valley close up:

| Screen | Theatre | Inn valley |
|---|---|---|
| 1920 × 1080, before | 2.98 / 9.73 ms | 1.42 / 3.58 ms |
| 1920 × 1080, after | 3.01 / 3.45 ms (290 fps panning) | 1.03 / 1.84 ms |
| 3840 × 2160, before | 5.69 / 12.77 ms | 3.79 / 6.07 ms |
| 3840 × 2160, after (FSR ×1.87) | 2.74 / 4.20 ms (238 fps) | 1.60 / 2.39 ms |

The 150 fps target at 1080p is met with room. The fps meter in a headless browser reads low (throttled frames); in a
visible window it is capped by the display.

### The tiles' proof of concept (2026-10-29)

The owner: "do 1 + 2 as a proof of concept, if it works we consider the prototype done". The close zoom was soft:
250 m heights outside three 50 m windows, the light baked at 500 m, seams at the windows' edges. Now:

- `tools/campaign-tiles.ts` bakes the theatre offline at **100 m** (the terrain tiles at zoom 10, 8001 × 5001 nodes):
  the one shape and the lakes as the page builds them, and the sun's soft shadow and the sky's occlusion **at full
  resolution**, on all cores; cut into 640 tiles of 256 × 256 nodes under scratch/campaign-tiles/ (216 MB, git-ignored),
  with a meta file the page checks the parameters against. The bake: 62 s on the dev machine (i7-9700K, 8 cores),
  26 s of it fetching and sampling the heights.
- The shared parts: `tools/terrarium.ts` (the terrain tiles, from the theatre tool) and `tools/campaign-bake.ts`
  (the shape, the lakes' distance, the light; tested in `test/campaign-bake.test.ts`), a TypeScript copy of the page's
  steps, which the page still runs at load on its 250 m grid.
- The page keeps its 250 m bake for the far zoom; from about 4 px a km it streams the tiles around the camera into a
  **detail area** of 12 × 12 tiles (307 km), its texel a 100 m node: the light's slope from the 100 m shape (one
  Catmull-Rom pass), the baked shadow and sky from the tiles, faded over 8 km to the area's edge and where a tile has
  not loaded. The area moves when the camera's target goes more than two tiles from where it should start; tiles are
  cached (320). The three 50 m windows are gone: the detail is the same everywhere, with no seams.
- The fps meter shows the tiles cached.

Measured on test machine A (still / with the ink redrawn): 1920 × 1080, the theatre 2.5 / 3.6 ms, close in the Inn
valley with 144 tiles 2.2 / 2.0 ms, at Ulm 1.4 / 1.9 ms; 3840 × 2160 (FSR ×1.87) 3.2 / 4.7, 2.1 / 2.6, 2.3 / 2.5 ms.

What the proof of concept leaves (for the main series): moving the area refills it and uploads about 75 MB (a hitch
of some tens of ms every 50 km of panning up close: sub-rectangle uploads, a ring buffer); the 3D mesh still has a
vertex every 500 m (faceted ridgelines up close: a mesh whose density follows the camera); the 250 m bake still runs
at load (about 5 s: bake it offline too, as tiles at coarser levels); the page and the tool hold the same bake twice
(one module once in the game's code); the tiles are 216 MB of base64 scripts (binary tiles, compressed, in the main
series).

## Review rounds

- **Round 1** (`/code-review high`): severe: every lake was simplified to two points (a closed ring's chord has no
  length), so no lake was drawn or closed to the roads; picking scaled CSS pixels twice on screens above a device
  ratio of 1 (Babylon scales them itself), so panning, zooming to the cursor and the zoom thresholds were wrong there.
  Fixed, with: the textures mapped node to texel centre and a cell that does not divide the frame refused; the tool
  in TypeScript, its pure parts tested, the heap and the hairpin-safe simplification reused from `tools/streams.ts`;
  towns and regions projected once by the tool (no second projection in the page); river and road lines projected
  once a redraw; a faster base64 decode; lines within 120 columns.

- **Round 2**: severe: up close (the camera under about 80 km in mid-map), the frame's south corners fell behind the
  camera and the perspective divide flipped them, so the ink's clip lay off the screen and every line vanished; lines
  crossing behind the camera would have streaked across it. Fixed: lines and the frame are cut at the camera plane
  before the divide. With: the router refuses a diagonal step past a closed (lake) cell, skips stale heap entries and
  names the road it cannot route; the PNG decoder, `inRing` and `lineLength` reused from `tools/png.mjs` and
  `src/map/geometry.ts`; the cell limited to 200–2,000 m (finer passes the page's texture and canvas limits); the URL
  values clamped (a 0 kept, the shading's knee never divided by zero); a drag ended by a cancelled pointer too.
  The closest zoom (about 25 km) shows the limit of the 250 m grid: the relief goes soft below about 60 km (K3).

- **Round 3**: no severe issue; fixed: a theatre file older than the data file says so instead of throwing every
  frame; the lake mask falls back to one texel a cell where the GPU's textures are smaller; the italic face awaited
  for the river names; the relief and lake textures mipmapped; the page draws only when the view changes. Left open
  (below): the drawn road against the lake shores, the strokes batched, the near-plane cut tested as a pure function,
  the lakes closed by rows. Review stops here (`AGENTS.md`, Workflow).

## Open questions

- The region names sometimes sit under a city's name; their placement joins the label collision in K3.
- A road is routed out of the lakes, but simplified within 400 m and smoothed after: along a shore it can cross the
  lake's wash by a little. K4's roads are traced, not routed.
- The ink's cost while panning: roads and rivers stroked per line (batched by style, or drawn on the GPU in K3).
- The near-plane cut (`screenLine`, `frameOnScreen`) lives in the single-file page with no test; it moves into a
  tested module when the map comes into the game's code (K5).
- The router closes lake cells point by point; `ringRow` of `src/map/geometry.ts` does it by rows, needed at
  Europe's scale (K7).
