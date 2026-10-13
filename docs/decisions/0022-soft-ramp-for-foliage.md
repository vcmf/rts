---
status: proposed
date: 2026-10-13
---

# 0022 Foliage crowns are painted with a soft ramp

## Context

The art bible's core rule paints every surface in three value bands, light, mid and shadow, with grain-broken
edges between them (`docs/art-bible.md` §4). On the leaf-card crowns (L7a) that rule cut each crown into three flat
patches of whole cards. The owner (2026-10-13), of Tiny Glade's trees: the crowns are 2D textures, but their soft
light makes them read as 3D volumes. L7b (#61, `docs/plans/active/l7b-crown-volume.md`) lit the card crowns as
volumes; on one lone crown the light's range went from luma 131–170 to 84–182, and its distinct value levels from
13 to 29, at no measurable GPU cost. The owner: "it's beautiful now the trees".

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
- Bad: the crowns hold more mid values than the ground, which the readability guard must keep watching (the cards'
  own shadow already costs a dark coat its separation: #63).

## Alternatives considered

- **More bands** (five, still stepped): keeps the rule's letter, but the crowns still break into patches at the
  card's scale.
- **A gradient across the crown only, with the hard bands kept:** the bands swallow most of it (the first L7b try
  measured this: the crown's thirds barely moved).
- **A full-screen painterly filter** over the foliage: against decision 0001 (the look lives in the materials).
