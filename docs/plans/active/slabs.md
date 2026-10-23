---
status: active
last_reviewed: 2026-10-23
---

# Plan: a slightly tilted map view, armies as low slabs (staff map prototype)

## Problem

The owner found the shaded relief beautiful. They asked to see the map from a slightly angled view, with the unit
blocks as real boxes, and chose "just tilt a bit" and "low slabs first".

## Scope

In `prototypes/staff-map.html`, the lit style (`?style=lit`):
1. **A slight tilt.** The map view leans about 20° off straight down by default, and still tilts further as you zoom
   in. `?tilt=` (0 to 45°) keeps the experiment's override. This departs from the staff-map design's straight-down map
   (§9), at the owner's request. Decision 0002 holds: the view stays far short of the horizon.
2. **Blocks as low slabs.** Each block is a box on the ground, its top raised by a fixed height in metres: low at the
   symbol scale far out, about man-height up close. Its visible sides are lit by the map's one north-west light,
   darker on the side away from it. Its shadow is cast on the ground away from the light, and nearer blocks are drawn
   over farther ones.
3. **Everything on the top.** The fill, morale hatching, the routing pulse, wear bites, a square's hole and the
   cavalry stripe all move onto the top face. A brigade's two bars are two slabs.

Out of scope:
- the gun icon, which stays an icon;
- the ink style, which stays flat;
- taller blocks, which come later if the owner wants them;
- labels, which stay upright on screen.

## Approach

- **Geometry.** A block's shapes come as quads in its own metres (across and back from its front). They are projected
  twice: on the ground, and raised by the slab's height (`P3`).
- **Drawing.** Sides are drawn far to near, then the top: a convex box needs no winding tests. Units are sorted far to
  near for the top pass. The cast shadow is the hull of the ground quad and the same quad moved away from the light,
  drawn in the shadow pass before any block.

## Acceptance

- Screenshots at map, mid and close zoom: slabs that read as boxes, lit from the north-west. Brigades as two slabs, a
  hollow square as a slab, worn blocks, a routing block. Armies stay readable over the shaded relief.
- No change in the ink style.
- Frame time measured against the flat blocks.
