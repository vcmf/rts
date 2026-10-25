---
status: proposed
date: 2026-10-25
---

# 0066 The figures' LODs cross-faded per man by a screen-door dither

The plan: `docs/plans/active/lod-fade.md` (#188); as built: `docs/systems/look.md` ("The armies").

## Context

A battalion switched LOD all at once (the near LOD over the far at 48 px, the far over the tiny boxes at 12 px), and
the owner saw it flash. Measured: the LODs differ in coverage (−10 % and +9 %) and in the colours they show (the far
LOD loses the facings' red and the belts' white, the tiny boxes read lighter and greyer), a block step of 1.2 to 3.4
ΔE in one frame; not a palette or a light that a gain could match.

## Decision

- In a band round each switch (0.8 to 1.25 × its height on screen) a battalion draws both LODs and each man is drawn
  at his own LOD by his own height on screen, switching at his own point in the band (a hash of his instance), over a
  short screen-door dither: each pixel of him drawn by exactly one LOD. No alpha blending and no sorting; a man is
  never hidden.
- A battalion draws a second LOD only while one of its men can be in a band; outside the bands it draws one, as
  before. A split battalion (the nearest LOD) draws as before.
- `?lodfade=0` restores the hard switch.

## Consequences

- Good: no battalion pops; the change runs over the band as the men switch one by one.
- Bad: inside a band the battalion's men are vertex-shaded at both LODs (the dropped ones off screen), and the
  figure shaders carry a `discard` (cost measured in the plan). The dither is visible as a fine pattern on the men
  mid-fade. The LODs' colours still differ; the fade spreads the difference, it does not remove it.

## Alternatives considered

- **Matching the LODs' colours at the switch** (a gain or a palette shift): measured not to match (the tiny at 0.8 ×
  fixed the lightness, not the chroma, and darkened the white uniforms); a real match is new LODs or a new tiny
  calibration.
- **Alpha blending both LODs**: needs sorting and blends the ground into the men; the screen-door draws opaque.
- **Per battalion fade without per-man switching**: every man dithered together reads as a battalion fading, and
  costs both LODs' fragments over the whole band.
