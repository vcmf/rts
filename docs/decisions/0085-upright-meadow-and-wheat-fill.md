---
status: accepted
date: 2026-10-30
---

# 0085 The meadow's grass upright and shorter, the wheat filled

Accepted by the owner on 2026-10-30 ("I like straighter and shorter grass, and wheat fill more space"), from the
stills and the compare page of `docs/plans/active/grass-upright.md`; as built: `docs/systems/look.md` (the meadow and
the crops). It amends decision 0041's look of the combed clumps (the combed meadow stays the default grass); the
wheat's height rule (decision 0026) is unchanged.

## Context

The owner (2026-10-29, close zoom): the combed meadow's blades were too tall and splayed outward; he wanted them
standing upright, a short, dense carpet like Tiny Glade's grass. In the wheat, bare earth showed between the clumps.

## Decision

We will draw the combed meadow's clumps upright and shorter: the flow's lean 0.05 to 0.25 of the height (was 0.18 to
0.75), 70 % of the clump's own fan undone, the height 0.8 times what it was on every ring, and up close (the inner
rings) the clumps 1.8 times as wide and none thinned out between the patches (`GRASS_UP[2]`,
`src/look/meadow-spec.ts`). We will fill the standing wheat: its clumps 1.9 times the grass clump's spread at the root
(the other crops keep 1.5), none thinned out by the clump field, and the ground under the near standing wheat painted
toward the wheat's own deep gold. The green crop and stubble stay as they were.

The looks before it stay as switches for comparisons, as `?grass=brush` does: `?grassup=0` (the splayed clumps), `1`
(upright at the old height and density), and `?wheatfill=0`; with `?grassup=0&wheatfill=0` the page draws what it drew
before (the goldens match).

## Consequences

The frame is cheaper: about 0.7 ms at the close zoom and 0.25 ms at the default on the dev Mac (Metal, two rounds), as
upright clumps cover fewer pixels. The soldiers' legs show more in the shorter grass. Goldens taken before this change
differ in the summer meadow and wheat. The growth's rules keep the old, larger clump reach (`CLUMP_REACH_FLOW`), so
the meadow map is the same for every look.

## Alternatives considered

- Upright alone, at the old height and density (`?grassup=1`): the owner preferred the shorter carpet.
- A second, low layer of stalks under the wheat: more draws for what the painted ground under it gives at no cost.
- Removing the old looks: they cost nothing while unused and are the comparisons' base.
