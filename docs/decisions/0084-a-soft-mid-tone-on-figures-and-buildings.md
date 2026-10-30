---
status: accepted
date: 2026-10-30
---

# 0084 A soft mid tone on the figures, the buildings and the nature meshes

Amends decision 0022 ("every other surface (ground, water, buildings, armies) keeps the three bands") and the art
bible's §4, "The shading ramp", for the units, the buildings and the nature meshes; the ground, the water and the
crowns are unchanged.

## Context

The art bible (§4) paints every surface in three value bands, light, mid and shadow, and decision 0022 made the
foliage crowns the one exception. In `paint()` (`src/look/shaders/painter.glsl`) those bands met over 0.08 of the
light value, a cel-like step. The owner (2026-10-29), against Tiny Glade's crowns and figures: "a common problem for
our shadow in general, not just trees; on soldiers' models we change tone from light to dark quite abruptly, it lacks
the mid tone". Tiny Glade turns light into shade through a wide, soft, lighter middle tone. The plan and its results:
`docs/plans/active/soft-midtone.md`.

## Decision

We will paint the units, the buildings and the nature meshes (the trunks, the stones; not the crowns, which keep
their own soft ramp, decision 0022) with the same three colours meeting over wide, soft edges: a real mid tone, not
three flat patches nor a photoreal lambert. The ground and the water keep their bands. Three modes were built behind
`?midtone` per class (`src/look/midtone.ts`): **1**, the band edges 0.24 wide and the mid a little lighter; **2**, a
wide mid tone: the light wrapped a little round the form, edges 0.38 wide, the mid lighter and the shadow band lifted
10 % toward it, its cool hue kept (not on units); **3**, the units alone: the figure's turn, shadow to mid over most
of the side turned from the low sun (the sides a top-down camera sees on a figure sit near −0.55 of the light, deep in
every other mode's shadow band), the shadow colour 20 % deeper, a near-white coat on the old bands. The owner's pick
(2026-10-30), the page's default: **u3, b2, n2, the ground at 0**. `?midtone=0` keeps the look from before it.

## Consequences

- Good: forms (a coat, a knapsack, a horse, a roof, a windmill) turn through a mid tone; the grain no longer
  speckles a near-edge surface into islands of the two bands (the old roofs).
- Good: the colours and the cool shadow rule stay the mood's.
- Bad: not free: +0.01 to +0.16 ms of GPU frame at 1080p on the dev Mac (three alternated rounds, the plan's results),
  under 0.1 ms but at the widest zoom.
- Bad: the readability guard fails one more block: a white coat on snow at 0.098 against 0.102 before (the bar 0.1),
  accepted by the owner as #268; its cause is outside the coat's own shading (the issue).
- Bad: the cuirassiers' facets (flat normals on the decimated mesh) stay hard steps; no ramp smooths them (#267).
- Bad: three ramps to keep in step (the bands, the crowns' soft ramp, this one).

## Alternatives considered

- **More bands, still stepped** (five): keeps the rule's letter, but each step is still a hard line on a coat.
- **The crowns' soft ramp everywhere** (`SOFT_RAMP`): its wrap (0.45) flattens a building's walls and lifts a box
  side into the light.
- **The mid tone on the ground too** (`g1`, `g2`): it relit the whole terrain, the slopes turned from the sun lifted
  (the goldens' start view: a mean difference of 25 of 255 in a region at 2), not only the shadows' edges.
- **A full-screen blur of the bands:** against decision 0001 (the look lives in the materials).
