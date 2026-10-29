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
  it (still cool: its hue is kept; not on units, below).

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

## The figures (round 3)

At u2 the figures barely changed (the coordinator, the guns at 18 m). A debug view of the band (t) on the gunners
showed why: with the sun 27° up and the camera looking down at 50°, the sides seen on a figure turn about −0.55 from
the sun, deep in every mode's shadow band; the mid was a thin line on the faces near the terminator. The figures' own
normals are smooth (the bake keeps the vertices' normals, tools/bake-figure.py), so the ramp, not the mesh, made the
step on infantry and gunners. `u3` (units only) spreads shadow-to-mid over −0.95..0.10: a coat's shade side passes
through the mid. Against the guard, the shadow colour is 20 % deeper (the British red on a winter meadow fell under the
bar without it) and a near-white coat keeps main's bands. The cuirassiers' hard steps are the decimated mesh's facets
(large flat triangles), which no ramp smooths: smoothed normals in the figure bake are a separate change.

## Cost

Three alternated rounds on the merged production build (Metal, 1080p, `?armies=20`, each run under the bench lock at
a 1-minute load ≤ 3), main's shading (`?midtone=0`) against `?midtone=u3,b2,n2`, the GPU frame's p50 (ms) per round:
close +0.05, +0.01, +0.02; default +0.09, +0.03, +0.04; wide +0.16, +0.05, +0.06. Every round a little slower, under
0.1 ms but the wide zoom's first; a first single round (u2 at every class) had shown +0.4 to +0.8 ms, in the arm that
had no mid tone too: not reproduced.

## Open questions

- Whether the ground should take it at all. Measured: it changes the whole terrain's modelling, not only shadow
  edges (the golden start view, mean difference 25 of 255 in a region at 2, 6.5 at 1; the slopes turned from the sun
  lifted toward the light), so the arm to judge first keeps it at 0 (`?midtone=u2,b2,n2`).
- Whether the guard's army blocks (boxes) should follow the figures' ramp: they stand in for the figures, so they do.
