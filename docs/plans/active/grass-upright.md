---
status: active
last_reviewed: 2026-10-29
---

# Plan: upright meadow grass and wheat without bare earth

## Problem

The owner (2026-10-29, close zoom): the meadow's blades are too high and splayed outward; he wants them "more straight
up" (standing upright instead of fanning out), a short, dense, upright carpet like Tiny Glade's grass. In the wheat,
bare earth shows between the clumps ("there's still terrain, empty, seeing no wheat between").

## Scope

- **The meadow** (`meadow.vert`, the combed clumps): the blades upright: the flow's lean narrower around vertical and
  the clump's own fan partly undone (as the crops already undo it), a little shorter and denser up close, so it reads
  as a carpet. The flow's direction cues kept where they still read. Never taller than today (`HEIGHT_MAX`):
  the soldiers' feet and formations no more hidden.
- **The wheat**: no bare earth between its clumps at the zooms where it shows: the near ground under the wheat
  (`meadowUnder`) painted toward the wheat's own deep colour instead of a dark ochre that reads as soil, and the clumps
  fuller (wider at the root, none thinned out by the clump field). Its height rule stays (decision 0026).
- Variants behind switches for the owner to pick by eye: `?grassup=0|1|2` (0: main's meadow) and `?wheatfill=0|1`
  (0: main's wheat). The default the recommended one.
- Docs: `docs/systems/look.md` (the meadow and the crops).

Not in scope: new meshes, the far ring's look, the brush arm (`?grass=brush`).

## Approach

Numbers as defines from `src/look/meadow-spec.ts`, one shader, no new pass: the lean and fan are a few multiplies in
the vertex shader; the shorter blades cover fewer pixels (less overdraw), which should pay for any added density.
The clump reach used for the growth rules stays main's (an upper bound: an upright clump reaches less).

## Acceptance

- Stills main | variants at 15 to 20 m and the default zoom, the meadow with soldiers (`?armies=20`) and the wheat,
  and a sheet next to the Tiny Glade reference; a local compare page. The owner judges.
- The bench (Metal, production build, close / default / wide, alternated rounds main vs branch): no added cost, or
  the trade given with numbers. The target: 120 fps (8.3 ms); the grass is the main close-zoom cost (#257).
- The guard against main (`?armies=20`); the goldens' diffs reported (expected in the meadow and wheat); `npm test`,
  `check:data`, the docs check, the build.

## Results

- **Looks:** `?grassup=2` (the default): the lean 0.05 to 0.25 of the height (main 0.18 to 0.75), 70 % of the clump's
  fan undone, the height 0.8 times main's on every ring (0.9 × 0.8 of main's 1.15 up close), the inner rings' clumps
  1.8 times as wide (main 1.4) and none thinned out up close (main kept down to 0.8). `?grassup=1`: the lean and the
  fan alone, main's height and density. `?wheatfill=1` (the default): `CROP_WIDE` 1.9 (main 1.5), no thinning, the
  ground under the near standing wheat 85 % toward a deep gold. The soldiers' legs show more in the shorter grass.
- **The bench** (Metal, production build, `?armies=20`, frame p50 averaged over the three yaws, two alternated rounds,
  each at a load of 3 or less; main / this branch):

  | zoom    | main 1 | branch 1 | main 2 | branch 2 | `grassup=1` |
  | ------- | -----: | -------: | -----: | -------: | ----------: |
  | close   |   9.34 |     8.60 |   9.28 |     8.63 |        8.59 |
  | default |  10.07 |     9.86 |  10.19 |     9.89 |        9.92 |
  | wide    |   8.20 |     8.16 |   8.22 |     8.13 |        8.16 |

  About 0.7 ms less at the close zoom, 0.25 at the default, none at the widest: the upright clumps cover fewer pixels
  (the fan undone is most of it: `grassup=1` saves as much), which pays for the wider, denser, fuller clumps.

- **The checks:** the guard against main (`?armies=20`, summer and winter): ok, the wheat's blocks separate better
  (fr 0.280, main 0.233; ru 0.253, main 0.213), the fails\* as on main; its crops view: ok. The goldens: with
  `?grassup=0&wheatfill=0` identical to main at every camera; the default differs in the meadow and the wheat at every
  summer camera (winter identical: the snow keeps main's clumps, the wheat is ploughed under), the expected change.
  `npm test`, `check:data`, the docs check, the build: exit 0.

## Decided

- **The owner** (2026-10-30): "I like straighter and shorter grass, and wheat fill more space": the defaults
  `?grassup=2` and `?wheatfill=1` as built, recorded in decision 0085; the other looks stay as switches for
  comparisons.
- **Review** (one round, nothing severe): the fill limited to the standing wheat (the green crop and stubble as main:
  their pixels measured against main's at 20 m, under 0.04 % differing); the looks parsed in `src/look/meadow-look.ts`
  (tested), `?grassup` refused with `?grass=brush`; the clump reach from `RINGS` and the meshes' measured radii; the
  middle ring's look faded across its band out, so the carpet meets the outer ring's sparse clumps without a seam
  (checked by eye at 30 to 60 m).
