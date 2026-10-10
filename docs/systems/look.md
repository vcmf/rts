---
status: current
last_reviewed: 2026-10-10
code: [app/look.html, src/look/main.ts, src/look/spec.ts, src/look/noise.ts, src/look/river.ts, src/look/grain.ts, src/look/materials.ts, src/look/terrain.ts, src/look/water.ts, src/look/nature.ts, src/look/bakes.ts, src/look/post.ts, src/look/shaders/, tools/golden.mjs, tools/check-negatives.mjs]
decisions: [0001-painterly-look-in-materials, 0002-top-down-camera-no-sky, 0003-no-blur-in-gameplay, 0016-typescript-toolchain]
---

# The look page (Track E, L0)

The painted world in the game's toolchain: terrain, river, nature, baked static light and the finishing
passes, drawn by Babylon 9.29.0 from npm on the look page (app/look.html, `npm run dev`, then `/app/look.html`).
It is a port of `prototypes/painted-cinematic.html` with the same pixels; the prototype stays as the
reference until L9 (`docs/plans/active/track-e-look.md`).

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
  with no error. The ones in use: the instancing includes (`src/look/nature.ts`) and the post-process
  vertex shader (`src/look/post.ts`).

## Design

| Module | What |
|---|---|
| `src/look/spec.ts` | The world's sizes and the numbers shaders read as macros (`SBIAS`, `FAR_W`, `TILE_HALF`, `TILE_W`). L0a turns it into a checked SPEC |
| `src/look/river.ts` | The meander (`docs/systems/river.md`): centre line, per-sample attributes, `riverQuery`, `carve`, `H` |
| `src/look/grain.ts` | The procedural paint grain (R fine, G blotches, B streaks) and a dropped PNG's luminance |
| `src/look/materials.ts` | Panel state `S`, sun and palette, and the material factory that inlines `shaders/painter.glsl` at `#include<painter>` |
| `src/look/terrain.ts` | Tile (1.79 m), far ring (14.3 m) and the apron that stitches them; the far ring's painted river mask |
| `src/look/water.ts` | The water ribbon and the tree-reflection mask |
| `src/look/nature.ts` | Role-painted nature pack models, thin instances, and the scatter with its placement rule |
| `src/look/bakes.ts` | Sun shadow depth (once), occlusion and valley mask (CPU, once), the top-down light map (once) |
| `src/look/post.ts` | The RTS camera, and the passes: depth of field (presentation only, decision 0003), the fused grade |
| `src/look/main.ts` | Builds everything in order, the panel, the frame loop, and the debug globals the checks read |

Shaders are files in `src/look/shaders/`, imported as text (`?raw`). The page exposes
`window.__proto = { S, scene, camera, buildPost, play }` and accepts `?frozen` (the clock stays at 0),
the contract of `tools/golden.mjs`; it also puts the prototype's global names on `window`
(`RIVER`, `H`, `groups`, `SMW`, …) so `tools/render-check.js` and `tools/river-check.js` run unchanged.

## Tunables

In the code: sizes in `src/look/spec.ts`, colours and light in `src/look/materials.ts` and the shaders, the
river's parameters in `src/look/river.ts`, the scatter in `src/look/nature.ts`.

## Verification

- `node tools/golden.mjs prototypes/painted-cinematic.html http://localhost:<port>/app/look.html` after
  `npm run build` and `npx vite preview`: the port matches the prototype at every camera.
- The render and river checks run on the look page through `tools/shot.mjs` (their headers).
- `npm test` (lint and typecheck cover `src/look/`).

## Open questions

- The bundle is one 1.7 MB chunk (Babylon plus the nature pack data); splitting it waits until load
  time matters.
