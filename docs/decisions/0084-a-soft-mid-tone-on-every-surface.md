---
status: proposed
date: 2026-10-29
---

# 0084 A soft mid tone between light and shade on every surface

## Context

The art bible (§4, "The shading ramp") paints every surface in three value bands, light, mid and shadow, and decision
0022 made the foliage crowns the one exception: "every other surface (ground, water, buildings, armies) keeps the
three bands". In `paint()` (`src/look/shaders/painter.glsl`) those bands meet over 0.08 of the light value, a cel-like
step. The owner (2026-10-29), against Tiny Glade's crowns and figures: "a common problem for our shadow in general,
not just trees; on soldiers' models we change tone from light to dark quite abruptly, it lacks the mid tone". Tiny
Glade turns light into shade through a wide, soft, lighter middle tone. The plan: `docs/plans/active/soft-midtone.md`.

## Decision

Proposed: we will paint the units, the buildings, the nature meshes (and the ground, if the owner judges it helps) with
the same three colours meeting over wide, soft edges: a real mid tone, not three flat patches nor a photoreal lambert.
Two candidates, behind `?midtone` per class (`src/look/midtone.ts`): **1**, the band edges 0.24 wide and the mid a
little lighter; **2**, a wide mid tone: the light wrapped a little round the form, edges 0.38 wide, the mid lighter
and the shadow band lifted 10 % toward it, its cool hue kept. The owner picks a mode per class; the pick becomes the
default and this record is accepted (it then amends decision 0022's "every other surface keeps the three bands" and
the art bible's §4), or it is rejected and the switch goes.

## Consequences

- Good: forms (a coat, a knapsack, a roof) turn through a mid tone; the grain no longer speckles a near-edge surface
  into islands of the two bands (main's roofs).
- Good: free in the measure taken (ALU only; the plan's bench); the colours and the cool shadow rule stay the mood's.
- Bad: a lighter shade side lowers some contrast: the readability guard watches the coats (the plan's results); a
  near-white coat turns lighter on its shade side.
- Bad: three ramps to keep in step (the bands, the crowns' soft ramp, this one) until one replaces another.

## Alternatives considered

- **More bands, still stepped** (five): keeps the rule's letter, but each step is still a hard line on a coat.
- **The crowns' soft ramp everywhere** (`SOFT_RAMP`): its wrap (0.45) flattens a building's walls and lifts a box
  side into the light; and another branch is reworking it.
- **A full-screen blur of the bands:** against decision 0001 (the look lives in the materials).
