---
status: active
last_reviewed: 2026-10-30
---

# Plan: G2b, the buildings part of the landscape, in its light

Track G (`docs/plans/active/track-g.md`), on `epic/gameplay-map`, after G2 (`docs/plans/active/g2-staff-light.md`,
decision 0090).

## Problem

The owner, on G2 (2026-10-30): "houses, buildings should be the same tone as the map, cold white, maybe a tiny bit
darker, and should have the same lighting and shadow as the mountain; basically make buildings part of the landscape,
and apply the lighting and shadow upon them." Since M6b the lit view raises the houses, barns and churches as dark
brown boxes (`HOUSE`, `CHURCH`), their walls lit by a facing term of their own, each with a brown translucent decal
swept away from the sun as its shadow: a second light, apart from G2's baked sun and sky.

## Scope

- **Their tone:** the paper's cold white, a little darker (houses about 0.93 of the paper, churches about 0.88),
  tunable by eye.
- **Their light:** the boxes' own shader lights them by G2's model: the sun's term from each face's normal (the roof
  as flat ground, a wall by how it faces the sun), in the hills' baked shadow and sky read at the building's place
  (the light texture), the sky less on a wall (as a steep face), divided by flat ground's light, the same floor and
  soft shoulder. A house in a hill's shadow is in shadow; the walls away from the sun take the sky alone.
- **Their shadow on the ground:** not a decal any more. The worker sweeps each standing building's footprint away
  from the sun (as the decal did) and writes it into the cells' mask (its unused G channel, at 2 m), as a share of the
  sun; the shader multiplies the baked sun (B.r) by it, so a building's shadow is the hills' shade, the same tone,
  under the sky. The light's bake stays on 8 m nodes: a house (about 10 m) is too small for it.
- **The shadow's length:** from the building's wall height. The ground's light reads its heights ×3 (`RELIEF.z`);
  whether a building's shadow is cast from its true height or ×3 too is the owner's call by eye: `?bz=` (default 1, its
  true height), shots of both.
- `standing` (`src/render/lit/houses.ts`) runs in the worker too, so the mask and the boxes stand the same buildings.

Out of scope: the woods (after the campaign map's); the 3D world's buildings (G3).

## Acceptance

- The shadow mask tested (`test/render-lit-bake.test.ts` or `test/render-lit-houses.test.ts`): a house's shadow
  away from the sun, its length from its height and the sun's, none toward the sun, a courtyard's own shadow, a
  roofless ruin's walls only.
- Screenshots of Sokolnitz and Pratze close up, before and after, `?bz=1` and `?bz=3`, in `scratch/g2/`; the owner's
  eye.
- The page check (`tools/map-page-check.mjs`) passes: a save redraws within a second.

## Decisions

- Decision 0090 amended in place (proposed still): the buildings lit by the same model, their shadows in the sun's
  share.

## Open questions

1. The buildings' sky occlusion on the ground (a street between two rows of houses sees less sky): not baked at 8 m;
   a darkening near walls if the owner asks.
