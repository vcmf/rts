---
status: current
last_reviewed: 2026-10-29
code: [app/look.html, src/look/main.ts, src/look/mood.ts, tools/coat-check.mjs, src/look/spec.ts, src/look/heightfield.ts, src/look/world/author.ts, src/look/world/data.ts, data/painted-world.lookdata, tools/build-look-data.ts, src/look/world/windows.ts, src/look/world/from-map.ts, src/look/relief.ts, test/look-relief.test.ts, data/austerlitz-kobelnitz.lookdata, test/look-from-map.test.ts, tools/look-check.js, test/look-spec.test.ts, src/look/noise.ts, src/look/river.ts, src/look/grain.ts, src/look/materials.ts, src/look/terrain.ts, src/look/water.ts, src/look/nature.ts, src/look/bakes.ts, src/look/post.ts, src/look/shaders/, tools/golden.mjs, tools/check-negatives.mjs, src/look/bench.ts, src/look/gputimer.ts, src/look/lab.ts, tools/bench-look.mjs, tools/guard.mjs, tools/look-page.mjs, tools/detail-check.mjs, src/look/span-texture.ts, src/look/world/water-data.ts, tools/water-check.mjs, test/water-data.test.ts, tools/water-look-check.mjs, src/look/world/cover.ts, src/look/macro.ts, tools/macro-check.mjs, test/cover.test.ts, src/look/meadow.ts, src/look/meadow-spec.ts, data/meadow-grass.json, src/look/canopy.ts, src/look/leaves.ts, data/leaf-clumps-oak-v1.png, prototypes/tree-core.js, src/look/flow.ts, src/look/units.ts, src/look/units-data.ts, src/look/lod-fade.ts, test/lod-fade.test.ts, src/look/shadow-look.ts, test/shadow-look.test.ts, test/step-shadows.test.ts, test/look-units.test.ts, src/look/world/armies.ts, tools/bake-figure.py, data/figures/fr-line-infantry.unitdata, test/armies.test.ts, tools/guard.mjs, src/rulesets/napoleonic-uniforms.ts, src/rulesets/napoleonic-dyes.ts, src/look/world/dyes.ts, test/dyes.test.ts, tools/army-blocks.mjs, src/scenarios/armies-demo.ts, src/look/trace.ts, src/look/sim-men.ts, src/look/sim-armies.ts, test/look-sim.test.ts]
decisions: [0068-dye-palette, 0066-figures-lod-cross-fade, 0001-painterly-look-in-materials, 0002-top-down-camera-no-sky, 0024-blur-as-player-option, 0010-locked-camera-staff-map, 0011-scale-and-min-spec, 0012-heightfield-authority, 0016-typescript-toolchain, 0022-soft-ramp-for-foliage, 0026-crops-under-a-soldiers-chest, 0027-units-take-the-lights-value, 0031-generated-trees, 0043-epic-is-the-default-mood, 0047-figures-cast-runtime-shadows, 0049-simple-shadows-beyond-close-zoom, 0051-closer-zoom-nearest-lod, 0062-simple-shadows-at-every-zoom, 0067-simple-shadows-darker, 0071-soldier-contact-shadow, 0074-soldier-shadow-per-step]
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
| `src/look/spec.ts` | The world SPEC: sizes declared once, the rest derived (cells, the apron band, the camera footprint, the shader macros), and the invariants checked on derive: grids meet exactly, the tile holds play ⊕ margin, the far ring holds every view on flat ground, no frame corner near the horizon (the closest zoom, 15 m, held out over high ground until the eye is the camera's clearance, 6 m, above it: `clearRadius`, decision 0051); each world's ground against the camera at load (`groundOf`, `checkView`) and its focus on its ground (`FocusFollow`: below, "The camera on a world's ground"), yaw ≤ ±45°, bakes at their texel targets and within min-spec. The shadow map is sized from its fitted box at the texel target |
| `src/look/world/author.ts` | The authoring formulas (`baseH`, the meander's generation, the trough and the carve). Run in Node by the build tool; the page uses them only for checks |
| `tools/build-look-data.ts` | Builds `data/painted-world.lookdata`: the heightfield (tile plus `aoMargin`), the far ring's nodes, the river's samples, the bank normals (W2), the water data (W3, `src/look/world/water-data.ts`) and the cover (L5a, below); and each map window's `data/<map>-<window>.lookdata` (below; `--window <name>` builds one) (`--check` compares them all) |
| `src/look/world/data.ts` | The look data's binary format (version 9): arrays, span grids (a grid's covered texels only) for the bank normals and the water data, the cover's runs, the roads' segments and grid, the world it holds (the demo or a map's window) and a map world's trees |
| `src/look/world/windows.ts`, `src/look/world/from-map.ts` | A map's named windows and the look compiler (M4) that turns a window of the map's layers into the look data (below) |
| `src/look/world/cover.ts` | The ground's cover (L5a, below): authored, rasterised to a grid, run-length coded |
| `src/look/macro.ts` | The cover's texture, the macro colour's bake and its arms (L5a, below) |
| `src/look/heightfield.ts` | `heightAt` on the heightfield with CreateGround's own triangle split; `groundAt` adds the far ring's nodes beyond the tile; `H` is `groundAt` |
| `src/look/river.ts` | The meander at run time (`docs/systems/river.md`): the shipped samples, a bucket grid, `riverQuery`, `bandOf` |
| `src/look/grain.ts` | The procedural paint grain (R fine, G blotches, B streaks), a dropped PNG's luminance, the seam check's smooth grain, the R channel's mean |
| `src/look/mood.ts` | The light's moods (LC1a, `docs/plans/done/lc1a-moods.md`): every colour of the light in one table (the sun and its winter colour, the shadow band's colour, turn and lift, the mid band's cool share, the lit band's lift, the rim's and the backlight's tints, the valley mist's air, the haze, the water's painted sky and glint, the grade and the vignette), read by the painter, the foliage, the meadow, the water and the finishing pass; `MOOD_COLOURS` (`src/look/materials.ts`) gives each material its share. A mood's `units` sets how much of the light units take (LC1b and LC1c, decision 0027: the painter's `KEEP_HUE` path takes the sun's value and `units.tint` of its hue, a near-white coat a fifth of that (decision 0032, open until the figures), at most `units.mist` of the valley mist and `units.grade` of the grade, the air then put back at the unit's own value, clamped at 1: `airOf`); the grade itself is the last step of every painted material (`gradeOf` in `atmos()`), and the finishing pass's bloom takes the grade's highlight tint off each tap before its threshold and puts it back (a per-channel threshold on the graded scene amplified the tint). `tools/coat-check.mjs` checks each coat's lit colour (`docs/plans/done/lc1b-coats.md`; its bounds and golden's shares, chosen by the owner: `docs/plans/done/lc1c-unit-share.md`). A mood's `earth` (LC2) turns the world's own colours toward earth tones on the albedo before the light (`earthOf`, in `paint()` and the meadow's paint step; not units). The default is `epic` (decision 0043, after Tiny Glade: `docs/plans/done/epic-palette.md`: a mood's seasonal shadow colours, `cloudSnow`, `mist`, a warm `autumn`, the grade's `greenHue` teal turn and `summerSat`, recomputed as the season moves in `src/look/main.ts`); `temperate` (LC3, decision 0033) before it; `golden` is the look up to LC3; `?mood=<name>` picks one, set before any material is made |
| `src/look/materials.ts` | Panel state `S`, the sun's direction, and the material factory (it gives each material the mood's colours) that inlines `shaders/painter.glsl` at `#include<painter>`, the water data's reads (`#include<waterdata>`) and the shore band with the bank normals (`#include<shore>`, W4), which includes the macro colour (`#include<macro>`, L5a) |
| `src/look/terrain.ts` | Tile (1.79 m), far ring (14.3 m) and the apron that stitches them; the far ring's painted river mask; the bank normals' texture (W2, `docs/systems/river.md`; both it and the water data's, W3, from `src/look/span-texture.ts`). Their materials define `DETAIL` (the detail layer, below; on WebGL1 the material factory adds `DETAIL_L0`); the tile's also `BANKN` and `WATERDATA` (the shore band, W4), as do the water's |
| `src/look/water.ts` | The water ribbon, its materials (the painted water, W4, `docs/systems/river.md`; and the same shader on the tile's ground, for the seam check) and the tree-reflection mask |
| `src/look/nature.ts` | Role-painted nature pack models, thin instances, and the scatter with its placement rule (and, since L5a, the cover's: what grows on which class) |
| `src/look/buildings.ts`, `src/look/world/buildings.ts`, `tools/building-to-js.py` | The buildings (`docs/plans/done/buildings.md`): the owner's Tripo models (a windmill, a stone house) to `prototypes/buildings.data.js` with a role per face, painted by role from the palette with the texture's value as detail; placed (authored) in the wheat field and the village; their footprints the village's ground in the cover; in the shadow bake and the light map's occlusion |
| `src/look/bakes.ts` | Sun shadow depth (once; the card crowns cast through their cards), occlusion and valley mask (CPU, once: the terrain's ring test times the sky each crown and bush hides, `skyOcclusion()`), the top-down light map (once; 1536² over the tile, 0.52 m a texel, decision 0082; its shadow edge grows with the distance to the caster): R sun visibility, G occlusion, B valley mask, A the contact under each tree's crown, which only the ground reads (`docs/plans/done/shadow-look.md`, `docs/plans/done/soft-shadows.md`) |
| `src/look/meadow.ts` | The meadow near the camera (L5c, L5d, below): the meadow map (ground height, the grass's and the crops' growth), three rings of static grass and crop instances around the focus |
| `src/look/canopy.ts`, `src/look/leaves.ts` | The leaf-card crowns (the default with the generated trees; `?trees=cards` on the pack's; L7a, L7b, below): the card meshes from each pack crown's triangles with the crown's ellipsoid, their material; the leaf-clump atlas (value, coverage, each leaf's tilt) from a picture or drawn |
| `src/look/post.ts` | A pixel that is not a finite number is left out of the depth of field's downsample, or takes its neighbours' mean in the finishing pass (`?nanmark` shows it magenta, on half floats: `docs/plans/done/nan-guard.md`). The scene renders into a 4× MSAA target of 8 bits a channel, the depth of field's too (`MSAA` in post.ts, `docs/plans/done/wide-perf.md`). The RTS camera, locked to the SPEC (yaw ± 45° around the default, decision 0010; zoom 15 to 260 m, held out where the eye would come within 6 m of the ground under it (below `clearBelow` of the highest ground near the focus: on the demo never from 41 m out), the player's wanted zoom kept apart (`holdView` and `ZoomHold` in `src/look/spec.ts`, run before each frame: the wheel, the pinch, the slider and the tools set it, `zoomOf`, `__proto.zoom`) so the camera comes back in past a hill: decision 0051; frames wider than the checked 16:9 keep its horizontal field of view), with RTS controls (`rtsControls`: the arrows or WASD pan in the ground plane and Q, E turn, faster as it zooms out; a trackpad's two-finger swipe pans and its pinch zooms; a mouse wheel zooms; dragging turns and pans; the panel's Zoom slider follows), and the passes: depth of field (a player option, decision 0024), then one fused finishing pass (bloom, vignette, paper, dither; the grade is in the materials since LC1b). On WebGL2 a last pass, `easu` (decision 0045): the screen from the chain's scale, a copy at 1, FSR 1's edge-adaptive upscale from 0.9 up (Babylon's, its gathers read once each), bilinear at the other scales, upscaled with the paper grain and a dither; the chain's passes sized by objects resized in place. |
| `src/look/main.ts` | Loads the look data, checks the ground against the SPEC, builds everything in order, the panel, the frame loop (and its readout, top right: over the last 120 frames the frame interval's median and slowest 5 %, the render's CPU time, the share of frames that missed their slot (past one and a half of the median); `docs/plans/done/frame-readout.md`), and the debug globals the checks read; `?bloom=0` opens with the bloom off; the render scale defaults to Auto (by zoom: 0.9, then 0.8 and 0.75 as the camera's radius passes 80 and 88 % of its range from 45 m (the range it was tuned on: the closer zoom keeps 0.9, decision 0051), 4 m of hysteresis each way: decision 0045, after 0036, which records why it is not driven by missed frames; on WebGL2 the canvas stays at the page's pixels and the finishing chain draws at the scale, resized in place (`post.scale`), its last pass (`easu` in `post.ts`) drawing the screen: FSR 1's EASU from 0.9 up and under 1, bilinear at the other scales, a copy at 1, the paper grain laid after an upscale, the dither before the 8-bit target and after the upscale; on WebGL1 the canvas is drawn smaller and stretched; `?upscale=bilinear` stretches at every scale; the paper grain stays in screen pixels; the check tools pin it to 1: `docs/plans/done/dynamic-scale.md`, `docs/plans/done/render-scale.md`); `?msaa=1|2|4`, `?far=off`, `?rt16`, `?nowide` are the frame-rate A/Bs (`docs/plans/done/wide-perf.md`) |
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
`?dof=0|1` overrides the gameplay depth of field, on by default (decision 0024, below); `?bench=dof` benches it off
and on.
`?bench&passes=0` times whole frames only, without the per-pass GPU timers.

### A map's window (`?map=<map>&window=<name>`, A1)

The look compiler (M4, `docs/plans/active/look-austerlitz-a1.md`; decision 0057: the map language is the one
description of the ground) draws a window of a map file on the look page: a square the size of the demo world (the
800 m tile, the 2600 m far ring, ±235 m of play, `SPEC` unchanged) round a named centre (`src/look/world/windows.ts`;
Kobelnitz on Austerlitz, (−450, 350); the Pratzen, (700, 250)). `tools/build-look-data.ts` compiles the map with the map engine
(`layersOf`, `maps/engine.ts`) and `src/look/world/from-map.ts` reads the window's layers into today's inputs:

- the heights from the layers' nodes (bilinear, `heightOf`), taken down by the window's lowest node so it meets 0;
  the window's far ring must lie inside the map;
- the cover at 1 m cells (`MAP_COVER_CELL`, half the demo's 2 m), its ground, vegetation and built areas rasterised
  from the map's own shapes by apply's rules (`fineAreas`: the painting order, a ground area clearing the vegetation
  under it, an area's `clear` keep-offs, the lines' reach), not read off the layers' 2 m cells (the water and a
  bridge's deck from the layers' cells: a pond stands only where its bed lies under its level). The macro colour's
  bakes read it and paint a cover finer than the demo's with a second, fine warp (`COVER_FINE`, blotches 2.5 m
  across, `coverWarpFine` in `src/look/shaders/macro.glsl`), so a slanted edge wanders instead of stepping by its
  cells (the slow warp alone moves the steps whole; the demo's fields lie near the grid's axes). The per-frame
  shaders and the road split read it coarsened to the demo's 2 m (`coarsenCover` in `src/look/world/cover.ts`, each
  texel the least wear of its block, so the roads' gate holds): no cost a frame. The classes: wood under a wood,
  meadow on a meadow, the water's cells and an orchard's floor, pasture on pasture and rough ground; the arable (one
  `ground.field` in Austerlitz) cut into strips by a hash of the map's position (blocks round seeds 240 m apart, each
  turned its own way, bands 70 m long cut into strips 18–45 m wide, a crop each by the field's stage: winter's
  ploughed land, green corn and stubble), temporary until the language's field generator; the roads and tracks
  (lanes, tracks and paths) over them from the ways' lines; every built cell the village's ground; the wear by the
  distance to them;
- the roads' segments from the `way.*` lines, resampled every 8 m, their widths twice their painted reach (the
  catalogue's widths: a road 5 m, the highway 9, a lane 5); flagged dusty (8 in their flags), so the road paint lays a
  summer's dust over their earth and they read as ways against the ploughed land (`roadPaint`,
  `src/look/shaders/shore.glsl`; the demo's roads set no flag); a grass verge (4 m past a road's edge, 2.5 m past a
  track's: `VERGE`) where the arable reached them;
- the trees: a wood's on a 6 m lattice jittered 2.4 m, kept by its density, its species by its `leaf` (birches and
  hawthorns within 5 m of its edge), its size by its `height`; an orchard's apples in its rows (both against the 1 m
  areas); the free-standing trees. On the page the tile's are placed by the placement rule as the demo's scatter, but
  as placed on purpose (`onFields`: one beside a field stays drawn), the far ring's are far trees (none in the apron
  band).

