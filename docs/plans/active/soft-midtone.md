---
status: active
last_reviewed: 2026-10-30
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
bible (§4) said every other surface keeps the three bands: this plan changed that rule (decision 0084, accepted
2026-10-30).

## Scope

- In: the ramp of `paint()` for the units (figures, guns, horses, flags, the guard's army blocks: `KEEP_HUE`), the
  buildings, the nature meshes (trunks, stones: `nature.frag` but its far crowns) and the ground (`DETAIL_ON`: the
  terrain and the water), each behind its own switch.
- Out: the `SOFT_RAMP` path and every crown's code (the card crowns and the far crowns: another branch,
  `look/crown-leaves`, reworks them); the shadow colours themselves (the mood); the grade.

## Approach

A page switch `?midtone=0|1|2` (0 = the bands before it), and per class `?midtone=u3,b2,n2,g0` (units, buildings,
nature, ground), read once at start (`src/look/midtone.ts`) and given to the materials as defines (`MIDn_U`, `MIDn_B`,
`MIDn_N`, `MIDn_G`), routed in `paint()` by the material's class (`KEEP_HUE`, `PAINT_BUILDING`, `PAINT_NATURE`,
`DETAIL_ON`), so each class compiles only its own ramp and 0 compiles the old one. The modes:

- **1, soft bands:** the same three bands, each edge about 0.24 wide instead of 0.08, the mid band a little lighter.
- **2, wide mid tone:** the light wrapped round the form (a wrapped terminator, as the crowns', but weaker), edges
  about 0.36–0.40 wide so the mid tone spans the turn, the mid band lighter and the shadow band lifted a little toward
  it (still cool: its hue is kept; not on units, below).
- **3, the figure's turn** (units only): below, "The figures".

On the ground the switch only raises the band edges' minimum width (its `fwidth` floor kept). Cast shadows keep their depth (the
shadow map's term pushes the light far below every band edge).

## Acceptance

- Stills (each inspected): soldiers at 15–20 m in sun with the turning side visible, a battalion at the default zoom,
  cavalry and gunners, a building; main | 1 | 2; a sheet beside the Tiny Glade ref; a compare page in the
  git-ignored output folder (soft-midtone/compare.html).
- Readability: `tools/guard.mjs` on main and on the branch at 1 and 2, reported whole; no new failing block.
- Cost: one bench round main vs the branch on the production build (`tools/bench-look.mjs ?armies=20 --gpu metal`):
  expected free (ALU only); measured.
- Golden diffs reported; the full check batch once at the end.
- The owner picks a mode per class; the chosen one becomes the default and decision 0084 is accepted or rejected.

## The figures

At u2 the figures barely changed (the coordinator, the guns at 18 m). A debug view of the band (t) on the gunners
showed why: with the sun 27° up and the camera looking down at 50°, the sides seen on a figure turn about −0.55 from
the sun, deep in every mode's shadow band; the mid was a thin line on the faces near the terminator. The figures' own
normals are smooth (the bake keeps the vertices' normals, tools/bake-figure.py), so the ramp, not the mesh, made the
step on infantry and gunners. `u3` (units only) spreads shadow-to-mid over −0.95..0.10: a coat's shade side passes
through the mid. Against the guard, the shadow colour is 20 % deeper (the British red on a winter meadow fell under the
bar without it) and a near-white coat keeps main's bands. The cuirassiers' hard steps are the decimated mesh's facets
(large flat triangles), which no ramp smooths: smoothed normals in the figure bake are a separate change.

## Results

- **The pick** (the owner, 2026-10-30): `u3,b2,n2`, the ground at 0, the page's default (`MIDTONE_DEFAULT`);
  `?midtone=0` the look before it. Decision 0084 accepted; it amends 0022 and the art bible's §4.
- **Readability** (`tools/guard.mjs --base` the old bands): one new failing block, a white coat on snow on open
  ground in winter, 0.098 against 0.102 (the bar 0.1): this plan's acceptance, "no new failing block", is unmet, and
  the owner accepted it as #268 (the coat's own ramp ruled out: the issue). Every other block as before, the British
  red on a winter meadow kept over the bar by the deeper shadow.
- **Goldens** (`tools/golden.mjs`, main's build as the base): `?midtone=0` matches main at every camera (0 of 16
  regions differ); the default differs at 7 of 8 cameras (worst region: 5.3 % of its pixels, a mean of 1.1 of 255),
  the buildings and the nature meshes (the goldens show no figures). The guard as above, against main's build.
- **The cuirassiers** keep their facets: #267 (smoothed normals in the figure bake).

### Cost

Three alternated rounds on the merged production build (Metal, 1080p, `?armies=20`, each run under the bench lock at
a 1-minute load ≤ 3), main's shading (`?midtone=0`) against `?midtone=u3,b2,n2`, the GPU frame's p50 (ms) per round:
close +0.05, +0.01, +0.02; default +0.09, +0.03, +0.04; wide +0.16, +0.05, +0.06. Every round a little slower, under
0.1 ms but the wide zoom's first; a first single round (u2 at every class) had shown +0.4 to +0.8 ms, in the arm that
had no mid tone too: not reproduced.

## Open questions

- The ground stays at 0: its switch changes the whole terrain's modelling, not only the shadows' edges (the golden
  start view, a mean difference of 25 of 255 in a region at 2, 6.5 at 1; the slopes turned from the sun lifted).
- The guard's army blocks (boxes) follow the figures' ramp: they stand in for the figures.
