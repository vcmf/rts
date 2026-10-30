---
status: proposed
date: 2026-10-29
---

# 0093 The campaign map is a lit relief model: one shape for form and light, baked offline in tiles

## Context

The campaign map's look was settled by eye with the owner in the K1 prototype (`prototypes/campaign-map.html`,
`docs/plans/done/k1-theatre-look.md`). Its early rounds stacked effects on a flat print: a relief light read one
set of heights, the 3D surface another, grain and tone curves on top; the owner found it weak. The rebuild that
settled it made the map a physical model lit once, as the reference prints are made, and a proof of concept baked
its close zoom offline.

## Decision

We will draw the campaign map as a relief model on a table, lit as a photograph of one:
- **one shape** (the real heights, their large forms kept and smaller detail damped, mountain regions lifted, the
  whole raised a few times, lakes sunk as stepped basins) both displaces the 3D surface and is lit; nothing is lit
  that is not seen;
- **a warm low sun and a cool sky**, the sun's soft shadows (a disc, the penumbra widening with distance) and the
  sky's occlusion **baked offline** from that shape, the slope lit per pixel;
- **the print multiplied by the light**: cold white paper, contours (index lines in orange), water, rivers and
  roads printed on the raised ground, names as ink above;
- **tiles**: the theatre baked at a coarse level for the far zoom and at 100 m for the close zoom, streamed around
  the camera; FSR 1 on high-resolution screens (decisions 0045, 0059).

## Consequences

Good: the look the owner signed off, at 150 fps at 1080p on test machine A in the prototype; detail the same
everywhere, with no seams; the load does no lighting work.

Bad: an offline bake per theatre (about a minute at 100 m for the 1805 theatre on 8 cores) and its tiles to ship
(216 MB as the prototype's base64; binary and compressed in K2a); the light is fixed per theatre (a moving sun would
need several bakes).

## Alternatives considered

- The battle map's lit view (decision 0058) as is, flat with a baked relief: too soft and too flat at a thousand
  times the scale.
- A shaded print with no 3D surface: the owner asked for the mountains to stand up, as Total War's do.
- Lighting at load in the page: about 5 s at 250 m, and too slow at 100 m.
