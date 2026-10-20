---
status: accepted
date: 2026-10-20
---

# 0045 The render scale 0.9 from the closest zoom, upscaled by EASU

## Context

Decision 0036 set 60 fps as the hard target and 120 fps as the soft one, and a render scale by zoom: 1 at the close
and default zooms, 0.9, 0.8 and 0.75 farther out, the browser stretching the smaller canvas (bilinear). The owner
(2026-10-19): 114-118 fps at the river view at default zoom on main, and the armies still to come; the aim is about
150 fps uncapped for the world (PR #122's plan). Measured on the production build (Metal, headless
1920×1080, interleaved, three rounds, medians): a fixed 0.9 saves about 1.1 ms at the default and closest zooms, the
largest single lever found; stretched, it is visibly softer (the grass, the crowns' edges, the paper grain). FSR 1's
edge-adaptive upscale (EASU, AMD; shipped with Babylon 9.29) at 0.9 is hard to tell from 1 in side-by-side crops; its
pass at the screen's pixels costs about 0.35 ms (default zoom 10.45 ms at 1, 9.78 at 0.9 with EASU, 9.35 stretched;
closest 8.52, 7.67, 7.45). At the widest zoom, already at 0.75, EASU cost 0.7 ms more than the stretch.

## Decision

- **60 fps hard, 120 fps soft**, as decision 0036.
- **The render scale's Auto by zoom: 0.9 from the closest zoom**, then 0.8 and 0.75 as the camera's radius passes 80
  and 88 % of its range (4 m of hysteresis, as before). Not driven by missed frames (decision 0036's reasons).
- **The finishing chain draws at the scale and its last pass draws the screen** (`src/look/post.ts`, WebGL2): the
  canvas stays at the page's pixels; a change of scale resizes the chain's targets in place (no pass made again, no
  shader compiled, as the hardware scale did). The last pass: **EASU from 0.9 up, under 1**; bilinear at the other
  scales (the wide zooms', the panel's 0.75 and 1.5); a copy at 1 (the check tools' pinned scale: the same pixels).
  Upscaled, the paper grain is laid after the upscale, at the screen's pixels, and a dither after it too (the
  finishing pass keeps its own, before its 8-bit target). Over 1 (the panel's Retina): the hardware scale, as before.
  On WebGL1, under `?upscale=bilinear`, or if the last pass fails to compile (the page then gives the upscale up): the
  hardware scale and Auto's closest level at 1, all as before.
  No sharpening pass (RCAS): at 0.9 there is little to recover, and it would fight the painted softness.
- `?upscale=bilinear` keeps the stretch at every scale (the A/B). The check tools still pin the scale to 1.

## Consequences

- Good: about 0.7 ms a frame less at the default zoom and 0.85 at the closest, the near views nearly as sharp as at 1.
- Bad: at a fixed 1 (the panel's, the check tools') the last pass copies the frame: one full-screen pass more than
  before, for the same pixels (Auto has no level at 1 any more).
- Bad: from 72 to 80 % of the zoom range, 0.9 stretched before, EASU's pass now costs its 0.35-0.45 ms more there
  (measured at the default zoom; not benched in that band). At 80 % the step in sharpness is larger than before: 0.9
  upscaled to 0.8 stretched (was 0.9 stretched to 0.8 stretched).
- Bad: the scene has 0.81 of the pixels at every zoom now: units are drawn at 0.9 from the closest zoom. Decision
  0036's debt, a full-resolution pass for units (or the GPU-timed scale), is now owed at every zoom, before the armies
  land. EASU only enlarges what was drawn: detail under a scene pixel can still break up.

## Alternatives considered

- 0.9 stretched (bilinear): 0.35 ms more saved, visibly softer.
- A cheaper single-pass upscale (bilinear with the grain after it and a light sharpening): perhaps 0.1 ms; likely
  softer than EASU; not built.
- EASU at every scale: costs more than it saves under 0.9.
