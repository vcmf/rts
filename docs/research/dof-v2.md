---
status: research
last_reviewed: 2026-10-18
---

# Depth of field v2: near and far, cheap, painted

Research notes, October 2026, from three research agents (high-quality game depth of field, painterly and
strategy-game blur, our own cost), for the plan `docs/plans/done/dof-v2.md` and the system doc
`docs/systems/look.md` ("The gameplay depth of field"). Tags: **sourced** (the reference says it), **inference**
(ours, reasoning shown), **measured** (the dev Mac, paired one-page runs, the plan's numbers).

## The question

The gameplay depth of field (decision 0024) blurred only what lies beyond the focus, in a band at the top of the
frame. The owner wanted the near-camera elements at the frame's foot (tree crowns, the end of the grass) blurred
rather than cut, a look that is "magnifique", and no frame-rate loss at 120 fps.

## What the industry does

- **Separate near and far layers, with the near one spread over sharp pixels** (sourced: Jimenez, "Next Generation
  Post Processing in Call of Duty: Advanced Warfare", SIGGRAPH 2014; Unreal's diaphragm depth of field documents the
  same split). A near object's blur must reach over the in-focus pixels around it, which a gather that reads only a
  pixel's own blur cannot do; the near layer is gathered with its coverage and composited over the result.
- **Tiles of the largest blur, dilated by one tile** (sourced: Jimenez 2014) say how far a near blur can reach, and
  let a tile with no blur skip the gather.
- **A prefilter at half resolution** (sourced: Jimenez 2014; Sousa, "Graphics Gems from CryENGINE 3", SIGGRAPH
  2013): colour weighted by blur so a sharp pixel does not leak into a blurred one, and the gathers run on a quarter
  of the pixels.
- **One gather on a spiral** (sourced: Dennis Gustafsson, "Bokeh depth of field in a single pass", 2018): each tap
  counted where its own blur reaches the pixel, a farther tap's blur clamped so a sharp object does not bleed over the
  background. Our far gather already did this.
- **A small postfilter** (a 3 × 3 tent or median) after the gather hides its sparse-sample noise where no temporal
  anti-aliasing smooths it (sourced: Jimenez 2014, the median postfilter).

## What makes a blur read as painted

- **The colour follows the blur** (inference, from aerial perspective in landscape painting and the owner's Tiny
  Glade references): the far blur goes lighter, greyer and toward the haze; a near foreground darker and cooler,
  framing the scene. Blur alone reads as a lens; blur with the value shift reads as a painting's depth.
- **A broken edge between sharp and blurred** (inference): a world-fixed noise on the lens term would make the edge a
  brushed one. Measured too costly here (below).
- **A Kuwahara-style defocus** (sourced: Kyprianidis et al., anisotropic Kuwahara filtering) flattens the blur into
  strokes; left as a measured follow-up.

## What fits our frame (measured)

- **The 8-bit scene.** The lens term encoded in the alpha's 8 bits lets the
  scene's MSAA target stay 8 bits a channel with the depth of field on. A first measure missed it: the first blur
  pass still made the scene's target in half floats; with it fixed, the 8-bit target is most of the saving.
- **No tiles.** Two small tile passes cost about 0.7 ms on the dev Mac. Our near blur lives only in the bottom band of
  the frame (the formations in the middle never take it), so the band says where a near gather can run.
- **The postfilter and the painted colour** cost nothing measurable (0.0–0.1 ms): four bilinear taps and a few
  operations in the finishing pass, only where a pixel blurs.
- **The world-fixed brush noise** cost 0.2–0.9 ms: it runs in every material, and the meadow's blades overdraw.
  Dropped.
- **A bilateral composite** is not needed: the composite takes each pixel's own blur from its full-resolution lens
  term, so a sharp pixel stays sharp next to a blurred one.
