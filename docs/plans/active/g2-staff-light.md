---
status: active
last_reviewed: 2026-10-30
---

# Plan: M10, the staff map lit as a model, after the campaign map

Track M. The map page's lit view (`src/render/lit/`, M6, decision 0064), lit the way Track K's campaign map is
(`docs/plans/active/k1-theatre-look.md` on `proto/k1-theatre-look`, PR #262, § The rebuild). PRs into `main` (the map
epic is merged, #49).

## Problem

The owner, on K1's campaign print (2026-10-30): "the techno is super interesting, we've a super beautiful map, I want
to apply the same lighting and map effect" on the battle's staff map, "we don't need exaggeration of height like in
our campaign map, the rest yes". The staff map's light (M6a) is a slope light, a hard cast shadow and an exposure
term, from one of the grid's eight directions, multiplied into a parchment; K1 lights a model with a warm sun and a
cool sky, both shadowed (a soft shadow toward a sun disc, the sky's occlusion), under the colours of the owner's
Valdez print.

## Scope

**M10a (this PR): the light and the palette.** The plane stays flat (decision 0064): no raised mesh, no lift of the
heights. The light's slope keeps the staff map's own ×2 for shaded relief (`RELIEF.z`, the prototype's, settled by
eye in M6), tunable.

- **The bake** (`src/render/lit/bake.ts`, in the worker): `bakeRelief` replaced by `bakeLight`, after K1's
  `bakeLightRows` (`tools/campaign-bake.ts`): R the sun's soft shadow (a ray from each node toward a sun disc a few
  degrees across, so the penumbra widens with the distance to what casts it), G the sky each node sees (the horizon
  in eight directions, ambient occlusion). Distances scaled to the staff map's relief (metres to a few hundred, not
  K1's kilometres). The sun at any azimuth and elevation, not one of eight directions. Baked on a grid of every
  second node if the 2 m one is too slow (measured).
- **The shader** (`lit.frag`): the print (paper, woods, water, yards, contours, ink) multiplied by the light: the
  sun's colour on the slope (per pixel, from the node heights), in its baked shadow, with a lamp's fall-off across the
  map from the sun's side; the sky's colour in its baked share; a soft shoulder on the brightest faces. The exposure
  term goes (the sky's occlusion does its work).
- **The palette** of K1: a cold white paper, a warm orange sun from the north-east, 20° high, a cool sky; contours a
  muted grey with the index lines in orange; the water from a pale shallow blue to a deep blue by its depth, in steps
  (K1's stepped basins, flat here).
- **The houses** lit and shadowed by the same sun (its azimuth for the faces, its elevation for the shadow's length).
- URL settings to tune by eye, as K1's: `?sun=`, `?az=`, `?soft=`, `?sky=`, `?lamp=`, `?z=`, `?floor=`.

**M8h (after M10a): Austerlitz at 3 km**, a 4× model (decision 0089, #234). In the M8 plan.

Out of scope: a raised model (the owner: no exaggeration); K1's tiles (a 3 km map is one texture); clouds (the page
draws only on a change); the battle page's staff map (M6d / M9).

## Acceptance

- Austerlitz and the example maps draw with no console error (`tools/map-page-check.mjs`); screenshots of Austerlitz
  before and after at the whole map and closer (the Pratzen, the Goldbach ponds), in `scratch/m10/`.
- The bake's time measured in the worker at 6 km (and the grid chosen from it); the frame measured on the preview build.
- `bakeLight` tested: flat ground fully lit and open to the sky; a wall's shadow on the side away from the sun, its
  length from the elevation, its edge softer further from the wall; a pit's floor seeing less sky than its rim.
- The owner's verdict by eye, against K1's print.

## Decisions

- Decision 0090 (proposed): the staff map lit as a model under a sun and the sky, with the campaign map's palette
  (supersedes M6a's light and parchment; decision 0064's flat plane stands).

## Open questions

1. The readability bound (#141: the darkest about 0.6 of the paper): K1's shade is darker. `?floor=` sets it; checked
   when armies are on the map (M6d / M9).
2. The woods' tone on a cold paper.
3. One sun for every map, or a map's own (its season, its hour)?
