---
status: current
last_reviewed: 2026-10-13
code: [app/look.html, src/look/main.ts, src/look/spec.ts, src/look/heightfield.ts, src/look/world/author.ts, src/look/world/data.ts, data/painted-world.lookdata, tools/build-look-data.ts, tools/look-check.js, test/look-spec.test.ts, src/look/noise.ts, src/look/river.ts, src/look/grain.ts, src/look/materials.ts, src/look/terrain.ts, src/look/water.ts, src/look/nature.ts, src/look/bakes.ts, src/look/post.ts, src/look/shaders/, tools/golden.mjs, tools/check-negatives.mjs, src/look/bench.ts, src/look/gputimer.ts, src/look/lab.ts, tools/bench-look.mjs, tools/guard.mjs, tools/look-page.mjs, tools/detail-check.mjs, src/look/span-texture.ts, src/look/world/water-data.ts, tools/water-check.mjs, test/water-data.test.ts, tools/water-look-check.mjs, src/look/world/cover.ts, src/look/macro.ts, tools/macro-check.mjs, test/cover.test.ts, src/look/meadow.ts, src/look/meadow-spec.ts, data/meadow-grass.json, src/look/canopy.ts, src/look/leaves.ts, data/leaf-clumps-oak-v1.png]
decisions: [0001-painterly-look-in-materials, 0002-top-down-camera-no-sky, 0003-no-blur-in-gameplay, 0010-locked-camera-staff-map, 0011-scale-and-min-spec, 0012-heightfield-authority, 0016-typescript-toolchain, 0022-soft-ramp-for-foliage, 0026-crops-under-a-soldiers-chest]
---

# The look page (Track E, L0)

The painted world in the game's toolchain: terrain, river, nature, baked static light and the finishing
passes, drawn by Babylon 9.29.0 from npm on the look page (app/look.html, `npm run dev`, then `/app/look.html`).
It began as a pixel-identical port of `prototypes/painted-cinematic.html` (L0c); L0a then gave it a checked
world spec and a heightfield built offline. The prototype stays as the reference until L9
(`docs/plans/active/track-e-look.md`).

## Goals / non-goals

- **Goal:** a renderer the later look phases (L2 on) build on, test and measure.
- **Non-goals for now:** the sim's units (stage 2 of Track E), the sim's own map and heightfield
  (logic track), our own camera controller (prototype exit).

## Constraints

- Render-side code: any maths is allowed; the sim's determinism rules (decision 0006) do not apply here.
- **Creation order is draw order.** Babylon draws opaque meshes in the order they were made, so
  `src/look/main.ts` builds in the prototype's order: ground, far ring, apron, water, nature, then bakes,
  camera and passes. Reordering changes pixels and shows in the goldens.
- **Deep imports register only what they import.** The CDN build registers every shader include and
  post-process shader; the modules do not. A missing one leaves a material or pass forever "not ready"
  with no error. The instancing includes (`src/look/nature.ts`) must be imported. The post-process vertex
  shader is imported up front too (`src/look/post.ts`): Babylon loads it lazily, but in the built page that
  load never completed (observed in L0c).

## Design

