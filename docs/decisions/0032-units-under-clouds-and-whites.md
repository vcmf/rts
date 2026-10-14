---
status: proposed
date: 2026-10-14
---

# 0032 A near-white coat takes less of the sun's hue

Open until the soldier figures are in (L3): the owner will judge it by eye then (2026-10-14).

## Context

Decision 0027: units take the light's value and a mood's `units.tint` of its hue (the eye's white balance). With the
ground's light (`docs/plans/done/ground-light.md`) the coat check's middle spot came into full sun, and its Austrian
white turned cream (236, 220, 183) at that share: a white shows the sun's hue more than any coat.

A first version of this record also kept units dropping a band under a cloud (the readability guard: a British red
on winter snow under a cloud separated by 0.087 against main's 0.209). The owner rejected it: "we worry too much about
readability; they have colourful coats, and a shadow at their feet". Units now take the same soft cloud shade as
everything else (`docs/plans/done/units-cloud-shade.md`).

## Decision

A near-white coat (light: luma 0.55 to 0.80 and up; of little chroma: under 0.10 to 0.25) takes a fifth of the mood's
`units.tint`, as the eye balances on the brightest neutral. Decision 0027 stands: the share is still the mood's; this
sets how a white takes it. Built in the painter (`KEEP_HUE`, `wb`).

## Consequences

- Good: the coat check's whites stay white in full sun (232, 228, 210 against the painted 233, 227, 211).
- Bad: a light low-chroma coat that is not white (a grey or buff greatcoat) takes the white's share too.
- The coat check judges a white by its chroma (up to 8 steps over the painted), not HLS saturation, which rises
  with lightness alone near white.

## Alternatives considered

- No rule: a white goes slightly cream in full sun, arguably natural under a warm sun. To be judged with the figures.
- A per-mood share for neutrals, or a balance on the scene's brightest neutral: more machinery than one coat colour
  needs today.
