---
status: active
last_reviewed: 2026-10-21
---

# Plan: the first armies on the demo map

Asked by the owner on 2026-10-21 ("put some infantry units we've created … see if we put the armies and move it if
we have huge fps or graphics problem"), with two choices: scripted moves first (the sim drives them in the next
PR), and the enemy as the French figure recoloured.

## Problem

The look page paints the world but shows no army; the figures exist (`docs/systems/figure-pipeline.md`, the
published `fr-line-infantry` GLBs) and the crowd renderer was benched on its own branch (`rts-units`, decision 0022
there), not on the current map with its meadow, light and depth of field. Whether 4,000 to 16,000 animated men on
the painted map cost too much, or read badly, is not known.

## Scope

In: the figure baked from the published GLBs into a unit data file (clips by role, colour roles); the crowd
renderer on main (thin instances, GPU skinning from a baked animation texture, two LODs, the figures' own shadow
map); a scripted scenario of two armies facing each other (`?armies=<battalions a side>`); the bench over them
(`?bench&armies=n`, `?unitshadow=0|1`); tests and a review sheet.

Out: the sim's hookup (the next PR), the enemy's own figures, the full-resolution unit pass (decision 0036),
smoke, sound, casualties, other arms.

## Approach

1. `tools/bake-figure.py` (Blender): the two LOD GLBs to `data/figures/fr-line-infantry.unitdata`: the skinning
   matrices at 12 fps for the clips each role uses (halt: Stand; march: Walking; run: Running; fire: Present, Aim,
   Fire, Reload), each vertex's colour role from the figure's texture (coat, facings, white, dark, skin, leather,
   pack, wood, metal), the root speeds that keep the feet planted. Asserts the joins, the loops, the height.
2. `src/look/units-data.ts`: the decoder and its checks. `src/look/units.ts`: one host per battalion per LOD,
   the instance matrices and clip settings written when a battalion moves (once a 1/12 s step) or changes phase,
   the LOD by the figure's pixel height, a side's colours as a palette (`uPal`), the figures' shadow map read by the
   ground and the meadow (`UNIT_SHADOWS`, decision 0047).
3. `src/look/world/armies.ts` (no Babylon): the battalion's slots from the ruleset's drill, the script (column,
   halt, deploy at the run, fire by ranks, a 110 s loop), the layout on open ground (water, trees, buildings, the
   tile's edge kept clear; it throws when a side has no room), the fight's middle as the bench's focus.
4. `src/look/main.ts`: the params, the blocked ground, the bench's focus.

## Acceptance

- `?armies=5`, `10` and `20` load clean (SwiftShader and one Metal load: no compile error, fragment samplers ≤ 16).
- The review sheet (`output/armies-review/1-first.png`, not committed): default view, a battalion firing close, the
  widest view, winter, marching and deploying frames.
- `npm test`, `check:docs`, `check:data` pass; `test/armies.test.ts` covers the slots, the script, the layout's
  loud failure and the baked figure.
- The bench URLs handed to the owner (the frame cost is measured on the preview build: `?bench&armies=5|10|20`, each
  with `&unitshadow=0`).

## Batch A (2026-10-21: the coordinator's bench and research)

Measured on Metal at 1080p (the coordinator's, the view at `?benchat=162.5,-2.5`; main: widest 6.65, default 9.45,
close 8.83 ms): 16,560 figures +2.0 / +0.8 / +0.9 ms without their shadows, +5.4 / +4.3 / +4.6 with. Those runs
predate the NaN fix: the shadow pass drew its vertices but no shadow. Each change behind its own switch:

1. The map drawn only when it would change, its box held (`?ushadowrate=0` off): pixel-identical, on.
2. The casters at the far LOD (`?ushadowlod=1` off): identical at the default and widest zooms, up close the edges
   differ; on, as asked.
3. The meadow's read at the blade's root (`?ushadowvs=1` on): its edges are the blade's; off until judged.
4. `tools/guard.mjs --figures`: the baseline and the far palette's numbers.
5. The far palette (`?farpal=1` on): off until judged.

## Batch B (2026-10-22)

The coordinator's bench of batch A (Metal, 1080p, 16,560 figures; wide / default / close ms): main 6.67 / 9.53 / 8.80,
the armies 9.20 / 10.43 / 10.12, without their shadows 8.55 / 9.87 / 9.45, the map drawn every frame 11.25 / 11.28 /
10.60. The owner then saw the shadows: stair-stepped edges, one dark mass up close. Each change behind its switch:

1. Finer, softer shadows (`?ushadowq=0` off): the box fitted to the ground in view, a soft lookup. Cascades not
   needed (3.9 × 5.5 cm on the ground at r45).
2. The far LOD and the casters posed at load (`?uvat=0` off): the same frames up to rounding. Posed from the bake's
   matrices at load, not in the bake, so the data file is unchanged.
3. The depth-only map with the hardware's comparison (`?udepth=0` off).
4. The casters culled to the view (`?ucull=0` off): the same frames.
5. The panning bench (`?benchpan=1`).

## Batch C (2026-10-22)

The coordinator's bench of batch B (deltas against main, 16k figures): +1.8 wide / +1.2 default / +1.4 close ms;
all batch B defaults kept. The owner's decisions: the far palette by uniform, not by army; the grass's shadow per
blade by default. Then, each behind its switch: far figures larger (`?farscale`), trodden ground (`?trample`), flags
(`?flags`), the layout within the play area (lines and reserves in column).

The near LOD (48 px, ±10 %): at 1080p a figure at r45 is about 67 px tall at the focus, so the battalions near the
focus draw near (to about 57 m from the camera); at 720p it is 45 px there and the switch needs 38 m, nearer than
the closest zoom: at 720p the near LOD all but never draws. Proposed: the switch by the frame's height (48 × height /
1080 px), so it falls at the same distance at every resolution.

## The wide p95 (2026-10-22)

The coordinator's bench of batch C (20 a side): the widest zoom's p95 13.9 ms against main's 8.3, its median +2.4 ms.
A hypothesis (the lazy shadow map drawing every caster in one frame at a pose step) is not confirmed; the owner wants
the cause found before a fix. `?benchtrace=1` (above) records what each frame did, so the slow frames can be matched
to their events.

## Open questions

- The cost on the laptop at 16,000 men, with and without the figures' shadows (the bench, the owner's run).
- The near meadow hides the men's legs at the closest zoom; the far LOD (243 triangles) reads as a dark band at
  the default zoom: the readability guard has not seen them yet.
- Winter: white Austrians on snow (their greatcoats are grey in winter: the enemy's own figure).
