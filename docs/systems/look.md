---
status: current
last_reviewed: 2026-10-10
code: [app/look.html, src/look/main.ts, src/look/spec.ts, src/look/heightfield.ts, src/look/world/author.ts, src/look/world/data.ts, data/painted-world.lookdata, tools/build-look-data.ts, tools/look-check.js, test/look-spec.test.ts, src/look/noise.ts, src/look/river.ts, src/look/grain.ts, src/look/materials.ts, src/look/terrain.ts, src/look/water.ts, src/look/nature.ts, src/look/bakes.ts, src/look/post.ts, src/look/shaders/, tools/golden.mjs, tools/check-negatives.mjs]
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
| `src/look/grain.ts` | The procedural paint grain (R fine, G blotches, B streaks) and a dropped PNG's luminance |
| `src/look/materials.ts` | Panel state `S`, sun and palette, and the material factory that inlines `shaders/painter.glsl` at `#include<painter>` |
| `src/look/terrain.ts` | Tile (1.79 m), far ring (14.3 m) and the apron that stitches them; the far ring's painted river mask |
| `src/look/water.ts` | The water ribbon and the tree-reflection mask |
| `src/look/nature.ts` | Role-painted nature pack models, thin instances, and the scatter with its placement rule |
| `src/look/bakes.ts` | Sun shadow depth (once), occlusion and valley mask (CPU, once), the top-down light map (once) |
| `src/look/post.ts` | The RTS camera, locked to the SPEC (yaw ± 45° around the default, decision 0010), and the passes: depth of field (presentation only, decision 0003), the fused grade |
| `src/look/main.ts` | Loads the look data, checks the ground against the SPEC, builds everything in order, the panel, the frame loop, and the debug globals the checks read |

Shaders are files in `src/look/shaders/`, imported as text (`?raw`). The page exposes
`window.__proto = { S, scene, camera, buildPost, play }` and accepts `?frozen` (the clock stays at 0),
the contract of `tools/golden.mjs`; it also puts the prototype's global names on `window`
(`RIVER`, `H`, `groups`, `SMW`, …) so `tools/render-check.js` and `tools/river-check.js` run unchanged.

## Tunables

In the code: sizes in `src/look/spec.ts`, colours and light in `src/look/materials.ts` and the shaders, the
river's parameters in `src/look/world/author.ts` (rebuild the look data after a change), the scatter in `src/look/nature.ts`.

## Verification

- `node tools/golden.mjs prototypes/painted-cinematic.html http://localhost:<port>/app/look.html` after
  `npm run build` and `npx vite preview`: the port matches the prototype at every camera.
- The render and river checks run on the look page through `tools/shot.mjs` (their headers), and so does
  `tools/look-check.js`: `H` against Babylon's own reading of both drawn meshes, the yaw lock, every instance
  on the ground, the ground inside the SPEC's range. `node tools/check-negatives.mjs <url>` runs all three
  with a sabotage per limit.
- `test/look-spec.test.ts`: one negative case per SPEC invariant, the triangle split, the data file's round
  trip and that the committed file is what the authoring step builds.
- `npm test` (lint and typecheck cover `src/look/`).

## Open questions

- The nature pack's data comes from `prototypes/` as a script that sets `window.NATURE`; it moves to a
  real module before the prototype is retired (L9).
- The bundle is one 1.7 MB chunk (Babylon plus the nature pack data); splitting it waits until load
  time matters.
