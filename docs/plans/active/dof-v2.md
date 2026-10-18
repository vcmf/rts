---
status: active
last_reviewed: 2026-10-18
---

# Plan: depth of field v2: cheaper, near and far, painted

Stacked on `docs/plans/active/grass-flow.md` (PR #112): this branch starts from it and merges with it.

## Problem

The owner (2026-10-18): the combed meadow drops the default zoom under 120 fps on the owner's screen with the depth of
field on, while the default page sits at 120. Measured (the dev Mac, Metal, 1920×1080, the bench's frame interval):
the default zoom costs 5.7–5.8 ms with the depth of field off and 7.1–7.4 ms with it on (two page loads). Of that
1.4 ms the blur's passes are 0.1–0.4 ms (`?bench=dof`, one page, both arms on the same target); the rest is the scene's
MSAA target in half floats, which the depth of field needs today for the distance the materials write to alpha
(`sceneType` in `src/look/post.ts`; the 8-bit target: `docs/plans/done/wide-perf.md`). The owner also wants a depth of
field that is "magnifique", and the near-camera elements at the frame's foot (tree crowns, the end of the grass)
blurred rather than cut. Research: three agents (high-quality game DOF, painterly and strategy-game blur, our cost),
summarised in `docs/research/dof-v2.md`.

## Scope

1. **The scene stays 8 bits.** The materials write the lens term (how far behind or in front of the focus, along the
   view axis) encoded in the alpha's 8 bits, not the distance; one code is the units' ("never blur"). The focus and the
   camera's forward axis reach every material each frame.
2. **A prefilter at half resolution:** colour weighted by blur (no leaks), the decoded blur once per pixel.
3. **Blur tiles:** the largest near and far blur a tile, dilated by one tile: the near blur spreads over sharp pixels
   (the industry's fix: Jimenez 2014, Unreal, CryEngine), and a tile with no blur skips the gathers.
4. **Two gathers at half resolution,** each limited to its band: the far one at the top of the frame (as today), the
   near one in the bottom band of the frame, its premultiplied colour and coverage composited over the scene, its
   coverage over a unit capped.
5. **A 3×3 postfilter** (noise and flicker without temporal anti-aliasing), and **a bilateral composite** (no fringe).
6. **The painted look:** colour and value follow the blur (the far band toward the haze, the near band darker and
   cooler), the sharp-to-blur boundary broken by a world-fixed brush noise.

Out of scope: a Kuwahara "paint" defocus (a follow-up, measured); highlight sprites and polygonal bokeh
(presentation modes, decision 0024).

## Approach

Step 1 first, benched alone (the largest saving), then the near field, then the look. Each step behind the same
switches as today (`?dof`, `?bench=dof`); a `?dofv=1` arm keeps today's depth of field for the A/B until the owner
judges.

## Acceptance

- The cost against the depth of field off, at every zoom: at most +0.8 ms (the dev Mac, the frame interval, paired
  runs); against today's depth of field on: cheaper.
- Formations: the readability guard with `?dof=1` against `?dof=0` at the start and cover views, and a check that a
  unit pixel's blur is 0.
- The goldens with `?dof=0` identical to the base (the look tools measure the paint with the blur off).
- The owner's judgement on screen: near and far, close and wide zooms.

## Review rounds
- **Step 1 measured** (the dev Mac, paired one-page A/B, `?bench=dof`): the depth of field's passes cost 0.1–0.4 ms at
  the default zoom (0.1–0.3 close, 0.1–1.0 wide); the 8-bit target with the lens term saves about 0.3 ms at the close
  zoom and nothing measurable at the default. The earlier "1.4 ms" came from two page loads, which differ by up to
  0.9 ms on this Mac run to run: an attribution error, corrected here.
- **The combed meadow, paired** (`?grass=flow&bench=grass`, `bench=grassparts`: GRASS_FLOW and its parts toggled in one
  page): +0.1–0.8 ms, the same with the depth of field off or on; every part off but the mode on +0.1–0.4 (the noise's
  size); no single part carries it (each 0.0–0.6, by camera). The growth read on every ground pixel was not it (made
  conditional: no change). Left as is: many small costs.
