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

- **Their tone:** the paper's cold white, a little darker: the ground with its grain is about 0.93 of the paper, the
  houses 0.88 of it, the churches 0.83 (`HOUSE_TONE`, `CHURCH_TONE`), tunable by eye.
- **Their light:** the boxes' own shader lights them by G2's model: the sun's term from each face's normal (the roof
  as flat ground, a wall by how it faces the sun), in the hills' baked shadow and sky read at the building's place
  (the light texture), the sky less on a wall (as a steep face), divided by flat ground's light, the same floor and
  soft shoulder. A house in a hill's shadow is in shadow; the walls away from the sun take the sky alone.
- **Their shadow on the ground:** not a decal any more. The worker sweeps each standing building's footprint away
  from the sun (as the decal did) and writes it into the cells' mask (its unused G channel, at 2 m), as a share of the
  sun; the shader multiplies the baked sun (B.r) by it, so a building's shadow is the hills' shade, the same tone,
  under the sky. The light's bake stays on 8 m nodes: a house (about 10 m) is too small for it.
- **The shadow's length:** from the building's wall height, at most 100 m. The ground's light reads its heights ×3 (`RELIEF.z`);
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

1. Shadows on the buildings themselves: a wall toward the sun takes the ground's shadow a cell out from its foot over
   its whole height, and a roof none (its height is not in the mask): a tall church wall beside a low house's shadow
   goes dark to its top, a low roof in a church's shadow stays lit. A height per cell in the mask would settle both.
2. The buildings' sky occlusion on the ground (a street between two rows of houses sees less sky): not baked at 8 m;
   a darkening near walls if the owner asks.

## Review

Round 1 (`/code-review high`, 10 findings, 2 taken as severe):
- fixed, severe: a roofless ruin shaded its whole floor (its walls only now; tested); the footprint's own share bled
  past its walls into the sun through the texture's filter, a dark rim on every sunlit side (the footprint left out of
  a roofed building's mask; tested);
- fixed: the shadow's length capped at 100 m (a low `?sun=` or a large `?bz=` swept the bake across the map);
  `standing` run once, in the worker, its buildings sent to the page; a compile error in the buildings' shader
  reported; the engine's stencil (the decal's) gone; stale comments; the plan's tones; `clampSun` once;
- kept: the shadows on the buildings themselves (open question 1).

`?bz=`: the owner's choice, 1 first (2026-10-30).
