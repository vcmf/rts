---
status: accepted
date: 2026-10-15
---

# 0034 The shimmer gate at the widest view is re-baselined for the temperate mood

## Context

The temperate mood (decision 0033) has a frame about 7 % more contrasty than golden's. At the widest view, the water
check's shimmer measure rose on main from 2.9 % (golden) to 3.78 % in summer, 4.11 % in autumn and 11.03 to 11.4 %
in winter. That is over the limits set under golden: 3.5, 3.5 and 10.8 %.

Measured one switch at a time (`docs/plans/done/temperate-fixes.md`), no single source carries it. Half is the
contrast (with the threshold scaled by it, temperate measures 3.31 %); the rest is spread over the grain, the painted
edges and the bloom. Meeting the old limit would mean fading the grain and the edges at far zoom, or flattening the
mood's contrast.

## Decision

The owner chose to keep the look (2026-10-15). The widest limits are re-baselined to main under temperate, a run's
spread above its measures: 4.0 % in summer, 4.4 % in autumn and 11.8 % in winter. The closest zoom's limits and the
water's own pixels are unchanged.

## Consequences

- Good: the look stays as picked, and a regression from today's main is still caught.
- Bad: under a lower-contrast mood (golden measures 2.93 %), the gate is looser than it was.
- Each new default mood may need its limits measured again.

## Alternatives considered

- Fade the grain and the painted edges as a pixel spans more ground: the widest zoom gets smoother and less brushy.
- Lower the mood's contrast by about 7 %.
- Normalise the check's threshold by the frame's contrast: one limit for every mood. It is a change to the check's
  method, left for when a second mood is in use.
