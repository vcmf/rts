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
- **Their shadow on the ground:** not a brown decal. Each building's walls swept away from the sun
  (`shadowQuads`, `src/render/lit/houses.ts`), drawn over the plane as geometry with a shader of the ground's light
  (`shaders/shadows.frag`): it multiplies the frame by the ground's light with the sun's share taken out over the
  ground's light with it, so a building's shadow is the hills' shade on the same ground, its edges the walls' own;
  the stencil darkens each pixel once. (First built as a share of the sun on the 2 m cells, in the mask: redesigned,
  Review.)
- **The shadow's length:** from the building's wall height, at most 100 m. The ground's light reads its heights ×3 (`RELIEF.z`);
  whether a building's shadow is cast from its true height or ×3 too is the owner's call by eye: `?bz=` (default 1, its
  true height), shots of both.
- `standing` (`src/render/lit/houses.ts`) runs in the worker too, so the mask and the boxes stand the same buildings.

Out of scope: the woods (after the campaign map's); the 3D world's buildings (G3).

## Acceptance

- The shadows tested (`test/render-lit-houses.test.ts`): a house's shadow away from the sun, its length from its
  height and the sun's, none toward the sun, `bz` and its cap, terraced houses as one shadow, a courtyard's own shadow,
  a roofless ruin's floor by its walls.
- Screenshots of Sokolnitz and Pratze close up, before and after, `?bz=1` and `?bz=3`, in `scratch/g2/`; the owner's
  eye.
- The page check (`tools/map-page-check.mjs`) passes: a save redraws within a second.

## Decisions

- Decision 0090 amended in place (proposed still): the buildings lit by the same model, their shadows in the sun's
  share.

## Open questions

1. Shadows on the buildings themselves: another building's shadow falls on the ground only, not on a wall or a roof
   (a low roof in a church's shadow stays lit).
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

Round 2 (9 findings, 2 severe):
- fixed, severe: a cell across a shaded wall counted its footprint's samples lit, a pale line at the wall's foot (the
  share of the open samples only; tested); another building's shadow held on a roofed footprint bled into its sunlit
  side (every roofed footprint left out, not the caster's alone; tested);
- fixed: the footprint's swept copy dropped (it lies within the footprint and the walls' quads); a negative `bz` cast
  toward the sun (clamped in the bake; tested) and its default in one constant (`BUILDING_BZ`); the mask's G tested; a
  ruin's inner faces lit as its outer ones (the normal turned toward the camera); no roof vertices for a ruin;
- answered: the bake's cost: 10 to 18 ms on Austerlitz's 126 standing buildings, 116 ms at a 5° diagonal sun and
  `?bz=3` (Node, the dev Mac, a load of 18), so no row scan; a shadow past the map's edge stops at it (open question
  2); a tone a vertex in four floats (kept: the boxes are a few thousand vertices).

`?bz=`: the owner's choice, 1 first (2026-10-30).

Round 3 (10 findings, 2 severe): where two shadows met inside a cell they made a half-lit stripe (terraced houses along
their party wall); the footprints left out of the share bled a lit rim into the shade at a shaded wall's foot. A third
round with severe findings: **redesigned** (AGENTS.md). Every round had found one edge of the same flaw: a polygon's
shadow kept as a share on 2 m cells and read through a bilinear filter smears every edge (a sunlit wall, a shaded
wall, a party wall, the map's edge), and leaving footprints out only moved the smear. The shadows are geometry again
(M6b's swept footprints, the stencil), lit as the ground: exact edges, overlaps darkened once, past the map's edge
onto the paper. The mask's G channel is unused again. Also from round 3: decision 0090 amends 0065 (the houses' look);
the camera's place set before the first frame; the roof triangulated only when there is one. The round count
restarts.
