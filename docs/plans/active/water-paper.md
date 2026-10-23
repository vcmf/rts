---
status: active
last_reviewed: 2026-10-23
---

# Plan: water as a paper wash, sunk below the land (staff map prototype)

## Problem

The owner found the water out of keeping with the paper map (a flat teal laid over it) and asked how to make it read
as lying below the land around it.

## Scope

In `prototypes/staff-map.html`, the lit style (`?style=lit`, with or without `relief=layers`):
1. **A wash on the paper**: the water tints the paper toward a muted grey-blue, its grain and season wash showing;
   stronger at the banks, paler in the middle (as watercolour pools at its edges). The ponds' water lining stays.
2. **Sunk below the land**, by the map's one north-west light: the bank toward the light shades a strip of water under
   it; the far bank catches a thin light edge.
3. **Flat water**: no contours and no paper-layer sheets across it.

Out of scope: the painted world's water (close zoom), the ink style, real water data.

## Approach

The water shapes, blurred (3 m for the 11 m stream, 9 m for the ponds), are baked once into texture A's red channel,
which the lit style leaves unused (it draws contours, not hachures). The shader reads it as distance from the bank
and its slope, sampled 4 texels apart, as the bank's direction.

## Acceptance

- Screenshots of the ponds, the stream and the whole map, with and without `relief=layers`, on the owner's GPU.
- The ink style and the painted world unchanged.

## Review rounds

- **Round 1** (`/code-review high`; the first commit had gone out without one, wrongly called cosmetic): severe:
  without `relief=layers` the terrain shader did not compile (the light's uniform was declared for the paper layers
  only). Fixed (declared and set for the whole lit style), with: the stream's blur narrowed so its middle is paler too
  (a 9 m blur on an 11 m stream never passed 0.46); the depth drawn straight into the map texture (no second
  full-size canvas, and the bake's additive mode left as it was); the slope sampled 4 texels apart (2 banded on the
  8-bit depth); the shores traced once (memoised); the doc comments on the right functions; this plan.
