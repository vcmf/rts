---
status: proposed
date: 2026-10-14
---

# 0032 Under a cloud units keep the band drop; a near-white coat takes less of the sun's hue

## Context

The ground's light (`docs/plans/done/ground-light.md`) turned a cloud's shadow from a drop of the light into a darker
band into a soft shade of the colour, on every painted material, so nothing under one cloud reads as a cut-out and the
grain no longer breaks the ground into dark islands. Two consequences for units, measured with the readability guard
and the coat check:

- With the shade, the British red on the winter meadow under a cloud separated by 0.087 (main 0.209): a coat reads
  on bright ground under a cloud by the band's contrast.
- With the cloud's graded edge, the coat check's middle spot came into full sun, and its Austrian white turned cream
  (236, 220, 183). Under decision 0027 a coat takes `units.tint` of the sun's hue; a white shows that hue most.

## Decision

Under a cloud, units (the painter's `KEEP_HUE` path) keep the cloud's drop of their light into a darker band; every
other painted material takes the shade. A near-white coat (light: luma 0.55 to 0.80 and up; of little chroma: under
0.10 to 0.25) takes a fifth of the mood's `units.tint`, as the eye balances on the brightest neutral. Decision 0027
stands: the share is still the mood's; this sets how a white takes it.

## Consequences

- Good: the guard passes at every view and season against main, and one block failing on main separates; the coat
  check's whites stay white in full sun (232, 228, 210 against the painted 233, 227, 211).
- Bad: a unit under a cloud is darker than the ground round it by a band, not by the shade: units read a little apart
  from the light on the scene, as decision 0027 already accepts for their hue.
- Bad: a light low-chroma coat that is not white (a grey or buff greatcoat) takes the white's share too.
- The coat check judges a white by its chroma (up to 8 steps over the painted), not HLS saturation, which rises
  with lightness alone near white.

## Alternatives considered

- The shade on units too: the red on the winter meadow fails (above).
- A per-mood share for neutrals, or a balance on the scene's brightest neutral: more machinery than one coat colour
  needs today; revisit with the figures (L3).