**The relief's painted tone** (`?relief=0|1|2`, `src/look/relief.ts`): a map's long, gentle slopes (Austerlitz at 2×)
take the sun too evenly to read as hills, so the macro colour's bakes multiply in a soft hillshade (the heights over
the far ring at 4 m, smoothed, their slopes as if four times steeper, lit from the sun) and a crest-and-valley tone
(the ground against its mean over about 60 m: crests lighter, valleys darker and a little cooler), baked once with
the colour (`RELIEF`, `reliefTone` in `src/look/shaders/macro.glsl`; static light), and the same tone on the shader
arm's colour and on the live roads' and yards' paint (`shore.glsl`), so they match the ground beside them. 1 on a map world by
default, 2 stronger; off on the demo unless asked (`?relief=1` to judge it there).

The page loads that window's data (`windowOf`; an unknown name throws, and so does a file holding another world).
On a map world the demo's hand-placed copses, woods, hedgerows, extras, wheat lattice and formation zones are off;
the bushes, stones and grass of the scatter stay (the look's own rule of what grows on which class). Not yet drawn
(the plan's PRs b and c): the buildings (the village's ground only), the water (the streams' channels and the ponds'
beds show dry), and the river's own features; `?armies` is the demo's only (A4).

### The camera on a world's ground (A1b)

The ground range is the world's, from its look data at load (`groundOf`, `src/look/spec.ts`; the old `SPEC.ground`,
0 to 25 m, is gone): the heightfield's lowest and highest node, the far ring's lowest, and the range the focus keeps
to. The camera's checks take it (`checkView`): the whole frame inside the far ring and no view held inside the ground,
reckoned on planes at the drop from the focus to the ground (the focus anywhere in its range, the ground anywhere in
the world's). The frame below the focus row inside the tile is marched on each world's own ground in the tests
(`nearFrameOf`: its corners and the focus row's ends from views on the play area's edge; the planes' bound is far too
loose on relief, 205 m on the Pratzen against the 165 m margin, where its ground gives 398.4 m of the tile's 400 m
from the centre; the demo 392.6, Kobelnitz 392.0). `derive` keeps the camera's own checks on flat ground.

- **The focus follows the ground** on a map world (`FocusFollow`, run by the hold each frame before it renders): the
  orbit's target rises and falls with the mean of the ground over a small disc round it (`groundUnder`: 13 points out
  to 15 % of the zoom, 3 to 30 m, so a ditch or a sunken road barely moves it), clamped to the ground in play, eased
  up over 0.3 s (a pan up a ridge does not jolt; never more than 4 m under it, `FOLLOW.lag`) and followed down at
  once (that mean falls smoothly; the focus is then never above it, which `nearFrameOf` assumes, with the lag). On a
  frozen page (`?frozen`, the tools' views) it settles at once. A jump (a tool's new view, 10 m plus half the zoom in a frame) is
  taken at once. The camera stays the top-down view (decision 0002), its yaw, pitch and zoom limits unchanged
  (decision 0010). **The demo keeps its focus plane at 8 m** (`SPEC.camera.focusY`, its focus range one height), so
  its camera and its goldens do not move (open question: `docs/plans/active/look-austerlitz-a1b.md`).
- **The zoom's hold reads the rise near the focus** (decision 0051): it holds the zoom out only below `clearBelow` of
  the highest ground within the eye's reach (`eyeReach`, 216 m) over the focus's height, from blocks of the
  heightfield (14.3 m) and of the far ring (28.6 m, `maxGrid`), not the world's highest point over 8 m. The held
  radius is the same wherever the old bound held; on the Pratzen's top the closest zoom (15 m) is not held.
