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

## Results

- **Built as planned.** The map view leans 20° by default in the lit style. The slab is 7 m at the symbol scale
  (times the zoom's symbol factor) and 1.8 m close. Side faces are drawn far to near, toned by how they face the
  north-west light. The cast shadow is the footprint swept 1.2 × the slab's height away from the light. `raised()`,
  the old screen-space fake prism with a blurred canvas shadow, is gone.
- **Measured.** Windows Chrome over CDP, D3D11, RTX 3080, vsync and the frame cap off, real terrain, shaded relief,
  map zoom, paired runs: frame 5.4 and 5.7 ms with slabs, against 7.3 and 7.5 ms with the flat blocks of #149. The
  blurred canvas shadow had cost more than the slabs' sides do.

## Review rounds

- **Round 1** (`/code-review high`): severe. Four drawing faults:
  - a brigade's bars were drawn in a fixed order, so facing the camera the back bar painted over the front one;
  - a hatched (wavering) top showed its sides through;
  - a square's shadow darkened its hole;
  - a fading slab composited face over face.

  Fixed:
  - the sides are drawn clipped outside the top, so no two overlap and order does not matter, and a fading slab
    composites once;
  - the shadow is clipped outside the footprint;
  - a unit's slabs are drawn far to near.

  With:
  - picking, the selection and hover rings and a square's smoke on the raised top;
  - units sorted by their centres, gone ones left out;
  - one colour for a slab's top and sides (`blockCol`);
  - the shadow pass projecting only what it uses;
  - the dead `SIDE_PX` and stale comments removed;
  - decision 0055 for the tilt and the slabs.
