---
status: active
last_reviewed: 2026-10-12
---

# Plan: the shadows' look (stronger, cooler, contact)

Track E, stage 1 (`docs/plans/active/track-e-look.md`), between L5 and L7. Art direction: `docs/art-bible.md` §4
(the shading ramp: shadow "hue-shifted cool… more saturated than the base, never just darker"; "shadows are
painted shapes in the cool shadow colour, with grain-broken edges"), §6 (valley mist), pillar 1 (readable).

## Problem

The owner (2026-10-12): "the shadow work of our trees in the whole map looks weak". Measured on the look page
(`?trees=cards`, mid view, 1600×900; the luma of a tree's cast shadow over the luma of lit ground beside it):

| Where | All on | Mist and shafts off | Mist, shafts, grade, bloom, clouds off |
|---|---|---|---|
| In the valley | **0.98** | 0.61 | 0.57 |
| On the slope | 0.69 | 0.69 | 0.68 |

1. **The valley mist erases cast shadows**: it lays up to 42 % of a light air colour over shadow and sun alike,
   so in the valley a tree's shadow is as bright as the lit grass beside it.
2. **The shadow colour is not cool enough**: with every atmospheric pass off, shadowed grass is olive grey
   (about RGB 52, 76, 53). `shadowOf()` mostly darkens the base; the art bible asks for a hue shift toward teal,
   blue or violet, more saturated than the base.
3. **Shadows are soft blobs**: the light-map bake filters edges over about 1.3 m (12 taps, `bake.frag`), so the
   shapes read as smudges, not painted shapes.
4. **Trees do not sit on the ground**: the occlusion under a crown is a faint wide disc (`bakes.ts`, canopy).

## Scope

One shared change of the look, all in the painter and the bakes (no new pass; a few more operations a fragment in
`shadowOf()` and `mist()`, unmeasured: an estimate of no visible cost; the bakes run once):

- **A. Mist respects shadows** (`mist()` in `painter.glsl`): the veil thins where the ground lies in cast shadow,
  and shadowed air is darker and more saturated than lit air.
- **B. A stronger cool shift** (`shadowOf()`): more saturation, a hue turned toward teal and violet, a larger value
  step from the mid band. Winter: snow in shadow stays a clear painted blue, never grey (art bible §4b).
- **C. Crisper painted edges** (`bake.frag`): a tighter filter, the grain still breaking the edge.
- **D. Contact** (`bakes.ts`): a darker core of occlusion under each crown, so trees sit on their ground.

Not in scope: the leaf cards' own shadows (the L7a plan, on its own branch), cloud
shadows, the grade.

## Acceptance

- `npm test`, full output and exit code.
- Before and after pairs (main against this branch) at the near, mid, far and winter views for the owner, and the
  shadow-to-lit luma ratios above measured again (target: the valley no brighter than 0.75, the slope about 0.55).
- Readability: `node tools/guard.mjs <this branch> --base <main>` passes (no army block that separates on main
  may fail here; darker shadows must not swallow a formation).
- The goldens are expected to differ (this is a look change); the diff is reported, not gated.

## Results (2026-10-12)

Pairs (not committed; `scratch/` in this worktree): `scratch/shadow/{near,mid,far,winter}.png`, main beside this branch.

| Cast shadow ÷ lit ground (luma) | main | this branch | the deeper variant (not kept) |
|---|---|---|---|
| In the valley | 0.98 | **0.78** | 0.65 |
| On the slope | 0.69 | 0.70 | 0.62 |

- **What is kept:** A (the mist thinner over cast shadow, shadowed air darker), B as a hue and saturation shift
  at main's exact value (the band's value is computed as main's and the cooler colour is scaled to it), C (edge
  filter 0.75 instead of 1.2 texels a tap), D (a contact core under each tree's crown).
- **The readability guard and the trade-off:** one block sits exactly on the threshold on main: `wheat.France`
  in summer, a dark blue block in a tree's cast shadow, separation 0.100 (its neighbour `wheat.Britain` is 0.099
  on main, a known `fails*`). Every variant that makes cast shadows visibly darker darkens the ground under it:
  the deeper variant (cast shadows 25 % darker, a darker band) gives 0.085 to 0.092; this branch 0.098. Tried
  and ruled out as the cause, one at a time: the mist's thinning and its air colour, the edge filter, the
  contact core, the clamp of saturated coats. The guard's rule (no block that separates on main may fail) is
  for the owner to waive or not: the loss is 0.002 on one block, against shadows that read in the valley.

## Review (`/code-review high`)

- **Round 1** (223dd55): severe: the contact core sat in the occlusion channel the crowns read too, so it
  darkened the crowns' tops more than the ground (now in the light map's alpha, read by the terrain only); the
  cool pull dulled army coats in shadow, against "armies are the most saturated" (the blocks keep the old band:
  `KEEP_HUE`); the guard's regression (the owner's decision, above). Moderate: with shadows off the mist still
  thinned in their shape (now gated by the switch); raised surfaces took the ground's shadow for the mist (now
  fading with the height); the system doc. Light: the tree flag read from a strength value (now explicit), the
  contact loop copied (folded into one), the cool colour normalised twice (simplified). Not observed: stair-steps
  from the tighter filter (the winter edge at 2× stays grain-broken).
- **Round 2**: no severe finding. Fixed: the contact read by the terrain but not by the water's shore band nor
  the grass (one `groundOcc()` for all three), the mist's air still showing shadow shapes with shadows off, the
  cost claim (now an unmeasured estimate), the light map's channel comments, the core's real minimum size,
  `KEEP_HUE` passed where the block material is made. Review stops here.