- The bench's cameras and pan keep the focus's height (the follow's); the look check (`tools/look-check.js`) checks the
  drawn ground against the world's range (`window.GROUND`).

### The gameplay depth of field (decisions 0024, 0040)

The plans: `docs/plans/done/gameplay-dof.md`, then `docs/plans/done/dof-v2.md` (the research:
`docs/research/dof-v2.md`). Two blurs, each in its band of the frame: what lies beyond the focus blurs toward the
top, what lies nearer the camera blurs in the bottom share of the frame only, so the formations in the middle never
take it. Units blur by their depth as the scene does (decision 0040).

- **The lens term in alpha** (`depthA`, `src/look/shaders/painter.glsl`): every material writes s = 1 − focus/z (z
  the depth along the view axis; the focus and the axis reach the materials each frame from `src/look/main.ts`) over
  −1 to 0.5, in the alpha's codes 1 to 254, the units (`block.frag`) as every surface. 0 marks a pixel whose colour
  is not a number (`lensOut`, painter.glsl: the 8-bit target would store it black; left out of the downsample, the blur
  in its place), 255 the clear, the farthest. So the scene's MSAA target
  stays 8 bits a channel with the depth of field on (`MSAA` in post.ts, `docs/plans/done/wide-perf.md`), and the two
  blur passes take the scene's type too.
- **The scene at half resolution** (`src/look/shaders/dofdown.frag`): each pixel holds the four scene pixels under
  it, read at their centres: their colour averaged (a figure narrower than the block is blurred, not dropped) and one
  of their lens terms, the nearest where it lies past the near band (a near silhouette survives the half resolution),
  else the farthest (a blend of two depths is no surface). A unit is left out of both.
- **The blur** (`src/look/shaders/dof.frag`) at half resolution, each tap at a pixel's centre:
  - **far**, after Dennis Gustafsson's single-pass bokeh: taps on a golden-angle spiral, each counted where its own
    blur reaches the pixel (over a pixel either side: the taps are a half-resolution texel apart), a tap that lands
    back on the pixel skipped; about 32 for a 10 px blur and as many per unit of area as the blur grows, in five steps
    from 16 to 64. A sharp pixel skips the taps. A tap behind the pixel has its blur clamped to twice the pixel's, so
    a sharp crown never bleeds over the ground behind it;
  - **near**, after Jimenez 2014, only in the bottom band (`DOF_NEAR.screen` of the frame and the largest near blur
    above it): 8 to 24 taps out to the largest near blur, each counted where its own near blur reaches the pixel,
    weighed by its blur's area (a thin near edge does not swamp the colour); their coverage is the share that reaches.
    The near layer goes over the far result, premultiplied, its coverage in alpha, so a near blur spreads over pixels
    that are sharp themselves. The far result is the far gather by
  the composite's own weight of it (none leaks where the composite takes no far blur); the bloom reads this colour.
  Where a pixel has no far blur, the composite takes the near colour back out of it (the scene's half-resolution colour
  read as one bilinear tap of the sharp scene) and lays it over the sharp scene by its coverage, so a sharp pixel round
  a blurred crown keeps its own detail and the crown's soft rim its full reach.
- **The composite** is in the finishing pass (`uber.frag` with `DOF`): the sharp scene where the pixel's own far blur
  is under a pixel and no near layer covers it; elsewhere the blur, by the larger of the far blur's weight and the
  near coverage. Where it blurs: a 3 × 3 tent over the half-resolution blur (four bilinear taps, the spiral's noise
  smoothed without temporal anti-aliasing), then the painted colour (`DOF_PAINT`): the far blur toward the haze
  (lighter, greyer) by its size, the near layer darker and cooler by its coverage. The bloom gathers from the
  half-resolution blur.
- **The circle of confusion** (`src/look/shaders/dofcoc.glsl`, pixels at full resolution): beyond the focus, s past
  a sharp band times a gain (`DOF`); nearer, −s past the near band times its gain (`DOF_NEAR`), faded to nothing over
  the bottom band's height.
- **The focus** is the depth of the ground at the screen's centre: the centre ray marched against the terrain, eased
  over a quarter second; a new view is taken at once.
- **The constants** are `DOF`, `DOF_NEAR` and `DOF_PAINT` in `src/look/post.ts`: the sharp bands, the gains, the
  largest blurs in pixels at 1080 lines, the share of the far one left at the widest zoom (both ease from the closest
  zoom to the widest), the near band's share of the frame, and the painted colour's amounts. The panel's "Blur
  strength" slider multiplies the blurs. `window.__look.dof`, `__look.dofNear` and `__look.dofPaint` are the same
  objects, read every frame, for live tuning; `?dofnear=0` turns the near blur off.
- **The cost** (the dev Mac, paired one-page runs at three oblique mid zooms): +0.1 to +0.7 ms over the depth of
  field off; `?bench=dof` benches it off and on.
- **The checks:** the look tools load the page with `?dof=0` (`shoot()` in `tools/look-page.mjs`, and
  `tools/check-negatives.mjs` for a URL), so they measure the paint. The readability guard is also run with
  `?dof=1` against `?dof=0`, at the start and cover views.

### The ground's cover and macro colour (L5a)

The plan: `docs/plans/active/l5-macro.md`; the design: `docs/proposals/prepainted-terrain.md`.

- **The cover** (`src/look/world/cover.ts`, authored in Node until the map format's world compiler writes the
  same grid, `docs/proposals/map-format.md`): strip fields on the valley sides and beyond the play area (wheat,
  green crop, stubble, ploughed; each with an id and a furrow direction), meadow and pasture, a road along the
  valley's east side, a road across the valley south of the formation zones to the village, a lane north past the
  wheat field, a track toward the hill, village ground and a trampled square where the roads meet (every line rounded
  and meandering: `docs/plans/done/roads.md`). Nothing but meadow on the
  floodplain (art bible §6c) or in the formation zones. Rasterised to a grid of `SPEC.macro.cover` m cells (2 m)
  over the far ring, 4 bytes a cell: the class, the field's id, the furrow direction, the distance to the
  nearest road, track or village (the wear's). The class `wood` is in the format but not authored: a floor over a
  copse's whole spread darkened open ground between its few trees, and the light map's occlusion already darkens
  the ground under each crown.
- **The macro colour** (`src/look/shaders/macro.glsl`, `macro(xz, q, px)`): class colours from the palette (the
  meadow is the old `groundMeadow`), a low-frequency variation, each field's own shade, stripes along its furrows
  (ridge-and-furrow lands on ploughed ground, faint drill bands on crops, faded with the pixel's footprint), wear
  near the lines, and edges that wander (the class lookup's point pushed ±1.5 m by the grain's blotches). Colour
  only: the light stays in `paint()`. The road is a beige earth and the track a paler one; on the tile both are painted as rutted
  dirt in each road's frame (the nearest road segment, found in the shader from the look data's grid of them: the
  distance across and along, the half width, a junction weight), wheel tracks of pale dust cut into pieces, ragged edges, the owner's grit photo (`roadPaint` in
  `shore.glsl`, `docs/plans/done/roads.md`). Far out the macro bake holds them (tracks a dusting, no grit) and the
  tile's ground takes its material without the live roads beyond 170 m; nearer they fade in (decision 0039). Nearer too, the tile's ground is three materials by triangle (`splitGround` in `terrain.ts`, one `MultiMaterial` made with the terrain's: its place in the opaque draws): within reach of a building's yard (a yard's cover texel, below) the live roads with the paving (`terrain`); else within reach of a road (the cover's distance to a line under the road gate: `ROAD_NEAR`, the cover's warp and slack, `src/look/spec.ts`) the live roads alone (`terrainRoads`); the rest the material without either (`terrainBaked`): about 0.7 %, 7.2 % and 92.1 % of the tile's triangles. The same pixels but for a step of rounding on a few (the programs differ), each feature's shader only where it can show: the road split about 1.1 ms a frame less at the default and closest zooms (`docs/plans/done/headroom.md`), with the paving's split and its gate the buildings cost about 0.35 ms at the village's closest (main 6.55 ms, 6.92 with them; 7.77 before the split), 0.15 at its default zoom, and the windmill's view comes out cheaper than main (0.65 ms at the closest, 0.2 at the default: the buildings hide ground and grass) (Metal, three rounds: `docs/plans/done/buildings.md`; `?split=0` draws the whole tile live, with the paving). Every read passes the world position's screen derivatives explicitly (`macroDerivs` in `shore.glsl`, taken at the top of each shader's main; `textureGrad` on WebGL2; the meadow's reads too): a read in a branch the pixels of a quad take differently has undefined derivatives, and on the Mac's GPU the bake then differed run to run.
  The class `bare` (10): trodden or dry earth, no grass, no crops, no stripes, not
  a field (`isField`).
- **The dirt surface** (`dirtOn` in `macro.glsl`, at the terrain's fragment: `docs/plans/done/ground-surface.md`):
  where the ground is bare (track, the village's trodden patches, ploughed land, a little on the road, the
  worn ground by the lines), the owner's dirt texture (`data/ground-dirt-v1.png`, made seamless) multiplies the
  value about its mean (0.458), two reads at 15 and 24 m a repeat so its marks do not repeat in rows; mipmapped, so
  they average out at far zoom (the marks fade out as a pixel spans 0.35 to 0.9 m). Five cheap reads (the cell and its
  corners 1.5 m off) first: grass far from a line returns there. On the terrain and the shore band alike.
- **Bare earth where nothing grows** (`docs/plans/done/bare-earth.md`): a grassy class (meadow, pasture, a copse's
  floor) where the meadow map's growth is 0 (a formation zone, a bank, a field's margin: no blades there) paints the
  soil, not the grass's green (`bareOf` in `macro.glsl`, in `macro()`: the bake and the shader arm), and the class
  `bare` is the soil too. Generic, as the map engine's ground (Track M: a kind's `material` and its `growth`, the yard
  `earth` with growth none): bare where nothing grows, by any cause, and **the soil by material** (`soilColour`: loam
  only today, the cover having no material; clay, sand, gravel when a map asks). The bareness reads the growth at the
  cover's warped point over four taps a metre apart (the map's 2 m cells stepped along a diagonal edge), its edge
  wandering by the grain.
- **The earth's surface up close** (`earthOn` in `macro.glsl`, after `dirtOn`): the owner's cracked earth
  (`data/ground-earth-v1.png`, made from the local reference by `tools/earth-texture.py`: the central square in grey,
  the photo's broad light divided out, made seamless one axis at a time) multiplies bare loam's value about its mean
  (0.632), two reads at 5 and 8 m a repeat at unrelated turns (the turned read's gradients turned with it), fading out
  from a 6 to a 25 cm footprint. Its mask is the macro colour itself: the bake painted the soil where the ground is
  bare, so a pixel takes the cracks as far as it reads as soil (its red over its green by 1.10 to 1.18: the grass, the
  wheat, the stubble and the village stay under), at no read, its edge the bake's own. So all bare loam takes it: the
  soil, the ploughed land, the roads and the tracks (their own paint over it near the camera); the dirt's marks
  (`dirtOn`) hand over to it up close by the same weight. The bareness in the bake reads the growth at the cover's
  warped point (four taps a metre apart), and beyond the meadow map (the tile's last 10 m and the far ring) the
  margins from the cover by the grass's own rule (2.5 m round), so no seam where the map ends. Bare soil on a grassy
  class keeps that class's snow (whole: trodden, a zone's breadth of snow showed the snow's pattern repeating). `?bench=earth` benches it off and on.
- **The season turns what is green** (`groundSeason` in `shore.glsl`, every ground colour's season): a colour takes
  the whole turn as far as it is green, a quarter of it where green is no higher than red or blue (the pale road, the brown track, bare earth, stone, gravel,
  a cut bank, dry gold), for the autumn turns; winter mutes every colour as before. So a ploughed field or a bank does not melt into the autumn meadow, smoothly across every edge.
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
- **The ground's bounce** (LC4, `docs/plans/done/lc4-bounce.md`): in `paint()` under `BOUNCE`, light from below in
  the colour of the ground under the point (`bounceAt`: the class's colour through the season and the mood's earth,
  toward white as snow lies), on faces looking down or sideways, in the shadow and mid bands, times the occlusion, by
  the mood's `bounce`. Trees and stones (`nature.frag`), the crowns (`canopy.frag`) and the army blocks (`block.frag`)
  take it; the trees' old 15 % albedo tint toward the ground is gone. Units take its full hue (a local cast the eye
  does not balance away) at `units.bounce` of its strength. `?bounce=<0..2>` tries a strength.
- **The ground's bounce on the ground** (LC5, `docs/plans/done/lc5-ground-bounce.md`): the bounce map
  (`groundBounce` in `src/look/bakes.ts`, `gbounce.frag`), 512 texels a side over the tile (about 1.6 m, 1 MB),
  rendered top-down with the light map's camera after it, and again whenever the season, the shadows' switch or the
  grain change and then hold for a frame (`src/look/main.ts`: a dragged slider rebakes when it stops; the checks set
  `S.season` directly): at each texel `bounceAt` gathered over a 7 by 7 Gaussian (taps 2.7 m apart, sigma 4.5 m, the
  fields' snow lie at each), the light the ground around sends back, its own the most. Read where `GROUND_BOUNCE` is
  defined (`groundBounceAt`, `groundFill` in `painter.glsl`): the tile's and the hill's terrain, the water's shore
  band (so it paints as the ground beside it) and the meadow's clumps (at their root): `alb × the map × the mood's
  groundBounce × the cast shadow × occ`, out of the sun's band, a third of it on snow so its shadows stay blue,
  fading out over the tile's last 32 m (the apron has none). A
  crown's shadow on a sunlit field takes the field's colour; a slope turned from the sun is not lit by it (it kept the
  hill's modelling), nor a wood's floor (its neighbours are in shadow). The far ring has none (the light map does not
  cover it). `?gbounce=<0..2>` sets the strength (0: off, the same frame as without). The bake: about 7 ms on the M1
  Pro's GPU (Metal), about 1 s under SwiftShader; `window.__look.gbBakeMs()` measures it.
- **The scatter follows the cover:** grass, flowers, plants, bushes, stumps and logs on grass; wheat on wheat;
  the point and eight points 2.5 m around it must all pass (the painted edges wander that far). Anything on a road, a
  track or village ground, and a tree or a stone within that reach of a field or bare earth, is placed but not drawn
  (`addPlaced` returns `'hidden'`, and its callers skip its crown's shadow, occlusion and reflection), so the scatter's
  random stream, and every tree after it, stays where it was (`docs/plans/done/default-map.md`); the lone field trees
  under `?trees=gen` stand in the fields on purpose. **Ground bounce:** trees take 15% of the ground's colour under their root into the albedo
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
- **Band edges:** never narrower than two pixels' change of the light value (`fwidth`) nor than 0.12 of it, baked
  shadows included: where they step within a pixel the edge comes out about two pixels soft.
- **The band follows the light** (`docs/plans/done/ground-light.md`): on the ground the band is chosen from the sun's
  angle, the cast shadow and the occlusion, with only a small grain wobble (0.2 of the grain) at its edges; the
  grain and its 21 m blotches vary the value inside a band. Before, the grain chose the band too, and near an edge
  (a gentle slope, a cloud) it cut the ground into hard-edged islands of the darker band.
- **Cloud shadows** darken and cool a painted colour (`cloudShade`: `CLOUD_SHADE`, a deeper blue `CLOUD_SNOW` on
  snow, where a white coat reads by that contrast) instead of dropping its light into a darker band, on every painted
  material (the ground, the meadow's blades, trees, buildings, units: `docs/plans/done/units-cloud-shade.md`).
  `cloud()` deepens from a cloud's edge to its middle (0.59 to 0.72 of the cloud field) for every material: light
  near an edge, full inside (main's patchy shade on snow did the same by islands).
- The pixel's angle is a uniform (`uPixA`) from the camera's actual vertical field of view, so on frames wider
  than 16:9 (which keep the horizontal one) the grain still spans the same share of the frame's height.
- The 21 m blotch term reads the same planes at its fixed world size, renormalised the same way. Snow and flowers are
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

### Generated trees (the default; `?trees=gen,cards`)

The plan: `docs/plans/done/tree-generator.md`; decision 0031; the method: `docs/research/procedural-trees.md`.
The default since `docs/plans/done/gen-trees-default.md` (the owner, 2026-10-15): the look page draws the generated trees
with leaf-card crowns unless `?trees` says otherwise; `?trees=pack` draws the pack's trees, `?trees=cards` the pack's
crowns as cards.

- **The models** (`prototypes/tree-core.js`, a plain script the page imports under `?trees=gen`, the default; `addGenerated` in `src/look/nature.ts`):
  four seeded variants per species, added to the pack as `Gen_<species>_<n>`: the crown clumps as foliage, the limbs
  as bark, and per crown vertex its clump, the clumps' ellipsoids and the twigs as their own mesh. The pack's trees are
  drawn as species by a share each, picked by the place (`GEN_FOR`: broadleaves oak, lime, beech; birches; willows
  and alders; pines and spruces), each sized so its reach in plan is its pack class's mean; the model placed decides
  where a tree stands, as without `gen`, so the scatter's stream and layout are the pack arm's (checked: the same
  non-tree instances), and a generated tree that would reach farther than the placement rule allows there is drawn
  smaller, to the placed model's footprint. An orchard, a hedgerow, a row of poplars, a forest of about 90 trees in the open south-west (broadleaves, a
  spruce patch on one side, birches and hawthorns on its edge), a wood of about 40 in the north-east and two dozen
  lone field trees come from their own random stream (`extras`), so the scatter's is unchanged; each passes the
  placement rule. No copper beech: the palette's tint already turns about 5% of crowns copper.
- **The far woods** (`buildNature`'s far list, `farCuller` in `src/look/nature.ts`, docs/plans/done/trees-perf-trunks.md):
  under `?trees=gen` the far ring's hedgerows and woods (r 190 to 640 m) are the near scatter's generated trees, with
  their cards, leaf fall and twigs (`drawGroup`): two of each species' four models, each item sized so the larger of
  its reach in plan and its height over 1.8 (`SIZE_H`) is `Bush_1`'s footprint at the item's scale (an oak fills it, a
  birch or a spruce stands taller and narrower, none reaches past the placement rule's footprint). The hedgerows are
  mostly hawthorn with the odd oak (1.6 times their size where that fits, its item scaled), every other item as the
  bushes were; the woods every item, oak, beech, lime and birch, about one wood in four mostly spruce. **Culled per
  instance:** one mesh a model holds every far instance (no box culls a ring); just before the game camera draws, the
  instances in its frustum (a sphere holding the crown and its cards) are packed to the front of the buffers: nearer
  than 190 m with their cards, past 250 m with the model's own crown mesh, and between (`CARDS_M` 220 m ± `FADE_M`
  30 m) with both, the cards giving way to the crown pixel by pixel (a dither offset per tree by its tint, the
  instance's `aFade`): no pop as a tree crosses it. The crown mesh is lit as the cards are (`FAR_CROWN` in
  `nature.frag`: each vertex its clump's ellipsoid, the soft ramp, the crown's own shade along the sun, the darker
  core), with the cards' volume light only; its bark draws only past the band, where no trunks mesh does. Without
  cards the crown mesh takes every distance; a deciduous far tree past the leaf fall's start keeps its cards at every
  distance (the crown mesh neither thins nor shows twigs). Until every far material is compiled the far meshes draw
  all their instances (600 frames at most). The shadow pass bakes with every far tree and its cards (`farCull.all`).
- **The trunks' shadows** (`trunkShadows` in `src/look/bakes.ts`, `trunkshadow.*`): a trunk is thinner than two of
  the shadow map's 0.33 m texels and the soft filter washed it out. Each drawn tree's trunk (its bark's radius at the
  foot times 0.6, `TRUNK_TAPER`; its crown's lowest point) is drawn into the light map's sun after the terrain, once,
  multiplied in: a quad on the ground from the root away from the sun to where the crown's shadow starts, crisp at
  the root, softening along it, 0.85 dark (`TRUNK_DARK`). Nothing a frame. The light map's 0.52 m texels keep the
  strips (at 1 m they vanish: the light resolution test, `docs/plans/active/lightmap-half.md`).
- **One volume per clump** (`cardMesh(…, clumpVolume)` in `src/look/canopy.ts`): each card carries the ellipsoid of
  the clump it stands on in `aEllC`, `aEllR`, so L7b's light runs per clump; `?clumpvol=off` gives each crown one
  ellipsoid, as the pack crowns have. A column's cards are sized to its width, not its height (`cardOpts`).
- **Leaf fall** (`LEAF_LOSS` in `src/look/shaders/cards.glsl`, the curve in `LEAF_LOSS` of `canopy.ts`): a deciduous
  crown's cards drop by their own draw (`cardDrop`: the card's rotation and place) as the season passes late autumn,
  most of them by winter, and the cards left shrink to half (`tuftScale`); the shadow pass cuts the same cards
  (`depthCardsLoss` in `src/look/bakes.ts`, its season stored on the material before the pass: thin instances draw
  with an effect of their own). Conifers keep their cards.
- **Twigs** (`TWIGS_FROM` in `nature.ts`): a thin-instanced mesh per model beside the trunks, drawn from season 1.4,
  casting into the sun's pass.
- **The season on this page:** what is baked follows the season the page opens in (`?season`): the shadows, and the
  sky each crown hides and its contact core (lighter as a crown loses its leaves). Releasing the season slider re-bakes
  the shadows when what casts them changed since the last bake (`shadowState`); the sky's occlusion stays the one baked on load.

### The buildings

The owner's Tripo models (`assets/buildings`, git-ignored; art bible §10) go through `tools/building-to-js.py`
(Blender headless; its header has the commands) to `prototypes/buildings.data.js`: metres, normals sharp past 30°, UV0
and a role per face (0 wall, 1 roof, 2 timber, 3 opening, 4 accent). The models are Tripo's own low-poly exports
(`docs/plans/done/tripo-lowpoly-buildings.md`: 1,454-1,794 triangles, kept as made, the windmill's lattice sails
with them; the first models' cut and rebuilt sails are in git history, `docs/plans/done/buildings.md`). The role is the
most common class of the face's texels other than opening and shutter (each texel's colour nearest in Lab to the
model's reference colours, with priors on the face's orientation, a roof faces up, a wall and an opening stand, and
height, the house's terracotta chimney pots); a face too small to hold four texels takes the median colour under it. A
low-poly model paints its windows and shutters across larger faces, so a wall's or timber's texels of the opening or
shutter class are kept as inlays (the detail texture's G and B: only near-rectangular parts, closed and their holes
filled, off any texel a face of another role covers), which `building.frag` paints in the opening's and the model's
shutter colour on wall and timber faces only (a mask's texel at an island's edge or in a coarser mip never reaches a
roof). Pack colours are never used: the page paints each role from its palette (`src/look/buildings.ts`, `PALETTE`,
muted against the armies), and the texture keeps only its value over its local mean (a box of texels round each, the
inlays left out of it: `data/buildings/<model>-detail.png`'s R, 128 = 1, 1 on an inlay), a third of it showing
(`DETAIL_AMT`) under the paint's grain (`shaders/building.frag`: the painter's ramp, the cast shadow, the sky's
occlusion, the ground's bounce, the snow on what faces up, the air). One instanced mesh a model. Placed in
`src/look/world/buildings.ts` (authored: the windmill in the large wheat field; six houses in an irregular cluster in
the village, four stone cottages, a farmhouse and a small manor, each turned a quarter turn of its own and a little
more: doors to the road, a gable to it, side-on, a back
to it), each on its footprint's lowest ground, sunk 0.2 m. The turn is Babylon's instance yaw, verified against its
Matrix (`test/buildings.test.ts`) and on the page: a local point (x, z) goes to (x cos + z sin, −x sin + z cos)
(`toWorld`, `toLocal`: the one rule the footprints, the yards, the ground's samples and `pavePaint`'s frame use); the
models' fronts face −z before it, so a yaw of π/2 faces west. Each stands in a paved yard (`pavePaint` in `shore.glsl`,
in `roadPaint`'s path, under `PAVING` on the yards' ground material only, `terrain` above, `PAVING_FAR`, the far look
without a texture, on the macro bake; only on a yard's cover texel, which names its building in B, the furrows'
direction, read only where a field's id is (`YARD_BASE` plus the index of the one yard within reach of the texel, so a
pixel evaluates that shape alone; `YARD_ALL`, every shape, where two yards are that near: `src/look/world/cover.ts`), and
before the roads' gate: a yard's texels are worn by their distance to the lines (the village's own ground by 0), so a
yard far from a road skips the road search as the rest of the map does; the yard's edge noise read only near its edge; the cobbles ride in the road grit's G and B, `data/road-grit-v2.png`, made by
`tools/paving-pack.py` from the grit and `data/paving-v1.png`: their colour along its two principal axes about its mean,
so the paving binds no texture unit of its own. Metal allows 16 a fragment shader (SwiftShader more: a 17th, the paving's
own texture on the water, compiled in the checks and kept the page from ever getting ready on the owner's GPU):
`Materials.make` counts each compiled program's fragment-stage samplers (`MAX_SAMPLERS`; the counts at
`window.__look.mats.samplers`), logs a material over them and stops the page at its next frame; `tools/shot.mjs` stops a
run on a shader Babylon cannot compile and has no fallback for): the owner's cobbles (4.5 m a repeat) over its footprint grown by a margin
(the house's by 2.5 m and by 6 m before its door; the windmill's a 3 m ring), the exact shapes as uniform arrays
(`paveShape`, ≤ 16), the edge ragged by a noise-wobbled distance (up to `PAVE_WOBBLE`, 1.15 m, past it). The cover
paints each yard and a margin round it (`PAVE_WOBBLE` + 0.71 of a cover cell + 0.3 m) as the village's ground worn to
nothing, so no grass, crop, tree or stone grows on it and only the road split's live material reads it (its roads and
tracks keep their class); past that margin the yard's distance feeds the wear as the village's ring does, so the
trodden edge fades. The cover's authoring fails if a yard comes within that margin of a road or a track, reaches a
formation zone or the floodplain (a point every metre over it), or lies within `PAVE_GAP` (4 m) of another yard. The
paving's level of detail is the roads': the cobbles fade out from a 7 cm to a 22 cm pixel footprint into their mean in
a soft blotch over a few metres (no texture read past it), which the macro bake paints too. The detail texture is the
texture's value over its local mean (box-averaged to 512²); the buildings look the sun's shadow up 15 cm off their
surface and break their band edges with a third of the ground's grain (on flat faces the full grain and the shadow's
self-test made specks). Static: their shadows go into the sun's bake with the scene's meshes, the sky they hide into
the light map's occlusion as a blob at their foot (the trees' contact).

The buildings' static light is baked once (`src/look/building-light.ts`, `docs/plans/done/building-light.md`): an
atlas of one 256² tile an instance, square-ish (⌈√n⌉ tiles a row: seven in 768 × 768 RGBA8, within the GPU's largest
texture or a clear error; the raw bake 2.4 MB and the atlas the buildings read with its mips 3.1 MB, about 5.5 MB), each building drawn in its light UVs (`aUV2`, a second layer the import makes: Blender's smart
project; about 20 cm a texel on a house, 27 on the windmill, measured) with the sun's cast shadow (`shadowAtRaw`, 0
lit to 1 shadowed, the panel's switch applied at runtime), the light map's sky occlusion, mist mask and sun. Each face
covers a texel however thin: its corners drawn as points and its edges as lines before its faces (only 55 % of the
faces hold a texel's centre: the timber, the frames, the sails' sides; with the outlines every face has a written texel,
read back). One pass fills four texels round every island from the nearest written one (rings out from the texel, until
no nearer can be; at once in an 8² block with no written texel within four, most of a tile: an occupancy pass first)
and every texel past them a
neutral light (no cast shadow, open sky, no mist), then the engine builds the mips as the pass unbinds the atlas; the
atlas is that neutral light until the first bake. Read no coarser than level 1 (`MAX_LOD`): a level-1 read reaches 2
texels (`REACH`) past the texel it is in, and the islands' texels (all a face touches) are at least 5 apart
(`MIN_GAP`: the export fails otherwise, and a test checks the data), so no neighbouring island's light comes in (level 2
would need 9 apart); at the widest zoom 93-98 % of a building's pixels want a level under 2 (720p, measured with the
finer texels before). A clamp in the shader, not the texture's `TEXTURE_MAX_LEVEL`: Babylon sets that on cube maps
only, and set by hand it would be lost on a context's restore. A tile's islands keep 2 texels (`INSET`) from its edge,
so no read reaches a neighbour's tile (without mips the minified reads at the default zoom cost 1.1 ms more than the
runtime's taps, measured). Rebaked with the light map (after the sun's shadow map: a season's release, the leaves'
drop), with a new grain and on a context's restore (the atlas neutral until then), once the light map has held for a
frame (the start's chain of bakes makes one bake) and the buildings are drawn and ready (`__look.terrainOnly` hides
them; a bake Babylon would draw without a mesh not ready is not used). `building.frag` reads it once (`BLD_BAKED`) in place of
`shadowAt`, `LM` and `bounceAt`; the ground's bounce at each building's root is baked into a texel an instance
(rebaked with the ground's bounce map, the same way) and faded with the height at runtime, and now lights the walls
(`BOUNCE`, the baked path only: the runtime path keeps main's, without it). `?bldlm=0` restores the runtime path, as
WebGL1 always takes it (the bake's reads are GLSL ES 3's); `?bldbounce=0` drops the bounce (no target, no read). The
bake's time is read back on the bench only (it waits for the GPU): 28-108 ms on Metal on load (two loads, a busy
machine), 0.6-0.9 s a rebake in SwiftShader (1.7-2.4 s with the full dilation).

### The shadows' look

The plan: `docs/plans/done/shadow-look.md`.

- **The shadow band** (`shadowOf()`, `painter.glsl`): more saturated than the base and turned 25 % toward a cool
  blue violet, at the value the band had before, so dark coats keep their separation from shaded ground. The
  army blocks (`block.frag`, `KEEP_HUE`) keep the older band, so a coat in shadow loses none of its colour.
- **The valley mist** (`mist()`): thinner over cast shadow on the ground (to 55 % of its amount), less so above
  the ground; shadowed air is darker and bluer. With shadows off the mist is whole. Over the river a third of it,
  from the shoreline across the shore band, in the light map's mist channel (`bake.frag`, `waterMist`), so every surface there takes
  the same air: it washed the dark water pale (`docs/plans/done/dark-water.md`).
- **The edges** (`bake.frag`): the bake filters a shadow edge over 0.75 shadow texels a tap (was 1.2).
- **Contact** (`bakes.ts`): a dark core of 0.45 crown radii (at least about 1.6 m: the occlusion map is about 1 m a
  texel) under each tree, in the light map's alpha, which the ground, the water's shore band and the grass read
  (`groundOcc()`), and the crowns do not.

### The meadow and the crops (L5c, L5d)

The plan: `docs/plans/done/l5c-meadow.md`. A crop's clump stands straight (wider at its root, drawn in at its tip, its normals level) and the ground under the near grass and crops is darkened in the plant's deep tone, green or ochre, by its growth, within the meadow's reach (`meadowUnder` in `shore.glsl`, the terrain and the water's land side; `docs/plans/done/crop-depth.md`). On by default on WebGL2 (on WebGL1 the old scatter stays: the meadow reads a half-float texture in its vertex
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
  `paint()` (the ramp, the cool band, the sky in the shadow, the cloud as the ground's shade, `cloudShade`; no grain,
  rim nor snow): the painted ground's
  colour under the root (the macro bake, `groundArm`; the flat class colour on the other arms), darker at the root and lighter, warmer at the tip. In winter the clumps shrink under the snow.
- **The crops** (L5d, `docs/plans/done/l5d-crops.md`): the same slots grow a crop clump where the meadow map's A
  channel (the crops' growth: `Nature.crop`, a sown field, wheat, green crop or stubble, with the grass's rules,
  edge and shrink) is above the grass's growth: never both on one patch. The vertex shader reads the cover's class
  at the root (`uCover`) and the season (`cropLook` in `meadow.vert`): wheat standing up to `WHEAT_HEIGHT_MAX`
  (decision 0026) in summer, cut to stubble (`STUBBLE_HEIGHT`, `src/look/meadow-spec.ts`) through autumn and gone by
  late autumn; the green crop at `GREEN_HEIGHT`, lower under the snow; stubble fields at `STUBBLE_HEIGHT` until the
  plough. Narrower than grass, evenly sown (less clumping). Its colour (the owner): lime at the stalk's foot to the
  season's colour at the tip, the standing wheat gold in summer, turning orange while it is cut; stubble, the cut
  wheat's too, a pale straw over the darker soil (`stubbleTip`, no redder than the standing wheat), browning by late
  autumn; the green crop lime to olive. Ploughed fields grow nothing.
- **The combed meadow**, the default grass (decision 0041; `?grass=brush` the brush pattern before it, also the
  fallback without the meadow: WebGL1, `?meadow=off`; `docs/plans/done/grass-flow.md`; the research:
  `docs/research/painterly-grass.md`). It needs the bake arm (on the shader arm the meadow keeps the brush pattern).
  - **The flow** (`flowAt` in `shaders/meadow.glsl`, its numbers `FLOW` in `src/look/flow.ts`, given as defines): a slow
    map-wide lean and how far the grass lies over. Made once on load into a texture (`FLOW_TEXEL`, `src/look/flow.ts`;
    `flowTex`), which the ground, the bake and the clumps read; the field itself beyond the tile.
  - **The bake** holds the broad part (`combBroad`): soft bands where the flow leans to or from the sun (`FLOW_SUN`,
    fixed per map), soft masses, and the clump field.
  - **The strokes from a near bake** (`combNear` in `src/look/macro.ts`, `combDv`; the ground reads it in `groundAt`
    with one fetch, `nearComb`, `combFromDv`): the brush tile and a tiling comb noise (`uComb`, `COMB_PERIOD`) read along
    the flow in `FLOW_CELL` cells, rendered into a square round the focus (the strokes' ring and the step either side)
    again when the focus moves 6 m, on a baked arm at a zoom where the strokes can show (the marched focus depth in
    render pixels under twice `STROKE_FOOT`, the footprint `strokeK` fades to; the strokes in the ground's own shader
    cost about 1 ms on every terrain pixel: the plan). Lighter along the comb and a deeper green
    in its gaps; by the pixel's footprint (`strokeK`), over the inner ring only (`STROKE_RINGS`: the rings are centred on
    the focus, so the bottom of the frame stands under the sparser outer rings), by the meadow's growth (`uMeadow`,
    `meadowGrowth`), none under the winter's snow.
  - **Where no grass grows** (the formation zones, the banks) the bake holds the default pattern (`meadowPattern` blends
    the default's and the combed by `meadowGrowth`: the meadow map is built before the bake, `buildMeadowMap`).
  - **The clumps** (`meadow.vert`, `meadow.frag`): up close (`CLOSE_ZOOM`, the inner rings) wider and a little taller
    (never over `HEIGHT_MAX`) and fewer thinned between the patches, leaning with the flow, a hue each (`vHue`); as the default's under the winter's snow. They
    read the bake alone. Their roots keep `CLUMP_REACH_FLOW` from the formation zones and the banks (crops keep
    `CLUMP_REACH`), which `tools/river-check.js` checks at the page's reach (`__look.meadow.reach`).
  - **The seasons:** `groundSeason` keeps the pattern's value through autumn where grass grows (`pFlowGrow`).
  - `?grassoff=strokes,dense,big,hue` turns one part off, for the cost's ablation (its numbers: the plan);
    `__look.flowBuildMs`: the flow textures' time on load.
- **Ring chunks culled on the CPU** (`cullRing` in `src/look/meadow.ts`, `CHUNKS`, both arms): only the chunks in view
  and in the band drawn, their slots packed into the instance buffer when the set changes (a ring with none is not
  drawn); the vertex shader still culls each clump.
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
camera: `l2` (the page) and `l0` (the L0 grain on the terrain); `?bench=dof` `nodof` and `dof` (the bench page opens
with the blur off unless its URL sets `?dof`, as do the debug views, `?water` and `?river=debug`, which write no
distance to alpha). `?benchat=<x>,<z>` (within the play area) makes the
cameras orbit that point instead of the camera's start, and the JSON records it as `focus` (the forest bench).
`?benchr=<m>[,<m>…]` measures those radii at the start's pitch instead of close, default and wide (the LOD
cross-fade's bench, `docs/plans/done/lod-fade.md`).
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

### The armies (`?armies=<n>`, scripted; `docs/plans/active/armies-demo.md`)

`?armies=<1..40>` puts n battalions a side on the demo map (414 men each, the ruleset's drill: 5 about 4,000
figures, 10 about 8,000, 20 about 16,500, 40 about 33,000: `docs/plans/active/armies-32k.md`); not on the page by default, so the goldens and the look checks never see
them. WebGL2 only (decision 0046). Each switch below names the A/B it restores; the defaults are the measured best.
The page names no era (decision 0015): the demo's scenario (`src/scenarios/armies-demo.ts`) names its ruleset, unit
type, figure and uniforms, resolved through `src/rulesets/index.ts` (`RULESETS`: a ruleset and its uniforms by name)
and the figures' unit data by file (`data/figures/<figure>.unitdata`, a Vite glob in `src/look/main.ts`).

- **The figure**: `tools/bake-figure.py` (Blender, `-- <published figure dir>`) bakes the published GLBs into
  `data/figures/<figure>.unitdata` (`src/look/units-data.ts` reads and checks it): its LODs nearest first (here
  three: the full figure, 9,274 triangles, then 1,197 and 243; the page reads two or three), each vertex's colour role (the reds told from the skin by hue, the face's shaded side kept skin, the coat's violet shade kept coat: #133's review, `texel_role`, `tri_role`) (coat, facings, white, dark, skin, leather, pack, wood, metal: from the
  texture's colour, the musket by its bone, the pack by its place), its triangles in the glTF's order (the reflection
  into Babylon's left-handed space makes them the clockwise fronts Babylon draws: reversed, every man was drawn inside
  out, a face on the back of his head, #164; the bake asserts a negative signed volume, `test/armies.test.ts` too;
  format version 3, the decoder refuses 2), each bone's parent, and the bones' matrices at 12 fps for the clips
  each **role** uses (halt: Stand; march: Walking; run: Running; fire: Present, Aim, Fire, Reload), with the root
  speeds that keep the feet planted. The page names roles, never clips (decision 0015). At load: the far LOD posed at
  every step (`posedVertices`: a place and a normal, two float texels a vertex) and the **shadow proxy** built from it
  and posed (`shadowProxy`, `posedMesh`: two crossed quads along each part a bone carries, 112 vertices, 56 triangles;
  a bone too small to be a part near the ground, a foot, lends its vertices to the first part up its chain of parents,
  the shin, whose quads then run down to the soles by at most 25 cm, so the shadow starts at the feet: `boneParts`,
  #165).
- **The renderer** (`src/look/units.ts`): a thin-instanced host a battalion for each of the near LOD, the far LOD and
  the proxy; the near LOD skinned from the bones' texture (`texelFetch`), the far LOD and the proxy posed (`VAT_POS`;
  `?uvat=0`: the far LOD skinned); a man's step from his clip's first row, its length and his phase. Materials are
  per uniform and LOD. The figures are painted as the army blocks (`KEEP_HUE`, `BOUNCE`, `NOSNOW`) and blur by their
  depth (decision 0040). A battalion's instances are written when it moves (once a 1/12 s step) or changes phase; its
  LOD by the figure's height in pixels (48; the tiny LOD's 12), **cross-faded per man** (below; `?lodfade=0`: the hard
  switch, a battalion wholly at one LOD by its centre's height, ±10 %: `drawsNear`, `drawsTiny` in
  `src/look/units-data.ts`). **The nearest LOD** (a figure with three, decision 0051;
  `?nearestpx=<px>`, 0: none; keep it at least `lodPx` × 1.25, the near band's top, so the nearest LOD only takes men
  the near LOD would draw whole): a battalion whose bounds' nearest point is within 90 % of `nearestPx` (100 px) and in the view
  is split, each man whose sphere is in the view and who stands taller than it (±10 %) drawn at the nearest LOD, the rest
  at the near one (`setSplit`, `share`: the next LOD's buffers swapped to the rest's list; the lists written again
  when a man changes LOD or the men move); skinned like the near LOD. A battalion's nearest-LOD mesh and lists are made at its first split (about 1 MB of geometry a battalion otherwise), then disabled while unsplit. Only within about
  28 m of a man at 1080 lines (the closest zooms: 0 at 45 m); its shadow is the simple shadow (with the map, the proxy's). The pose's step is counted on the CPU (`uVATStep`, the clock's
  floor in double precision), so the figures and their shadows never disagree on a step; a battalion's bounds are
  padded by the tallest figure (2.6 m, as tall as the far figures grow) and the farthest reach of the baked poses (as
  wide as they grow), and by the next step's places. The view's corner rays are cast once a frame
  (`castView`) for the sun's box (with the map) and the trodden mask's.
- **The figures' shadow map** (decision 0047; since decision 0062 drawn only behind its switches, `?ushadowclose=map`:
  up close with the cross-fade below, 0049's default; `?ushadowfar=map`: at every zoom; without them its target, its
  uniforms and the receivers' reads are never made, `useMap`): a 2048² depth-only map (24 bits, a comparison sampler), the
  sun's box fitted to the ground in view's own heights and centred on what it holds, its near and far fitted along the
  sun. Drawn only when it would change (the poses' step, a battalion's men, the casters, the box; `?ushadowrate=0`:
  every frame), the box held while the view stays inside its slack of 10 % of the view's half-size, 6 m at least
  (`?smhold=fixed`: batch B's box 2 m round the view, which a pan refit nearly every frame; the trodden mask's refit
  goes with it); an empty map is drawn once and kept. Cast by the proxy (`?shadowlod=far`: the far LOD; `?ushadowlod=1`:
  the near LOD where drawn), shown to the map alone, from the battalions whose bounds stretched away from the sun by the
  longest shadow cross the view (`?ucull=0`: all in the box). The ground reads it by two hardware comparisons a texel
  either side of the point, turned by the grain (`unitShadowAt`: a brush edge); the meadow once a blade at its root
  (`UNIT_SHADOWS_VS`, `meadow.vert`; `?ushadowvs=0`: every pixel). The texel at r15 / r45 / r125 / r260: 2.9 × 2.1 (at the most oblique pitch; 1.8 × 1.8 at the steepest), 3.9 × 2.5,
  9.2 × 5.5, 18.4 × 10.4 cm in the sun's view (× 2.2 along the sun on the ground), the slack's 10 % on top while held.
  The merged mass under a battalion is the low sun's: 3.6 m shadows over ranks 0.85 m apart.
- **Their shadows: the simple shadows, at every zoom** (decisions 0049 and 0062,
  `docs/plans/active/simple-soldier-shadows.md`, `docs/plans/done/soft-shadows-all.md`; `?unitshadow=0`: none). Every
  soldier of a figure looks alike, so one shape: `shadowShape` (`src/look/units-data.ts`, at load) projects the far LOD,
  posed at up to 12 steps of each role's clip and turned to 16 facings, along the sun onto the ground, averages the
  steps (a marching man's legs one soft wedge) and blurs it; an RG8 atlas, mipmapped, a cell a facing and a role: R the
  shape, G the same blurred wider (`SOFT_BLUR`) and brought back to R's darkest value in its cell; the soft bake's
  reach is padded on in whole blocks of 8 texels, so R's texels and mips are where they are without it (`base`, the
  box R fills). Each soldier draws it himself, in the main pass after
  everything else (`unitdecal.vert`, `unitdecal.frag`): one more mesh a battalion on its own instance buffers, a 1 × 3
  grid a man (2 m a cell: the widest view is bound by its vertices) from his feet along the shadow, each vertex on the
  ground (the meadow map's height, or without one the heightfield's, sampled into a texture at load) and drawn toward
  the camera along its view ray by `?udecallift` (0.6 m, growing from 0 at his feet over 1.5 m so it never covers his
  own shins: over the grass and the legs of the men in it in depth, no shift on screen); his facing picks two cells,
  blended, read through the atlas's mips up to the third (a cell's border holds no further), his clip's first step his
  role's row, and it grows with the far figures (`FAR_SCALE`). **Its look a zoom** (decision 0062, `SHADOW_LOOK`):
  softness (the share of G against R), darkness (the share of the ground's full shadow) and length (along the sun past
  the soles: the grid's second row lies at the soles, so each triangle lies on one side of them and the feet stay put);
  along each shadow from the soles like a real one's (contact hardening): over a core (`core`, m) the shape itself at
  the soles' darkness (`foot`), then to the tip (a man's height over the sun's tangent, times the length) up to
  `soft` of the blurred bake and down to the tip's darkness (`dark`), fragment arithmetic on the distance along it
  (`vAlong`, at the shape's own size: the far figures' growth leaves it), no more reads. **The darkness is coverage**:
  every shadow darkens a sample it covers by the same amount (the look's darkest), covering a share of the samples
  (darkness ÷ darkest × the shape's value), so overlaps take the darkest whatever the draw order (the stencil still
  darkens each sample once; review round 1: as a colour, a light tip drawn first bit into the next man's contact, and
  the battalions' sorted order flipped while panning; `decalFragment` in `src/look/shadow-look.ts` mirrors the rule
  for its tests). Alpha to coverage with the scene's 4 samples; with fewer (`?msaa=1|2`; two samples would make the
  gradient one hard step where the driver does not dither) the share darkens the pixel, smooth, the first shadow
  there winning (overlaps order-dependent there; an empty texel marks none). Checked on Metal
  (review round 2): no contour bands along the gradient, overlaps no darker than the darker shadow alone.
  **The strip** (`decalStrip`, `uStrip` and `uRows`, set when the look changes): turned with the look by its far
  share, from the close one (the full box, the soft bake's reach, with rows at the soles and where the lift's ramp
  ends, so the lift, linear between rows, is whole there) to decision 0049's (the shape's own box, `base`, rows evenly
  spaced: the far zooms as main's, a third fewer fragments than the full box); the atlas stays anchored at `uShapeAt`
  whatever the strip; the decal's bounds padded by the soft bake's reach; up close softer, lighter at the tip, shorter, dark and solid at the feet; far 0049's look
  (one value end to end), turned from one to the other by a smoothstep of the camera's
  distance to its focus over `SHADOW_LOOK_BAND` (45 to 85 m; with `?ushadowclose=map` the far look everywhere).
  `?ushsoft`, `?ushdark`, `?ushlen` (`<close>[,<far>]`), `?ushfoot=<dark>,<core>[,<far dark>,<far core>]`,
  `?ushband=<r0>,<r1>` and `?ushgain` (`<close>[,<far>]`, 1 to 3; decision 0067: the full darkening's strength,
  its luminance raised to that power and the channels scaled alike, then spread over the pixel by the coverage as
  before; the hue kept where no channel is clamped at 0; `shadowShade`, `decalPixel`; 0067's 2 up close and 1.5 far
  (`docs/plans/done/shadow-darker.md`) are 1 since decision 0071, the switch kept; under `?ushadowclose=map` the cross-fade blends
  the map's shadow, which has no gain, against the gained decal) tune it live; `Units.lookNow` is
  this frame's. **The contact** (decision 0071, `SHADOW_CONTACT`, `applyContactParams`; off by default since decision
  0074, `?ushcontact=1` turns it on): a solid oval under
  each man's feet, the oval holding his feet at the step he is posed at (`contactOvals` in `src/look/units-data.ts`, a
  texel a VAT row; the vertex shader reads his step's, turns it with his facing and grows it by the pad, the fragment
  adds a `length` and a `smoothstep`), whole up close and to the default zoom, fading out over `band` (60 to 100 m:
  `contactWeight`). It is one more darkness in 0062's coverage rule (`contactFragment`), its core the shade k itself;
  with the look's gain 1 and soles 1 no part of a soldier's shadow goes darker than the ground's painted cast shadow.
  The shade is baked turned toward its own grey (`SHADE_DESAT`, `?ushdesat`; `unitshade.frag`), its luminance kept,
  so the soldiers' shadows take the trees' hue on the grass, not a blue-grey. The oval's material draws its strip past
  the shape's cell where the oval reaches (`contactReachOf`, `decalStrip`'s reach) and reads no shape outside the cell
  (`vCell`); the strip's edges hold the oval's whole fade (tested on the figure's every step, 64 facings). Past the
  band (`contactOvalOn`, `useDecalFor` in `src/look/units.ts`) the decal draws with 0062's own material. The material
  not drawn is compiled in the background (polled until ready, again after any change of the defines or switch); the
  switch waits until the wanted one is ready (`decalStep`), so a material not ready is never drawn. The oval's
  material lifts the decal at least `CONTACT_FLOOR` (3 cm; `decalLift`): its half behind the soles, otherwise unlifted,
  lay at the ground's sampled height and the terrain hid it there, cutting the oval along the soles. Without the
  scene's coverage (`?msaa=1|2`) a fragment of the oval's rim fainter than 0.02 is discarded as the sun shadow's faint
  edge is, so off the oval it draws as 0062's. Under `?ushadowclose=map` the cross-fade blends the map's shadow, which
  darkens to the ground's own shadow colour, against the decal's desaturated shade: the hue shifts a little across the
  band. `?ushcontact=<pad>,<dark>[,<soft>]` (0: none), `?ushcontactat=step|stride|root`, `?ushcontactband`,
  `?ushdesat`; `?ushstep=0&ushcontact=1` is decision 0071's look (main at 1093fdc3, tested to match),
  `?ushstep=0&ushdesat=0&ushgain=2,1.5&ushfoot=1.05,0.4` decision 0067's. **The shape per step** (decision 0074, the
  default; `docs/plans/done/step-shadows.md`, #229): `?ushstep=<steps>[,<facings>[,hold|blend]]` (absent: `8,8`,
  hold, `STEP_SHADOW`; 0: the averaged shape at every zoom) bakes the shape per clip step bin (k = min(n, steps) bins a clip, each the average of its own steps) and facing,
  the cells stacked in an atlas of as many blocks as keep it within 4096 texels a side (`stepAtlasLayout`,
  `shadowShape`'s `steps`); the decal's vertex shader picks his bin from his step (`stepBin`; `blend`: the two bins
  either side, `stepBlend`, four reads) under `SH_STEPS`, so his shadow steps with his pose at 12 fps. Only the near
  material reads it (within its band, 60 to 100 m, `NEAR_BAND`, `?ushnearband=<r0>,<r1>`: `nearWeight`, `nearOn`; with
  or without the oval, whose own band stays `?ushcontactband`); the far
  one keeps today's averaged shape, a second, small atlas. `?ushfootk=<boost>[,<reach m>]` (`footSharpen`) multiplies
  the per-step shape's share of the samples at the soles, back to 1 by the reach, so the feet go darker and
  crisper-edged; the share is capped at 1, so never past the ground's shade k (decision 0071's ceiling). By default
  3, 0.6 m (`FOOT_SHARP`, the owner's pick); 1 is none. At 100 m the near material gives way to the far one in one
  frame (a scatter of foot pixels changes: the plan, "The 100 m edge"). A GPU whose texture size cannot hold the
  per-step atlas (`AtlasTooLarge`) draws the averaged shape at every zoom, with a warning, and sets
  `Units.stepFallback` (`window.__units.stepFallback`, for the benches and the guard); an explicit `?ushstep` is then
  an error at load. The shader takes his step as `units.vert` poses him (its `int()` of the clip's first step plus the
  `mod`), wraps the exact n a GPU's `mod` can return to 0, and takes the bin in integers, clamped (`stepIndex`,
  `stepBin`): his shadow's step is his figure's on every GPU.
  The fragment reads the atlas and the ground's shade:
  the shape's value is the pixel's coverage (alpha to coverage, the scene's 4 samples), the stencil lets only the first
  shadow at a sample through, and the blend (dst · src, the alpha's lens codes kept) darkens it to the shade there: so
  a formation's overlapping shadows darken each sample once, at every distance (with fewer samples, `?msaa=1|2`, the
  value scales the darkening and the first shadow at a pixel wins). **The shade** (`src/look/bakes.ts` `unitShade`,
  `shaders/unitshade.frag`): the ratio of the ground painted in a full cast shadow to it painted as it is (the baked
  shadows, the occlusion, the bounce, the season), top-down over the tile at the light map's texels (0.52 m), rebaked after the
  bounce map and when the occlusion's switch changes; so the darkening is the map's on the same ground (the air on top
  is not in the ratio). **The stencil**: only on the scene's target (the first finishing pass's, `MSAA.stencil` in
  `src/look/post.ts`) and only when the simple shadows are on: its depth is DEPTH24_STENCIL8 then, else DEPTH32F as
  before; the canvas has none (`?stencil=all`: the engine's own on every target, the A/B; `0`: none; the rule is
  `stencilFor` in `src/look/shadow-look.ts`, tested). No render target
  and no reads in the receivers. Each man's shadow
  moves every frame with smooth places (below: `aNext`, his move to his next step's place, written with his place;
  `uStepFrac`, the share of the step gone, from the CPU's clock), else at
  the steps with his figure. **The cross-fade** (only with `?ushadowclose=map`): by the camera's distance to its focus, from the map alone at 60 m to
  the simple shadows alone at 85 m (`SHADOW_SWITCH`, `?ushadowswitch=<r0>,<r1>`; the LOD switch, 48 px at 1080 lines,
  is at 63 m), `uUnitFar` their share: the receivers take 1 − it of the map (`unitShadowMix`), the decals it of their
  darkening; the map is drawn only while its share is over 0, and fitted afresh when it comes back. (First built as a
  top-down mask the receivers read; replaced: fill-bound at 40 a side, the plan.) The dirt's and the earth's textures
  are packed in one (`uSurf`, R and G, `src/look/macro.ts`), built for the mask's texture unit, kept as headroom.
- **Smooth places** (on by default, measured free: `docs/plans/active/simple-soldier-shadows.md`; `?smoothmove=0`: off):
  the figures, their flags and the map's casters move by `aNext` × `uStepFrac` too (`SMOOTH`, `units.vert`,
  `flag.vert`), and the simple shadows with them, the poses still stepped at 12 fps; the map is then drawn every frame
  the clock moves while a caster's men move. Off, the figures and their simple shadows move at the steps.
- **Uniforms** (the owner's calls 2026-10-22 and 2026-10-26, decision 0068, `docs/plans/active/dye-palette.md`): a
  battalion wears a uniform by id, whatever its side. A uniform (`Dress`, `src/sim/ruleset.ts`; the era's in
  `src/rulesets/napoleonic-uniforms.ts`; the demo's sides' in `src/scenarios/armies-demo.ts`) names a dye per cloth
  part (coat, facings, trousers, waistcoat, headgear, greatcoat) from the era's dye set
  (`src/rulesets/napoleonic-dyes.ts`: cloth dyes, the flags' own dyes, the materials, the boots' dye), and its flag's
  bands by flag dye. The page resolves it onto the figure's roles (`src/look/world/dyes.ts`, `dressed`,
  `FIGURE_PARTS`: the white role shows the trousers, the dark role the boots, the neutral roles the materials) into
  a `Uniform`: its colours by role, its flag's, and its **far rule**: from above, a
  far figure shows its headgear, pack and leather more than its coat; under 'coat' those roles take the coat a value
  step down (`farPalette`, `FAR_ROLES`), crossfaded in as the figure shrinks below the near band (`FAR_FROM`), with the trees' and
  hills' shadow on it halved and a warm rim on what faces up (`FAR`); under 'own' the far figure keeps its own. Unset,
  a coat under luminance 0.18 (Rec. 709 on linear sRGB, a mid grey: `FAR_COAT_BELOW`) takes 'coat'. `?farpal=0|1`
  forces the rule off or on for every uniform. Test switches: `?uniforms=all` dresses each side's battalions in the
  scenario's `reviewSides` in turn (`wearInTurn`: the era's eight uniforms on the demo map), `?uniforms=all-greatcoats`
  the same with every man in his greatcoat (over the coat and facings; the share by the cold is the plan's later
  step); `?dye=<dye>:<rrggbb>[;…]` (the hex bare or with its `#` as `%23`, e.g. `?dye=imperial-blue:1F2B52`) swaps cloth dyes' values for every uniform that names them (`dyeOverride`). A
  malformed value, an unknown dye or uniform throws. The checks' blocks take four uniforms' coats from the same data
  (`tools/army-blocks.mjs`, `BLOCK_UNIFORMS`; `ARMY_COATS=<name>=<rrggbb>,…`, four, the `#` optional, for other coats).
- **The tiny LOD** (`docs/plans/active/armies-32k.md`, step 3, experimental; `?tinylod=0`: none, `?tinypx=<px>`: its
  switch): a man whose figure falls under 12 px tall draws the far LOD's parts as boxes instead, each man at his own
  height in the 9.6 to 15 px band (the LOD cross-fade, below; `?lodfade=0`: a battalion under 12 px, ±10 %; `tinyMesh`,
  `src/look/units-data.ts`: the shadow proxy's parts, `boneParts`, 8 shared corners each, 112 vertices, wound with
  their fronts out as the figure's, #164), a corner's
  colour a mix of the roles (`TINY`: three vec4 weights) calibrated at load so the boxes show each role in the far
  LOD's seen share (`seenArea`: both rasterised from 8 sides), posed as the far LOD and painted by its material (far
  palette, lift, growth, the smooth moves between steps); the coat mask dithered by the coat's weight (a 4 × 4 ordered
  dither); it never casts into the map, and its men keep their simple shadows (decision 0049) as the far LOD's do. A
  host's LODs: the figure's nearest first, the shadow proxy, the simple shadow, then the tiny LOD (built only when on).
- **The LOD cross-fade** (decision 0066, `docs/plans/done/lod-fade.md`, #188; `src/look/lod-fade.ts`, tested in
  `test/lod-fade.test.ts`; `?lodfade=0`: the hard switch): in a band round each switch (`NEAR_FADE`, `TINY_FADE`: 0.8
  to 1.25 × it) a battalion draws both LODs and each man is drawn at his own LOD by his own height on screen (his
  root's distance, as the far palette's), switching at his own point in the band (`manHash` of his index in his
  battalion, `aMan`: an instance attribute written with each list, so a split battalion's reordered lists hash him
  alike) over a fade of his own (`FADE_WIDTH`, 35 % of the band on a log scale) by the 4 × 4 ordered dither: a
  pixel's threshold picks exactly one LOD (`lodCover`, `drawsPixel`, `dropsMan`; `units.vert` and `units.frag` mirror
  them under `LODFADE`, `LOD_SLOT`; the cover snapped to the dither's 16 levels, `snapCover`, so interpolating it
  cannot flip a pixel: a flat varying cost 1.5 to 4 ms of GPU on ANGLE's Metal), so a man is never hidden and nothing
  is blended or sorted. The exact split also needs a man's share bit-identical in the three LODs' programs: the same
  inputs (his root from the same pose and move, the shared uniforms) and the same arithmetic; the snap
  leaves 1/32 between a share and a threshold for any difference, and absorbs the CPU's float64 against the shader's
  float32 at a band's edges (`lodsDrawn` may draw a LOD whose men all drop). A LOD's men outside it are dropped in the
  vertex shader before their pose is fetched (off screen). A battalion draws a second LOD only
  while one of its men can be in a band (`battalionLods`, `lodsDrawn`, by its bounds' nearest and farthest points,
  `boxPxRange`); one drawing a single LOD skips the per-man work (`uLodFade` 0, set as each mesh binds the shared
  material). **A split battalion fades too**: its near LOD draws its men not at the nearest from their own list, each
  at his own LOD, and its far LOD the band's share of them, so the nearest LOD's switch moves no other man (the
  review's finding: before, its men inside the near band were forced near while split, a pop at the split's on and
  off). The far palette, lift and growth start at the band's foot (`FAR_FROM`, 0.8 × the switch; 0.9 with
  `?lodfade=0`), so they are 0 across the band. The tiny's coat mask rescales the dither's threshold over the share the
  tiny draws (the guard's coat share unchanged in its band). Measured on Metal (the plan): the step a switch made in
  one frame (1.2 to 3.4 ΔE on a battalion's block) spread over the band; the LODs' colours still differ (the far LOD's
  coverage and facings, the tiny's mix), the fade spreads it.
- **Far figures larger** (`?farscale=0`: their own size): the far LOD grows as the figure falls from the near band's foot
  (`FAR_FROM`: 80 % of the LOD switch; 90 % with `?lodfade=0`) to a quarter of it, across up to 1.35 (capped at 95 % of a file: 1.21 here; `farWidthScale` in
  `src/look/units-data.ts`) and 1.15 tall; render only.
- **Trodden ground** (`?trample=0`: none): a 256² mask over a box round the ground in view (64 to 1,024 m), drawn on
  the CPU (each man where he stands and up to 3.8 m behind him) when the box moves or at most every 0.25 s while men
  move (a view that leaves the box refits it at once; a box grown over twice the view refits by the wall's clock),
  about 1.1 to 1.6 ms a draw at 16,560 figures (this Mac); the ground and the meadow read it in their vertex shaders
  (`TRAMPLE`; none outside the mask's box): the grass shorter, splayed and drier, the ground toward a dusty earth in
  summer and a grey-brown slush in winter, broken by the grain.
- **Flags** (`?flags=0`: none): one a battalion, its uniform's flag on a 3 m staff with the colour bearer (the line's
  centre file, second rank), the cloth downwind and waving at 12 fps, never under 12 px tall (up to 5 times its size);
  one thin-instanced mesh, hidden with the figures (`show`).
- **The script** (`src/look/world/armies.ts`, deterministic, the sim's stand-in): each battalion in line marches 36 m
  in column of companies, halts 4 s, deploys into line at the run, pauses 3 s, then fires by ranks (1.4 s apart) until
  its 110 s cycle starts again; battalions are 9.7 s apart in the cycle. **The layout** keeps every battalion's whole
  footprint within the camera's play area (±235 m): the lines, up to two footprints deep behind each side's front
  (110 m apart), the front row and the middle first, each with its approach behind it clear; the rest are reserves in
  column of companies at least 40 m behind the front, clear of the lines' footprints, the nearest first (5 m grid).
  Water, trees (bushes are walked through), the buildings' yards are kept clear, and it throws when a side has no room.
  On the demo map 20 a side is 4 and 3 battalions in line, the rest in column. When the reserves leave a side short
  (40 a side; never at 20 or fewer on the demo map, whose layout is unchanged: a test hashes it), **close reserves**
  fill in: more columns on a 2.5 m grid, 6 m apart men to men, taking each line's footprint as its T (its ranks' full
  width, its approach only as wide as its column) and the trapezoid its companies cross as they deploy (as wide as
  the line at the ranks' depth, as the column at its rear: four boxes), so they may stand behind a line's flanks,
  never ahead of a line nor in a deploying company's way (the test checks every man's path at 40 a side).
- **The sim** (`?armies=<n>&sim`, battle threads PR 4b, `docs/plans/done/battle-threads.md`): the same layout, the
  battle played by the sim in its workers (`src/look/sim-armies.ts`, on the look world's sim map
  `maps/painted-world.ts`; on the page when it cannot share memory with them): each battalion spawned where it is laid
  out by a command (so the session replays), in column, firing at will; it marches to 90 m short of the fight's middle,
  then deploys into line. The renderer takes each man from the sim's men (`src/look/sim-men.ts`) in place of the
  script: his place, his way and his gait, the frame's (the men worker works them out, `SoldierLayer.orient`, battle
  threads PR 4c: his velocity's way, at rest his formation's heading; run over 2.2 m/s, march over 0.3, else halt),
  his role from his gait (fire while his company's volley is under 0.6 s old) and when it began; the fallen are not drawn (at
  no size, under the ground; the colours at the battalion's centre). A battalion is re-placed when the men worker's
  revision of it moved on (it stepped its men, matched them again, or a company fired: `Unit.rev`, published in the
  frame's battalion table) or its last volley went stale, at most once a 12 fps step of real time (stepped as
  published: no moves between steps, the art bible's), the frame's share of them spread over the frames a step has
  (every one once a step at any frame rate), looked at in turn. Its
  battalions are matched to the sim's formations by side and spawn place (and their generation), its figures to the
  formation's men in their order.
- **The men's instance lists** (battle threads PR 4): a battalion's men are four lists (poses, clips, moves,
  indices), each one instanced GPU buffer of the battalion's that all its LOD meshes read (`Lists`, `bindLists`), so a
  battalion placed is one upload a list, not one a mesh; the nearest LOD's and, while split, the next's lists are
  their own (`setSplit`, `share`; only the men each draws sent). The meshes have no Babylon thin instances: their count
  is `forcedInstanceCount`. A man's place is a 16 B pose (x, y, z, his turn about y) in place of a 64 B matrix, read
  as `world0`, the instance matrix's first column that Babylon's instanced materials declare (`world1..3` unread and
  unbound; an attribute of its own put the tiny LOD's material over WebGL's 16 attributes); `units.vert` and
  `unitdecal.vert` build his matrix from it (`#include<unitPose>`, `src/look/pose.ts`, tested against Babylon's
  `Matrix.RotationY`; a man under −HIDDEN/2 m at no size), so the meshes stay at the identity. The moves (`aNext`) are sent only when a placing changes them: the
  sim's men have none between steps, so theirs are sent once, as zeros. The page's checks read the men by `poses()`
  (`tools/look-check.js`).
- **Measured**: `node tools/guard.mjs <url?armies=n> --figures`: per side, the figures' luma against the ground's at
  their pixels, the coat role's share of them, the share within ΔE 25 of the coat colour (not gated).
- **The bench**: `?bench&armies=n` with no `?benchat` orbits the fight's middle (the two sides' nearest battalions in
  line, `facingAt`). `?benchpan=1` pans each camera as it is measured (20 m either side at 8 m/s). `?benchtrace=1`
  records every measured frame (version 9): its interval and what happened in it (`src/look/trace.ts`: the figures'
  shadow map drawn and its casters and triangles, the sun's box refit, the trodden mask drawn and its CPU ms,
  battalions placed and place()'s and frame()'s CPU ms, thin-instance uploads and their KB and ms, the flags' update,
  every render target drawn by name and every effect-renderer bake as `fx:<name>`, shader compiles, active meshes, draw
  calls, the frame's JavaScript ms, the page's sim tick's ms at `?sim`), and `traceSummary`: per zoom and arm, each event's share of the frames over their
  run's 90th percentile against its share of all frames (the enrichment), printed by `tools/bench-look.mjs` with each run's main-thread work outside rendering (the sim tick, the
  placing, the uploads) and its long tasks (every run: those begun in its measured window, `longIn`; Chromium's) (and
  `--print <json>` for a saved run). Timings come from untraced runs; the trace explains them. Off, nothing is hooked;
  on, it patches no prototype the render loop calls per mesh and looks nothing up by name a draw. Hooks: `__units`
  (`drawn()`, `figures`, `battalions`, `setMask`, `show`), `__armies` (`blocked`, `focus`, `coats`).

### The readability guard (L2a)

`node tools/guard.mjs <url> [--base <url>]`: six clusters of four uniforms' coats (`tools/army-blocks.mjs`) at battalion
size, on the default view, summer and winter. Each block's luma against the ground's at the same pixels (from a
render without blocks) must differ by 0.10; with `--base`, a block fails only if it separated on the base. The
blocks are painted by the shared painter at unit crispness, without snow (`NOSNOW`), as units will be. Its
negative, in summer: the same blocks painted grey, each at the grey that matches the ground's value under it
(interpolated from renders at two greys), must not separate. A block's pixels come from two mask renders (flat
white, flat black), so hidden parts and ground-coloured parts are both counted right.
`--view crops`: two columns of the coats on a stubble field with its crops grown (`CROP_SPOTS`,
`tools/army-blocks.mjs`; the negative there needs 8 blocks, the field holds no more). `--seasons summer,autumn,…`
picks the seasons run (default summer and winter; summer always, for the negative).

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
- Instances stand on the drawn triangles, not on the formula; no far bush or far tree stands in the 14 m apron band.
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

- **The leaf-card crowns are the default** (with the generated trees, `docs/plans/done/gen-trees-default.md`, the
  owner's call): a dark coat in a crown's deep shade loses separation with them (#63, L4: the army side's to fix; the
  guard against the pack's trees found no block newly failing); decision 0022 (their soft ramp) is accepted; their outline aliases at the widest zoom (L8); a
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
