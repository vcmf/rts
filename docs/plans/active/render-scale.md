---
status: active
last_reviewed: 2026-10-20
---

# Plan: the render scale 0.9 near, upscaled by EASU

Frame headroom, step 2 (step 1 the road split, PR #122, whose plan records the cost ablations). The owner
(2026-10-20): yes to the render scale 0.9, with a good upscaler. Decision 0045 records the choice; this plan the work.

## Scope

- **Auto by zoom** (`src/look/main.ts`, `AUTO`): 0.9 from the closest zoom (was 1 up to 72 % of the zoom range), then
  0.8 and 0.75 as before.
- **The upscale** (`src/look/post.ts`): on WebGL2 the canvas stays at the page's pixels (hardware scale 1). The
  finishing chain draws at `post.scale`: each pass's size is an object `Post` owns and Babylon reads at each frame,
  set from the canvas's size and the scale (`resize`), so a change of scale resizes the targets in place, as the
  hardware scale did: no pass made again, no shader compiled (review round 3's redesign: rebuilding the chain at a
  change, then swapping a chain made aside, left frames without passes, stuck scales and asynchronous tool pins).
  The last pass `easu` draws the screen by a uniform mode: a copy at 1 (texel for texel), EASU from 0.9 up and under
  1 (Babylon's `fsr1Upscale`, its main replaced and its gathers read once each; a port of another shape: bilinear in
  its place, the page up), bilinear otherwise; upscaled, it lays the paper grain (the finishing pass's `uGrainHere`
  0) and a dither; the grain and dither one definition for both passes (`PAPER`). Over 1 (the panel's Retina) the
  hardware scale, the chain copying. On WebGL1, under `?upscale=bilinear`, and if the last pass does not compile or
  Babylon does not keep a size object (`Post.fail`: the chain made again without it, an error logged) the hardware
  scale, and decision 0036's Auto (1, then 0.9 from 72 %: AUTO_STRETCH), as before.
- **The scene's own lines** (`sceneH`): the grade's haze toward the top (`uViewH`) and the near strokes' visibility
  test measure the target the scene draws into, not the canvas.
- `?upscale=bilinear`: the stretch at every scale (the A/B).
- Decision 0045 (supersedes 0036, the targets unchanged); `docs/systems/look.md`.

## Acceptance

- The bench (production build, Metal, interleaved, three rounds) against main and against `?upscale=bilinear`: at
  the default and closest zooms about 0.7-0.85 ms under main; the widest zoom as main. Measured on the draft
  (EASU at every scale): default 9.78 against main 10.45 and the stretch 9.35; closest 7.67, 8.52, 7.45; widest 8.23
  against 7.55 (hence the stretch under 0.9).
- Side-by-side crops (main at 1, 0.9 stretched, 0.9 EASU) shown to the owner: accepted 2026-10-20.
- The checks pin the scale to 1: as main (golden screenshots identical; the checks' known failures #118, #120).
- `npm test`.

## Open questions

- The screen-door fades (the far trees' LOD, the crown cards' hand-over: `dither(gl_FragCoord.xy...)`) are drawn on
  the scene's pixel grid and resampled by EASU at 10:9: a moiré at the fade bands is possible. To look for at the
  closest zoom in the owner's browser.