| Module | What |
|---|---|
| `src/look/spec.ts` | The world SPEC: sizes declared once, the rest derived (cells, the apron band, the camera footprint, the shader macros), and the invariants checked on derive: grids meet exactly, the tile holds play ⊕ margin, the far ring holds every view, no frame corner near the horizon, yaw ≤ ±45°, bakes at their texel targets and within min-spec. The shadow map is sized from its fitted box at the texel target |
| `src/look/world/author.ts` | The authoring formulas (`baseH`, the meander's generation, the trough and the carve). Run in Node by the build tool; the page uses them only for checks |
| `tools/build-look-data.ts` | Builds `data/painted-world.lookdata`: the heightfield (tile plus `aoMargin`), the far ring's nodes, the river's samples, the bank normals (W2), the water data (W3, `src/look/world/water-data.ts`) and the cover (L5a, below) (`--check` compares) |
| `src/look/world/data.ts` | The look data's binary format (version 5): arrays, span grids (a grid's covered texels only) for the bank normals and the water data, and the cover's runs |
| `src/look/world/cover.ts` | The ground's cover (L5a, below): authored, rasterised to a grid, run-length coded |
| `src/look/macro.ts` | The cover's texture, the macro colour's bake and its arms (L5a, below) |
| `src/look/heightfield.ts` | `heightAt` on the heightfield with CreateGround's own triangle split; `groundAt` adds the far ring's nodes beyond the tile; `H` is `groundAt` |
| `src/look/river.ts` | The meander at run time (`docs/systems/river.md`): the shipped samples, a bucket grid, `riverQuery`, `bandOf` |
| `src/look/grain.ts` | The procedural paint grain (R fine, G blotches, B streaks), a dropped PNG's luminance, the seam check's smooth grain, the R channel's mean |
| `src/look/materials.ts` | Panel state `S`, sun and palette, and the material factory that inlines `shaders/painter.glsl` at `#include<painter>`, the water data's reads (`#include<waterdata>`) and the shore band with the bank normals (`#include<shore>`, W4), which includes the macro colour (`#include<macro>`, L5a) |
| `src/look/terrain.ts` | Tile (1.79 m), far ring (14.3 m) and the apron that stitches them; the far ring's painted river mask; the bank normals' texture (W2, `docs/systems/river.md`; both it and the water data's, W3, from `src/look/span-texture.ts`). Their materials define `DETAIL` (the detail layer, below; on WebGL1 the material factory adds `DETAIL_L0`); the tile's also `BANKN` and `WATERDATA` (the shore band, W4), as do the water's |
| `src/look/water.ts` | The water ribbon, its materials (the painted water, W4, `docs/systems/river.md`; and the same shader on the tile's ground, for the seam check) and the tree-reflection mask |
| `src/look/nature.ts` | Role-painted nature pack models, thin instances, and the scatter with its placement rule (and, since L5a, the cover's: what grows on which class) |
| `src/look/bakes.ts` | Sun shadow depth (once; the card crowns cast through their cards), occlusion and valley mask (CPU, once: the terrain's ring test times the sky each crown and bush hides, `skyOcclusion()`), the top-down light map (once; its shadow edge grows with the distance to the caster): R sun visibility, G occlusion, B valley mask, A the contact under each tree's crown, which only the ground reads (`docs/plans/done/shadow-look.md`, `docs/plans/done/soft-shadows.md`) |
| `src/look/meadow.ts` | The meadow near the camera (L5c, L5d, below): the meadow map (ground height, the grass's and the crops' growth), three rings of static grass and crop instances around the focus |
| `src/look/canopy.ts`, `src/look/leaves.ts` | The leaf-card crowns (`?trees=cards`, L7a, L7b, below): the card meshes from each pack crown's triangles with the crown's ellipsoid, their material; the leaf-clump atlas (value, coverage, each leaf's tilt) from a picture or drawn |
| `src/look/post.ts` | The RTS camera, locked to the SPEC (yaw ± 45° around the default, decision 0010; frames wider than the checked 16:9 keep its horizontal field of view), and the passes: depth of field (presentation only, decision 0003), the fused grade |
| `src/look/main.ts` | Loads the look data, checks the ground against the SPEC, builds everything in order, the panel, the frame loop, and the debug globals the checks read |
| `src/look/bench.ts`, `src/look/gputimer.ts` | `?bench`: fixed cameras, frame times, GPU time per pass, draw calls, triangles, texture memory and the build hash, as JSON (below) |
| `src/look/lab.ts` | Test objects the tools add: the readability guard's army blocks, the detail check's test hill |

Shaders are files in `src/look/shaders/`, imported as text (`?raw`). Materials made after the bakes (the
guard's blocks) get the bakes' textures through `Materials.bindAll`. The page exposes
`window.__proto = { S, scene, camera, buildPost, play }` and accepts `?frozen` (the clock stays at 0),
the contract of `tools/golden.mjs`; it also puts the prototype's global names on `window`
(`RIVER`, `H`, `groups`, `SMW`, …) so `tools/render-check.js` and `tools/river-check.js` run unchanged, and
`window.__look` for the look tools: `lab`, `mats`, `passes`, and the detail layer's switches (`setDetail`, the
terrain's variant defines; `grain`, the paint or the smooth grain; `terrainOnly`; `finishing`, the finishing
passes on or off; `hill`; `quarter` and `shift`, the projection moved for the checks). `?season=<0..3>` opens the
page in a season (the bench runs in it); `?detail=l0` opens it with the L0 grain on the terrain;
`?macro=flat|shader|bake|strokes|kuwahara` picks the macro colour's arm (L5a and L5b, below; `bake` by default,
`shader` on WebGL1) and `?bench=macro` benches the three whose shaders differ (`flat`, `shader`, `bake`: the experimental arms
draw with the bake's shader and differ in their bakes, measured by the macro check); `?trees=one` draws every tree as one broadleaf model, and `?trees=one,cards` as leaf cards (L5b's
judging).

### The ground's cover and macro colour (L5a)

The plan: `docs/plans/active/l5-macro.md`; the design: `docs/proposals/prepainted-terrain.md`.

- **The cover** (`src/look/world/cover.ts`, authored in Node until the map format's world compiler writes the
  same grid, `docs/proposals/map-format.md`): strip fields on the valley sides and beyond the play area (wheat,
  green crop, stubble, ploughed; each with an id and a furrow direction), meadow and pasture, a road along the
  valley's east side, a track toward the hill, village ground beside the road. Nothing but meadow on the
  floodplain (art bible §6c) or in the formation zones. Rasterised to a grid of `SPEC.macro.cover` m cells (2 m)
  over the far ring, 4 bytes a cell: the class, the field's id, the furrow direction, the distance to the
  nearest road, track or village (the wear's). The class `wood` is in the format but not authored: a floor over a
  copse's whole spread darkened open ground between its few trees, and the light map's occlusion already darkens
  the ground under each crown.
- **The macro colour** (`src/look/shaders/macro.glsl`, `macro(xz, q, px)`): class colours from the palette (the
  meadow is the old `groundMeadow`), a low-frequency variation, each field's own shade, stripes along its furrows
  (ridge-and-furrow lands on ploughed ground, faint drill bands on crops, faded with the pixel's footprint), wear
  near the lines, and edges that wander (the class lookup's point pushed ±1.5 m by the grain's blotches). Colour
  only: the light stays in `paint()`. Every read passes the world position's screen derivatives explicitly
  (`macroDerivs` in `shore.glsl`, taken at the top of each shader's main; `textureGrad` on WebGL2; the meadow's
  reads too): a read in a branch the pixels of
  a quad take differently has undefined derivatives, and on the Mac's GPU the bake then differed run to run.
- **Three arms, one switch** (`?macro`): `flat`, each class's colour alone, unwarped (the ablation's arm 1);
  `shader`, `macro(xz, 0)` per pixel, one tap; `bake`, one read of the bake. `groundAt()` gives the arm's colour
  to the terrain, the far ring and the shore band alike (so the seam holds), and `snowLie()` the snow's lie.
- **The bake** (`src/look/macro.ts`): `macro(xz, 1)` (9 taps of the grid a metre apart: soft edges and a darker
  headland where classes meet) drawn by an `EffectRenderer` into RGBA8 render targets, 512² texels a draw, then
  mipmapped (on WebGL1, which cannot mipmap their sides, read bilinear without mips): the tile at 0.5 m (1600²) and
  the far ring at 4 m (650²), 15 MB with mips. A restored context bakes again. RGB the colour, A the
  snow's lie. The tile's bake hands over to the far ring's over the tile's last 60 m. It reads the grain, so a new
  grain rebakes it (`Materials.onGrain`). `?macroBench=<side>` bakes a side² target (the full-size run).
- **The fields in winter:** the furrows hold the snow and the ridges show the earth (the winter master's stripes):
  `pSnowLie` moves `snowAt()`'s threshold. There the snow's edge breaks on the grain's soft blotches, not its
  per-texel noise, over a wider band, and the lie fades out as a pixel spans 0.35 to 1.2 m.
- **The scatter follows the cover:** grass, flowers, plants, bushes, stumps and logs on grass; wheat on wheat;
  nothing on roads, tracks or village ground; the point and eight points 2.5 m around it must all pass (the painted
  edges wander that far). **Ground bounce:** trees take 15% of the ground's colour under their root into the albedo
  of their side away from the sun, near the ground; grass 25% all over. The colour is the class's flat colour in
  every arm (one read; the arms differ in the ground alone).
- **Two experimental arms (L5b)**, bakes of their own, read as the bake is (the materials' `MACRO_BAKE`); switching
  to one rebakes. `strokes` (arm 4, `MACRO_STROKES` in the bake's shader alone): strokes of the macro colour laid
  over it, one a 2 m cell, along the furrows on fields and a slow flow elsewhere, 1.6–2.8 m long, their value and
  temperature jittered; a gather over the 3×3 neighbouring cells per texel, laid over in a hashed order, no per-stroke
  draws; on the tile only (a
  2 m stroke is under a far-ring texel). `kuwahara` (arm 5): the arm-3 bake into a scratch target, then a
  four-quadrant Kuwahara filter (`SPEC.macro.kuwahara`, 2 m; a texel on the far ring) into the bake's target before
  its mips; the alpha (the snow's lie) stays the texel's own, so the seam holds.
- The bakes run one at a time, in the order asked (a new grain, a restored context, an arm, a check), each with the
  arm and checks wanted when it starts.
- `window.__look.macro`: `setArm` (a promise: a baked arm other than the one baked rebakes), `setCheck` (the check's
  view and sabotages, rebaked), `hash`, `bake`.

### The detail layer (L2b)

In `paint()` (`src/look/shaders/painter.glsl`), for materials that define `DETAIL` (the terrain's, and the water's since W4: the shore band paints with it): the paint
grain at a constant size on screen (`docs/plans/active/l2-detail.md`).
- **Projection:** biplanar (the two planes most facing the normal; on gentle ground only the ground plane is
  read). Near the cube's diagonals (55° slopes facing between two axes) every plane's weight goes to zero and the
  pair read flips; there the grain fades to its mean, which keeps it continuous.
- **Size:** two power-of-two octaves cross-faded by the pixel's footprint (view distance × a pixel's angle at
  1080 lines ÷ √cos incidence), so one texture tile spans `SPEC.detail.px` (2048) pixels of a 1080-line frame at
  every zoom: grain marks of about 5 px at 1080 lines.
- **Anti-tiling:** two variants per octave (Quílez's index variation), the index read in world space at
  `SPEC.detail.index` (400 m), handed over by the index alone, so a variant with no weight is not read.
- **Strength:** the blend's lost contrast is given back (variance renormalised), then scaled to `SPEC.detail.amp`
  (0.4) of the texture's own.
- **Band edges:** never narrower than two pixels' change of the light value (`fwidth`), baked and cloud
  shadows included: where they step within a pixel the edge comes out about two pixels soft.
- The pixel's angle is a uniform (`uPixA`) from the camera's actual vertical field of view, so on frames wider
  than 16:9 (which keep the horizontal one) the grain still spans the same share of the frame's height.
- The 21 m blotch term reads the same planes at its fixed world size, renormalised the same way. Snow, cloud shadows and flowers are
  unchanged. Every read is a `textureGrad` from the world position's derivatives, taken once.
- `DETAIL_L0` puts back the L0 grain (the bench's second arm, the checks' baseline); `DETAIL_DEBUG` and
  `DETAIL_DEBUG_INC` and `DETAIL_DEBUG_N` (the shading normal) are the checks' views; `DETAIL_SAB_IMPLICIT` and `DETAIL_SAB_STEP` are sabotages, and so is `BANKN_OFF` (no bank normals).

### Leaf-card crowns (`?trees=cards`, L7a, an experiment)

The plan: `docs/plans/done/l7a-canopy-cards.md`. Not the default: the arm the owner judges against the pack crowns.

- **The cards** (`src/look/canopy.ts`, `shaders/canopy.vert|frag`, `shaders/cards.glsl`): each broadleaf, birch
  and willow crown becomes quads sampled on its crown triangles, expanded in view space to face the camera and
  cut by a leaf-clump atlas; sphere normals, so a crown shades as one mass; each card takes its shadow at its
  point on the crown surface. The trunk is a mesh of the model's triangles off the crown (`trunks_<model>`).
- **The atlas** (`src/look/leaves.ts`): four clumps in 2×2 cells of 512², value in R and coverage in A, from the
  picture `data/leaf-clumps-oak-v1.png` (four clumps on black, any layout) or drawn (`?leaves=procedural`).
  Shift-dropping a picture on the page replaces it and re-bakes the shadows.
- **Shadows** (`src/look/bakes.ts`): the cards cast in the sun's pass, facing the sun and cut by the atlas two
  mips finer than the sun's view asks, so the gaps between leaves survive; the disabled pack models cast nothing.
- **Switches**: `?cardsize`, `?cardcover`, `?cardsink` (`CARD_DEFAULTS`); `?bench=trees` benches the cards
  against the pack crowns, for the frame's cost only (the shadow map is baked once, with the cards); read its frame
  interval, not the GPU timer, which runs long on ANGLE Metal (`docs/plans/done/forest-bench.md`).

- **The crowns as volumes** (L7b, `docs/plans/done/l7b-crown-volume.md`; `VOLUME` and `SOFT_RAMP` on the card
  materials, `?volume=off` puts back L7a's light): each card carries its crown's ellipsoid (`aEllC`, `aEllR`: the
  crown triangles' box centre, the mean of its x and z half-extents and its vertical one). Per pixel: the normal is the
  ellipsoid's, turned a little by each leaf's tilt (the atlas's G and B, the value's gradient read as a height,
  faded with the mip level); the light through the crown dims it (the distance to the sun inside the ellipsoid grown
  1.3 times, the cards' reach: 1 − exp(−0.75·t / r), at most 0.7); other trees' shadows are read where that ray
  leaves the crown; the core darkens to 0.72. The ramp is soft for foliage (`SOFT_RAMP` in `paint()`: the light
  wraps, (n·l + 0.45) / 1.45, the same three colours over a wide range, the mid colour kept saturated). The golden
  backlight keeps the card normals and is blocked by other trees only. `?bench=volume` benches it against L7a.

### The shadows' look

The plan: `docs/plans/done/shadow-look.md`.

- **The shadow band** (`shadowOf()`, `painter.glsl`): more saturated than the base and turned 25 % toward a cool
  blue violet, at the value the band had before, so dark coats keep their separation from shaded ground. The
  army blocks (`block.frag`, `KEEP_HUE`) keep the older band, so a coat in shadow loses none of its colour.
- **The valley mist** (`mist()`): thinner over cast shadow on the ground (to 55 % of its amount), less so above
  the ground; shadowed air is darker and bluer. With shadows off the mist is whole.
- **The edges** (`bake.frag`): the bake filters a shadow edge over 0.75 shadow texels a tap (was 1.2).
- **Contact** (`bakes.ts`): a dark core of 0.45 crown radii (at least about 1.6 m: the occlusion map is about 1 m a
  texel) under each tree, in the light map's alpha, which the ground, the water's shore band and the grass read
  (`groundOcc()`), and the crowns do not.

### The meadow and the crops (L5c, L5d)

The plan: `docs/plans/done/l5c-meadow.md`. On by default on WebGL2 (on WebGL1 the old scatter stays: the meadow reads a half-float texture in its vertex
shader); `?meadow=off` puts back the old scatter.

- **The grass near the camera** (`src/look/meadow.ts`, `src/look/meadow-spec.ts`, `shaders/meadow.vert|frag`): clumps of the owner's pack grass
  (`data/meadow-grass.json`, exported from its `Grass_Large` and `Grass_Small`) on three round rings around the
  camera's focus (`RINGS`: cells of 0.5, 1 and 2 m, the slots of a 104-cell square within the ring's reach, the
  large clump near and the small one farther, its footprint wider with the cell, its height the same: `HEIGHT`,
  never over `HEIGHT_MAX`). Each ring is one instanced mesh with a static slot buffer (`forcedInstanceCount`: no
  matrices); each frame it snaps to its cell. The vertex shader places a clump from its world cell's hash
  (jitter, size, yaw, lean), so a clump never moves nor changes as the rings follow the camera; it exits first
  outside its ring's band of distance and outside the view, then reads the **meadow map** (a float texture at 1 m:
  the ground's height, the growth and the height factor, half floats, baked once: `Nature.growth`, the grassy cover
  and its edges on the 2 m cells, each texel interpolating the cells round it; then the cover's edge and `Nature.growthAllowed` (roots `CLUMP_REACH`, 1.45 m, from the formation zones and the
  banks, the widest clump's reach) at each texel near those edges; then the growing area shrinks a texel, so the
  GPU's bilinear read never crosses a rule; pasture shorter) and the **clump field** (`shaders/meadow.glsl`), and shrinks
  each clump away across its ring's band (the rings hand over without an edge). The fragment shader is a lean
  `paint()` (the ramp, the cool band, the sky in the shadow, clouds; no grain, rim nor snow): the painted ground's
  colour under the root (the macro bake, `groundArm`; the flat class colour on the other arms), darker at the root and lighter, warmer at the tip. In winter the clumps shrink under the snow.
- **The crops** (L5d, `docs/plans/active/l5d-crops.md`): the same slots grow a crop clump where the meadow map's A
  channel (the crops' growth: `Nature.crop`, a sown field, wheat, green crop or stubble, with the grass's rules,
  edge and shrink) is above the grass's growth: never both on one patch. The vertex shader reads the cover's class
  at the root (`uCover`) and the season (`cropAt` in `meadow.vert`): wheat standing up to `WHEAT_HEIGHT_MAX`
  (decision 0026) in summer, cut to 0.22 m stubble through autumn and gone by late autumn; the green crop 0.45 m,
  lower under the snow; stubble 0.22 m until the plough. Narrower than grass, evenly sown (less clumping). Its
  colour (the owner): lime at the stalk's foot to the season's colour at the tip, gold in summer, orange in autumn,
  brown after; the green crop lime to olive. Ploughed fields grow nothing.
- **The meadow on the ground** (`meadowPattern` in `macro()`, `MEADOW`, a define on every painted material and on the
  macro bake): on meadow and pasture (the warped class the ground paints), the brush tile (`data/meadow-brush.png`,
  at 7.3 m and 7.3/2.618 m, turned apart, warped by a slow noise: no common period; stamped by
  `tools/meadow-brush.py` from the owner's grass brush pack in the git-ignored `assets/grass-brushes/`), read at the
  footprint, and the clump field. It is in the macro colour, so the bake arm holds it (nothing a frame) and the
  terrain and the shore band agree; the grass takes its colour from that ground (read at its ring's cell) and its
  shade from the clump field.
  `tools/meadow-grass-export.py` rebuilds `data/meadow-grass.json` from the pack's two grass files.
- **The scatter under the meadow** (`src/look/nature.ts`): the old `Grass_Short` tufts and the pack's wheat tufts
  are not placed (the crops above replace them; `?meadow=off` keeps the wheat lattice, each tuft clamped in `add()`
  to `WHEAT_HEIGHT_MAX`, decision 0026); the scatter's random stream is kept, so nothing else moves.
  `tools/river-check.js` counts the meadow's growing and cropping cells in place of the tufts and checks the grass's
  and the crops' footprint against the zones and the banks, and the crops off the floodplain; `tools/look-check.js`
  checks no clump floats over the drawn tile (each sinks `MEADOW_SINK`).
- `?bench=meadow` benches the grass and crops against none (the ground's pattern is baked); `__look.meadowBakeMs`,
  `__look.meadow` (`growingCells`, `growthAt`, `croppingCells`, `cropAt`: river-check's meadow checks).

### Soft shadows (the sun's penumbra, the sky's occlusion)

The plan: `docs/plans/done/soft-shadows.md`. On by default; `?soft=off` puts back the shadows before it.

- **The penumbra** (`bake.frag`, `SOFT`): a blocker search of 16 taps in the sun's depth map, reaching the widest
  penumbra (of a caster `FAR_MAX`, 40 m, along the light), gives the mean distance from the ground to its casters
  (`DEPTH_M`, the sun camera's depth range, makes it metres); the filter's radius is that distance times `?penumbra`
  (default 0.06, `SOFT_DEFAULTS`, at most `PENUMBRA_MAX` 0.2: an exaggerated sun, the real one's is 0.009), between the old filter's radius and
  the search's reach, over 32 taps turned per texel. Radii are ground metres (`uSMGround`, a shadow texel on the
  ground). The painted edge (the grain's threshold) widens and loosens with it, the grain acting in the penumbra
  only. The bake costs about 14 ms on load on the dev Mac (1.3 ms before). A trunk's foot stays crisp; a
  crown's outline 15 m along the light is soft.
- **The sky's occlusion** (`skyOcclusion()`, `bakes.ts`, on the CPU on load): each crown and bush is a sphere (the
  canopy list's last three numbers: its centre's height above the ground, its radius, its opacity); the ground at
  each texel of the occlusion texture loses the cosine-weighted fraction cos θ · (r/d)² of its sky to each sphere
  within 25 m, at most 0.42 times its opacity (the crowns read this texel too: 0.29 for a crown, under the old disc's
  0.42; a bush's opacity 0.7, 0.29 against its old 0.30), splatted per sphere; the fractions multiply into G, over the terrain's ring test. It replaces the discs
  under crowns and bushes; the contact core stays.
- **Occlusion inside the shadow** (`paint()`, `SKY_IN_SHADOW`, a define on every painted material): where the
  ground's sky occlusion (`pSky`, the light map's G, set by the terrain, the water and the grass only) is deep (below
  0.8, a wood's floor) the shadow colour itself darkens, to 0.62 at 0.35; before it, a wood's floor was the same flat
  shadow colour as a lone tree's shadow. Other materials (crowns, bushes, the army blocks) leave it at 1.
- `?wood` adds one dense wood (70 tries, its own random stream) to judge it, `?wood=big` a forest of about 150 by
  110 m for the forest bench (520 tries, `docs/plans/done/forest-bench.md`); `__look.sky` (`Bakes.sky`) reports the
  sky bake's time and the occlusion's range, null with `?soft=off`. The painted materials take their define from
  the same options as the bakes (`softDefines()`).

### The bench (`?bench`, L2a)

The page runs 9 cameras (closest, default and widest zoom, each at yaw −45°, 0°, +45°) and records, per camera
and arm, frame times (p50, p95, max), GPU time per pass, draw calls and triangles, plus the estimated texture
memory, the renderer and the build hash (`__BUILD__`, set by `vite.config.ts`). It shows the JSON with a link to
save it, and puts it in `window.__bench`. Arms are variants of the page measured in the same session, A B B A per
camera: `l2` (the page) and `l0` (the L0 grain on the terrain). `?benchat=<x>,<z>` (within the play area) makes the
cameras orbit that point instead of the camera's start, and the JSON records it as `focus` (the forest bench).
- **GPU time** comes from our own `EXT_disjoint_timer_query_webgl2` queries (`src/look/gputimer.ts`). Queries
  cannot nest: whole-frame time is taken on alternate frames, the passes (terrain, scatter, water, other,
  post) on the others, each as segments of consecutive draws, only in the camera's own render pass. Frames with
  a disjoint event are dropped. Without the extension the GPU fields are `null`.
- **Frame times** come from the whole-frame frames only (the pass frames carry more queries). A run during which
  the tab was hidden is measured again. The bench removes its observers when it ends.
- **`passesOverFrame`** is the passes' medians over the frame's. ANGLE on Metal inflates every query (about 2×
  here); there only the GPU frame column stands. **Cost comparisons between arms use GPU frame time:** in a
  browser the frame time is held at the display's refresh (16.7 ms at 60 Hz) whenever the frame is cheaper.
- `node tools/bench-look.mjs <url> [out.json] [--hold s] [--gpu metal]` runs it headless (SwiftShader by
  default: slow, and its timer times software rendering), with vsync and the frame-rate limit off. The laptop run is the owner's (`docs/plans/active/track-e-look.md`, "Measuring").

### The readability guard (L2a)

`node tools/guard.mjs <url> [--base <url>]`: six clusters of the four army coats (art bible §4) at battalion
size, on the default view, summer and winter. Each block's luma against the ground's at the same pixels (from a
render without blocks) must differ by 0.10; with `--base`, a block fails only if it separated on the base. The
blocks are painted by the shared painter at unit crispness, without snow (`NOSNOW`), as units will be. Its
negative, in summer: the same blocks painted grey, each at the grey that matches the ground's value under it
(interpolated from renders at two greys), must not separate. A block's pixels come from two mask renders (flat
white, flat black), so hidden parts and ground-coloured parts are both counted right.

`--view cover` (L5a) puts the clusters east of the hill instead, every block wholly on a class of the cover: lines
along the ploughed field, a column of march on the road, the village ground (the 3 m track holds no 20 m line).

### The macro checks (L5a)

`node tools/macro-check.mjs <url> [outDir] [--only classes,shimmer,determinism,bake] [--selftest]`: the classes
read apart (CIE ΔE 2000 across the class edges the class view finds, medians per kind of edge), shimmer on the
fields' pixels under a quarter-pixel shift (summer and winter), the bakes' hashes after a load, a rebake and a
second load, and the full-size bake (3600²) without a lost context. Run the self-test in the shader arm: the
bake's texture filtering smooths even the stripes' sabotage, and the flat arm has no stripes. The header has the
measures and limits; the results are in the plan.

### The judging kit (L5b)

`node tools/ablation-kit.mjs <url> <outDir> [--seed <text>]`: every arm on the judging framing (east of the hill:
the ploughed field, the track, the road, the village), at the bench's three zooms and three yaws, summer and winter,
with the guard's cover blocks (`tools/army-blocks.mjs`) and `?trees=one,cards`; and a 3 s pan per season and zoom (H.264,
ffmpeg). Under `<outDir>/publish/` it writes what the judging artifact publishes, and nothing else: the media under
opaque ids, `screens.json` (12 screens: each pair of arms judged, by zoom; sides x and y, the later arm on x on half
of them) and the judging page (`tools/ablation-judge.html`); under `<outDir>/private/`, never published, the shots
named by arm and `key.json` (which arm is which). Published as a private artifact with the access rules in the
kit's header, the page shows each judge the screens in their own order with their own A/B sides, asks the plan's
five questions, and saves each judge's answers in one document of the artifact's store (`answers/<judge's id>`,
readable by the judge and the owner alone: without the rules, by every viewer). The rule and the tally: the plan.

### The detail checks (L2b)

`node tools/detail-check.mjs <url> [outDir] [--only …] [--defines …] [--selftest]`: scale stability over a zoom
sweep, seams on a test hill with a smooth grain (a step that keeps its size when the frame is rendered at twice
the resolution), shimmer under a quarter-pixel shift of the image, and the tiling review's image set (12 images
under random names and an answer sheet). `--selftest` runs each check's sabotage, which must fail it. Its
header has the measures and the limits; the results are in `docs/plans/active/track-e-results/l2b-detail.md`.

## Changes from the prototype (L0a)

- The world SPEC moved the play area in from ±250 m to ±235 m: at the widest zoom the frame's lower half
  reaches 160 m from the focus, and the tile ends 400 m out (the old 150 m margin came from screenshots).
- The shadow map is sized from its fitted box at 0.33 m on the ground (about 3647 × 4906 instead of 3072²).
- The far ring sits at its authored height (the prototype lowered it 0.9 m, so the apron sloped and far bushes floated).
- Instances stand on the drawn triangles, not on the formula; no far bush stands in the 14 m apron band.
- The reflection mask is blurred in JS instead of by a canvas filter.

## Tunables

In the code: sizes in `src/look/spec.ts` (with the detail layer's `detail.px`, `detail.amp` and `detail.index`, and the macro colour's `macro`), colours and light in `src/look/materials.ts` and the shaders (the cover's colours in `src/look/shaders/macro.glsl`; the cover itself in `src/look/world/cover.ts`, rebuild the look data after a change), the
river's parameters in `src/look/world/author.ts` (rebuild the look data after a change), the scatter in `src/look/nature.ts`.

## Verification

- `node tools/golden.mjs <base> <cand>` after `npm run build` and `npx vite preview`: a change to the look
  page against its `origin/main` build (or another page). Against the prototype it differs since L0a, by the
  changes listed above; L0c matched it pixel for pixel.
- The render and river checks run on the look page through `tools/shot.mjs` (their headers), and so does
  `tools/look-check.js`: `H` against Babylon's own reading of both drawn meshes, the yaw lock, every instance
  on the ground, the ground inside the SPEC's range. `node tools/check-negatives.mjs <url>` runs all three
  with a sabotage per limit.
- `test/look-spec.test.ts`: one negative case per SPEC invariant, the triangle split, the data file's round
  trip and that the committed file is what the authoring step builds. `test/cover.test.ts`: the cover's coding,
  and its rules (nothing on the floodplain or in the formation zones).
- `node tools/guard.mjs` and `node tools/bench-look.mjs` (above). Their baselines are in
  `docs/plans/active/track-e-results/l2a-baseline.md`.
- `node tools/detail-check.mjs <url> --selftest` (above). The goldens of main against `?detail=l0` matched in
  L2b (the detail layer then changed the terrain only); since W4 `?detail=l0` also changes the water's shore band.
- `node tools/water-look-check.mjs <url> --selftest` (W4, `docs/systems/river.md`): the shore band, the seam,
  pools against riffles, shimmer on the water. The page's hooks: `__look.waterSab` (the sabotages),
  `__look.groundAs` (the tile's ground drawn with the water's shader), `__look.waterAt` (the data at a point),
  `?watersab=nodive`.
- `node tools/macro-check.mjs <url?macro=shader> --selftest` and `node tools/guard.mjs <url> --view cover` (L5a, above);
  for arms 4 and 5, `macro-check` and the guard against `?macro=bake` as the base (L5b).
- `npm test` (lint and typecheck cover `src/look/`).

## Open questions

- **The leaf-card crowns are not the default arm yet:** a dark coat in a crown's deep shade loses separation
  with them (#63, moved to L4: the army side's to fix); decision 0022 (their soft ramp) is accepted; their outline aliases at the widest zoom (L8); a
  forest is where they cost the most (a cheaper forest is owed: `docs/plans/done/forest-bench.md`), and the min-spec laptop and the foliage's total
  against L7's gate are not measured (`docs/plans/active/track-e-results/shadows-foliage.md`).
- **The guard has no block in a wood**, where the soft shadows make the floor darkest.
- **The valley mist tints sunlit snow orange** (#62).

- The nature pack's data comes from `prototypes/` as a script that sets `window.NATURE`; it moves to a
  real module before the prototype is retired (L9).
- `groundAt` reads the far grid inside the 14 m apron band, where the drawn surface is the apron's fan; nothing
  is placed there (`src/look/nature.ts`), and the look check fails if anything is.
- **The guard fails on main** for some coats (red in summer, white on snow): a palette question for the owner,
  recorded in `docs/plans/active/track-e-results/l2a-baseline.md`.
- **The staff map** will read the macro colour flattened (the proposal); it is not on the look page yet.
- **The cover is this world's** until the map format's world compiler writes the grid; the grid's shape is what
  it would write.
- The bundle is one 1.7 MB chunk (Babylon plus the nature pack data); splitting it waits until load
  time matters.
