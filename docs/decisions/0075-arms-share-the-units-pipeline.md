---
status: proposed
date: 2026-10-27
---

# 0075 The cavalry and the artillery share the units pipeline; a figure on more than its root measures its shadow from its contacts

Amends 0062 and 0074 (the soldiers' simple shadow) for figures other than the infantryman; his shadow is unchanged.
Proposed for the owner's review. The plan and its measurements: `docs/plans/active/cavalry-artillery-demo.md`; as
built: `docs/systems/look.md` ("The armies").

## Context

- The owner, 2026-10-27: the cuirassiers and the foot battery on the armies demo, mainly to see whether the
  soldiers' shadows work on a horse and a gun.
- The renderer (`src/look/units.ts`) drew one figure, the infantryman, for one script, the battalion's. His shadow
  (0062, 0074) is measured from his root, which is where his feet are: the look's gradient from the soles, the
  shortening up close about them, the lift toward the camera from them, the feet's boost by the distance from them.
- A horse stands on four hooves up to 1.36 m from its root, a gun and its crew up to 3.6 m: measured from the root,
  the front hooves' shadow moved off them, one half of a horse was dark and the other light, and the feet's boost fell
  between the legs.

## Decision

- **One renderer an arm, the page-wide parts owned once.** Each arm (a figure, a script, its units) is a `Units`. The
  trodden ground's mask is its own (`src/look/trodden.ts`, fed by every arm's men), the shade and the stencil the
  page's (as before), the ground's heights one a scene; the figures' shadow map behind its switches and its
  receivers belong to one arm, the infantry's (`ownsMap`); the others draw their simple shadows at every zoom, and
  none under `?ushadowfar=map` (the map holding the infantry alone), the close look by zoom under
  `?ushadowclose=map`, no contact oval under `?ushcontact`. The infantry's code path is as before.
- **The figure's data names its own.** The unit data's header names a figure's roles in order (at most four: the
  shadow's shader holds four), each colour role's cloth part or material (decision 0068: the dyes, never a colour), and
  its height (the LOD switch's); absent, the infantryman's. The bake (`tools/bake-figure.py`) has a profile a figure
  kind, and makes a multi-part figure's LODs itself: its GLB's mesh welded, then decimated, a LOD lighter than the
  welded shell decimates to voxel remeshed first; every lighter LOD must cover what the nearest covers
  (`test/figure-lods.test.ts`).
- **Scripts behind one interface.** The renderer asks a script for a unit's phase and each man's place, way and role;
  the scenario names the arms (`ARMS_DEMO`: a ride, a service), the ruleset their shapes. Nothing in the engine names
  a horse or a gun (decision 0015).
- **A spread figure's shadow from its contacts** (its contacts reach past 1 m from its root, `SPREAD_FROM`): its
  per-step shape keeps, per texel, the height of the lowest part casting it (an R8 atlas at half the size), and the
  look's gradient and the feet's boost run on that height, so each hoof, wheel and gunner's foot is dark and crisp
  where it stands. It is drawn at its own length (no shortening about its root), its lift floored at 10 cm (at the
  ground's sampled height a gun's footprint sank under the terrain) with its strip's close rows at its contacts' reach.
- **A big figure's cell fits:** the shape's texel grows (by 1.25 at a time) until a cell fits 192 texels a side (the
  battery's 7.8 cm; the infantryman's and the cuirassier's stay 5 cm).

## Consequences

- The arms' shadows stand on their hooves, wheels and feet; up close they are as long as the sun casts them, longer
  than the infantryman's shortened ones (0062's close look), and they read weaker on the tall meadow than on bare
  ground (as his do).
- Memory and load: the plan's tables (the cavalry's shapes 16.7 MB, the battery's 10.7 MB; the battery's posed
  vertices 35 MB for its 264 steps; the armies ready 1.45 s later).
- Frame cost (Metal, the plan's tables): with a regiment and a battery in view 1.6, 1.1 and 2.5 ms at 20, 40 and
  63 m, nearly all the figures' own (their shadows 0.1 to 0.25 ms); from the fight's middle 0 to 0.55 ms.
- The figures' shadow map (`?ushadowclose=map`, `?ushadowfar=map`, test switches) holds the infantry alone; the
  arms keep their simple shadows.
- `?cavalry=0&artillery=0` is the page before them.

## Alternatives considered

- **One renderer holding every figure:** the cleaner shape for the sim's many unit types, but a rewrite of the
  renderer's every part for a demo; an arm a renderer keeps the infantry's path as it was. (First built as a lead
  arm holding the mask and the map for its followers; review round 1 moved the mask out and left one flag.)
- **Shortening a spread figure's shadow about its root:** moved the front hooves' shadow off them by 0.4 m at 0.7.
- **Baking its per-step shape at the close look's length:** right up close, but a jump in length where the far
  material takes over at 100 m.
- **A lift ramp from the contacts' reach:** spared nothing visible on the legs and let the meadow's grass hide the
  shadow under the horses.
