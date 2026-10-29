---
status: active
last_reviewed: 2026-10-29
---

# Plan: a soft middle tone between light and shade

The owner (2026-10-29): our shading turns from light to dark too abruptly and lacks a soft middle tone, "a common
problem for our shadow in general, not just trees; on soldiers' models we change tone from light to dark quite
abruptly, it lacks the mid tone". The reference is Tiny Glade's crowns and figures, where light turns into shade
through a wide, soft, lighter middle tone (refs, git-ignored: `output/look-refs/owner-2026-10-29/`).

## Cause

`paint()` (`src/look/shaders/painter.glsl`) paints every material but the crowns in three bands, shadow | mid |
light, with band edges 0.08 of the light value wide (`smoothstep(-0.10,-0.02,l)`, `smoothstep(0.30,0.38,l)`): on a
soldier's rounded coat or a building's wall that is a cel-like step. The ground (`DETAIL_ON`) has edges at least 0.12
wide. Only the crowns blend the bands over a wide range (`SOFT_RAMP`, decision 0022), and decision 0022 and the art
bible (§4) say every other surface keeps the three bands: this plan proposes a change to that rule (decision 0084,
proposed).

## Scope

- In: the ramp of `paint()` for the units (figures, guns, horses, flags, the guard's army blocks: `KEEP_HUE`), the
  buildings, the nature meshes (trunks, stones: `nature.frag` but its far crowns) and the ground (`DETAIL_ON`), each
  behind its own switch.
- Out: the `SOFT_RAMP` path and every crown's code (the card crowns and the far crowns: another branch,
  `look/crown-leaves`, reworks them); the shadow colours themselves (the mood); the grade.

## Approach

A page switch `?midtone=0|1|2` (0 = main), and per class `?midtone=u2,b1,n1,g0` (units, buildings, nature, ground),
read once at start and given to the materials as defines (`MID_UNITS`, …), so each class compiles only its own ramp
and main's ramp is untouched at 0. In `paint()`, a material's class picks:

- **1, soft bands:** the same three bands, each edge about 0.24 wide instead of 0.08, the mid band a little lighter.
- **2, wide mid tone:** the light wrapped round the form (a wrapped terminator, as the crowns', but weaker), edges
  about 0.36–0.40 wide so the mid tone spans the turn, the mid band lighter and the shadow band lifted a little toward
  it (still cool: its hue is kept).

The ground keeps its `fwidth` floor; its switch only raises the minimum width. Cast shadows keep their depth (the
shadow map's term pushes the light far below every band edge).

## Acceptance

- Stills (each inspected): soldiers at 15–20 m in sun with the turning side visible, a battalion at the default zoom,
  cavalry and gunners, a building; main | 1 | 2; a sheet beside the Tiny Glade ref; a compare page in the git-ignored output folder (soft-midtone/compare.html).
- Readability: `tools/guard.mjs` on main and on the branch at 1 and 2, reported whole; no new failing block.
- Cost: one bench round main vs the branch on the production build (`tools/bench-look.mjs ?armies=20 --gpu metal`):
  expected free (ALU only); measured.
- Golden diffs reported; the full check batch once at the end.
- The owner picks a mode per class; the chosen one becomes the default in a follow-up (and decision 0084 is accepted
  or rejected).

## Open questions

- Whether the ground should take it at all (a flat field sits deep in the light band; only slopes and the cast
  shadows' edges change).
- Whether the guard's army blocks (boxes) should follow the figures' ramp: they stand in for the figures, so they do.
