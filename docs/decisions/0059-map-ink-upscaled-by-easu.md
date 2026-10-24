---
status: accepted
date: 2026-10-24
---

# 0059 The map's ink is upscaled by FSR 1's EASU, on its alpha

## Context

Decision 0056 draws the lit map view's ink at a pixel ratio of 1, for the frame budget. On a high-density screen the
browser then stretches it bilinearly, which softens every mark. The owner asked for the real map's upscaler on the draft
map. That upscaler is FSR 1's EASU, which Babylon ships and the look page uses (decision 0045).

## Decision

In the lit style, on a screen where the ink is smaller than the screen, we will upload the ink as a texture when it is
redrawn and draw it over the scene in a last pass through EASU. The marks' edges are in their alpha, so EASU runs once,
on the alpha. The colour is read bilinearly, un-premultiplied, and laid under that alpha. `?upscale=bilinear` keeps the
browser's stretch. If the pass cannot compile, the canvas shows as before. The ink style keeps the stretch.

## Consequences

Good: crisper marks on 4K at no measurable cost on test machine A (`docs/plans/active/perf-150.md`). Colour and edge
come from one alpha, so they cannot disagree. Bad: one more full-screen pass a frame, and one texture upload per
redraw. EASU sharpens edges but cannot restore detail drawn at half the pixels; sharp ink remains for that.

## Alternatives considered

- **EASU on colour and on alpha separately:** six times the reads, and the two runs choose their edges independently,
  leaving fringes.
- **The browser's bilinear stretch:** free, and soft.
- **Sharp ink by default:** crisp, and 3 to 4 times the frame cost on 4K (decision 0056).
