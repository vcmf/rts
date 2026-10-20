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
- **The upscale** (`src/look/post.ts`): at Auto's 0.9 (WebGL2), the canvas stays at the page's pixels
  (hardware scale 1); the finishing chain draws at `post.scale` (the scene into its first pass at that ratio, the
  depth of field's half-resolution passes at half of it, the finishing pass `uber` at it), then a last pass `easu`:
  FSR 1's EASU as Babylon ships it (`fsr1Upscale`, its main replaced) to the screen's pixels, then the paper grain
  (`uber.frag` leaves it to it: `UPSCALED`; the dither stays before the 8-bit target). Under 0.9, a fixed scale and
  WebGL1: the hardware scale as before (the stretch).
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
