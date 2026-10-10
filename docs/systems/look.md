---
status: current
last_reviewed: 2026-10-10
code: [app/look.html, src/look/main.ts, src/look/spec.ts, src/look/heightfield.ts, src/look/world/author.ts, src/look/world/data.ts, data/painted-world.lookdata, tools/build-look-data.ts, tools/look-check.js, test/look-spec.test.ts, src/look/noise.ts, src/look/river.ts, src/look/grain.ts, src/look/materials.ts, src/look/terrain.ts, src/look/water.ts, src/look/nature.ts, src/look/bakes.ts, src/look/post.ts, src/look/shaders/, tools/golden.mjs, tools/check-negatives.mjs, src/look/bench.ts, src/look/gputimer.ts, src/look/lab.ts, tools/bench-look.mjs, tools/guard.mjs, tools/look-page.mjs, tools/detail-check.mjs]
decisions: [0001-painterly-look-in-materials, 0002-top-down-camera-no-sky, 0003-no-blur-in-gameplay, 0010-locked-camera-staff-map, 0011-scale-and-min-spec, 0012-heightfield-authority, 0016-typescript-toolchain]
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
| `tools/build-look-data.ts` | Builds `data/painted-world.lookdata`: the heightfield (tile plus `aoMargin`), the far ring's nodes, the river's samples (`--check` compares) |
| `src/look/world/data.ts` | The look data's binary format |
| `src/look/heightfield.ts` | `heightAt` on the heightfield with CreateGround's own triangle split; `groundAt` adds the far ring's nodes beyond the tile; `H` is `groundAt` |
| `src/look/river.ts` | The meander at run time (`docs/systems/river.md`): the shipped samples, a bucket grid, `riverQuery`, `bandOf` |
| `src/look/grain.ts` | The procedural paint grain (R fine, G blotches, B streaks), a dropped PNG's luminance, the seam check's smooth grain, the R channel's mean |
| `src/look/materials.ts` | Panel state `S`, sun and palette, and the material factory that inlines `shaders/painter.glsl` at `#include<painter>` |
| `src/look/terrain.ts` | Tile (1.79 m), far ring (14.3 m) and the apron that stitches them; the far ring's painted river mask. Their materials define `DETAIL` (the detail layer, below) |
| `src/look/water.ts` | The water ribbon and the tree-reflection mask |
| `src/look/nature.ts` | Role-painted nature pack models, thin instances, and the scatter with its placement rule |
| `src/look/bakes.ts` | Sun shadow depth (once), occlusion and valley mask (CPU, once), the top-down light map (once) |
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
passes on or off; `hill`; `quarter` and `shift`, the projection moved for the checks). `?detail=l0` opens the page
with the L0 grain on the terrain.

### The detail layer (L2b)

In `paint()` (`src/look/shaders/painter.glsl`), for materials that define `DETAIL` (the terrain's): the paint
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
- **Band edges:** never narrower than two pixels' change of the light value (`fwidth`).
- The 21 m blotch term reads the same planes at its fixed world size. Snow, cloud shadows and flowers are
  unchanged. Every read is a `textureGrad` from the world position's derivatives, taken once.
- `DETAIL_L0` puts back the L0 grain (the bench's second arm, the checks' baseline); `DETAIL_DEBUG` and
  `DETAIL_DEBUG_INC` are the checks' views; `DETAIL_SAB_IMPLICIT` and `DETAIL_SAB_STEP` are sabotages.

### The bench (`?bench`, L2a)

The page runs 9 cameras (closest, default and widest zoom, each at yaw −45°, 0°, +45°) and records, per camera
and arm, frame times (p50, p95, max), GPU time per pass, draw calls and triangles, plus the estimated texture
memory, the renderer and the build hash (`__BUILD__`, set by `vite.config.ts`). It shows the JSON with a link to
save it, and puts it in `window.__bench`. Arms are variants of the page measured in the same session, A B B A per
camera: `l2` (the page) and `l0` (the L0 grain on the terrain).
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

In the code: sizes in `src/look/spec.ts` (with the detail layer's `detail.px`, `detail.amp` and `detail.index`), colours and light in `src/look/materials.ts` and the shaders, the
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
  trip and that the committed file is what the authoring step builds.
- `node tools/guard.mjs` and `node tools/bench-look.mjs` (above). Their baselines are in
  `docs/plans/active/track-e-results/l2a-baseline.md`.
- `node tools/detail-check.mjs <url> --selftest` (above). The goldens of main against `?detail=l0` match: the
  detail layer changes the terrain only.
- `npm test` (lint and typecheck cover `src/look/`).

## Open questions

- The nature pack's data comes from `prototypes/` as a script that sets `window.NATURE`; it moves to a
  real module before the prototype is retired (L9).
- `groundAt` reads the far grid inside the 14 m apron band, where the drawn surface is the apron's fan; nothing
  is placed there (`src/look/nature.ts`), and the look check fails if anything is.
- **The guard fails on main** for some coats (red in summer, white on snow): a palette question for the owner,
  recorded in `docs/plans/active/track-e-results/l2a-baseline.md`.
- The bundle is one 1.7 MB chunk (Babylon plus the nature pack data); splitting it waits until load
  time matters.
