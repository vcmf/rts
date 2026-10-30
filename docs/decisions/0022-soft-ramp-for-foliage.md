---
status: accepted
date: 2026-10-13
---

# 0022 Foliage crowns are painted with a soft ramp

Amended by [0084](0084-a-soft-mid-tone-on-figures-and-buildings.md) (2026-10-30): the figures, the buildings and the nature
meshes no longer keep the hard three bands; the ground and the water do.

## Context

The art bible's core rule paints every surface in three value bands, light, mid and shadow, with grain-broken
edges between them (`docs/art-bible.md` §4). On the leaf-card crowns (L7a) that rule cut each crown into three flat
patches of whole cards. The owner (2026-10-13), of Tiny Glade's trees: the crowns are 2D textures, but their soft
light makes them read as 3D volumes. L7b (#61, `docs/plans/done/l7b-crown-volume.md`) lit the card crowns as
volumes; a crown's range of values more than doubled (the plan's measurement). The soft ramp is one of L7b's five parts (the others: a normal per pixel, the light through the crown,
the core, a tilt per leaf); its own cost was not measured apart from them, and L7b's is in
`docs/plans/active/track-e-results/shadows-foliage.md`. The owner: "it's beautiful now the trees".

## Decision

We will paint foliage crowns with a **soft ramp**: the same three painted colours, the shadow band still cool and
hue-shifted, blended over a wide range of light instead of three steps; the light wraps round the mass of leaves;
the mid colour keeps the foliage's saturation. It applies to the card crowns (`SOFT_RAMP` in `paint()`, set on the
card material). Every other surface (ground, water, buildings, armies) keeps the three bands.

## Consequences

- Good: crowns read as round masses at the near and mid zooms; the soft self-shadow, the darker core and the light
  per leaf have a ramp that shows them.
- Good: the bands still decide the colours, so the palette and the cool shadow rule hold.
- Bad: two ramps to keep in step; a change to the bands must be checked on the crowns too.
- Bad: the crowns' cost (L7b's, the results above) still to be measured in a forest and on the min-spec laptop;
  the cards themselves cost the most where a forest fills the frame (`docs/plans/done/forest-bench.md`).
- Bad: the crowns hold more mid values than the ground, which the readability guard must keep watching (the cards'
  own shadow already costs a dark coat its separation: #63).

## Alternatives considered

- **More bands** (five, still stepped): keeps the rule's letter, but the crowns still break into patches at the
  card's scale.
- **A gradient across the crown only, with the hard bands kept:** judged, not measured: three hard bands turn a
  smooth light into three patches again, which is the fault this decision answers.
- **A full-screen painterly filter** over the foliage: against decision 0001 (the look lives in the materials).
