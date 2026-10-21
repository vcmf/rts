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

## Open questions

- The cost on the laptop at 16,000 men, with and without the figures' shadows (the bench, the owner's run).
- The near meadow hides the men's legs at the closest zoom; the far LOD (243 triangles) reads as a dark band at
  the default zoom: the readability guard has not seen them yet.
- Winter: white Austrians on snow (their greatcoats are grey in winter: the enemy's own figure).
