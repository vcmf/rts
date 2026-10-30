---
status: active
last_reviewed: 2026-10-30
---

# Plan: G2, the staff map lit as a model, after the campaign map

Track G (`docs/plans/active/track-g.md`), on `epic/gameplay-map`. The map page's lit view (`src/render/lit/`, M6,
decision 0064), lit the way Track K's campaign map is (`docs/plans/active/k1-theatre-look.md` on
`proto/k1-theatre-look`, PR #262, § The rebuild). Started as "M10a" on Track M; Track G took it over.

## Problem

The owner, on K1's campaign print (2026-10-30): "the techno is super interesting, we've a super beautiful map, I want
to apply the same lighting and map effect" on the battle's staff map, "we don't need exaggeration of height like in
our campaign map, the rest yes". The staff map's light (M6a) was a slope light, a hard cast shadow and an exposure
term, from one of the grid's eight directions, multiplied into a parchment; K1 lights a model with a warm sun and a
cool sky, both shadowed (a soft shadow toward a sun disc, the sky's occlusion), under the colours of the owner's
Valdez print.

## Scope

The plane stays flat (decision 0064): no raised mesh, no lift of the heights. "No exaggeration" is taken as no raised
model: the light alone reads the heights raised `RELIEF.z` times, as shaded-relief prints do (×3, the owner's choice
by eye between ×2 and ×3, 2026-10-30), tunable with `?z=`.

- **The bake** (`src/render/lit/bake.ts`, in the worker): `bakeRelief` replaced by `bakeLight`, after K1's
  `bakeLightRows` (`tools/campaign-bake.ts`): R the sun's soft shadow (a ray from each node toward a sun disc 2.5°
  across, so the penumbra widens with the distance to what casts it), G the sky each node sees (the horizon in eight
  directions, from 4 m to 256 m away). The sun at any azimuth and elevation, not one of eight directions. Baked on
  every second node (`LIGHT_STEP`), read through a bilinear filter.
- **One sun** (the owner, track-g.md): the 3D world's, from the north-west about 27° high (`SUN`), so the light does
  not change at the handover (G4).
- **The shader** (`lit.frag`): the print (paper, water, yards, contours, ink) multiplied by the light: the sun's colour
  on the slope (per pixel, from the node heights), in its baked shadow, with a lamp's fall-off across the map from the
  sun's side; the sky's colour in its baked share; the whole divided by flat ground's light, so flat paper keeps its
  colour; a floor (`?floor=`) and a soft shoulder on the brightest faces. The exposure term goes (the sky's occlusion
  does its work). Past the map's edge the light is flat ground's.
- **The palette** after K1: a cold white paper (`#eceef1`), a warm sun, a cool sky (a quarter of the light, `?sky=`);
  contours a muted grey with the index lines in orange; the water from a pale shallow blue to a deep blue by its
  depth, in six steps.
- **The woods are not drawn** for now (the owner, 2026-10-30): they come back after the owner has redone them on the
  campaign map. Their cells and ink field stay; only the print leaves them out.
- **The houses** lit and shadowed by the same sun (its azimuth for the faces, its elevation for the shadow's length).
- URL settings to tune by eye, as K1's: `?sun=`, `?az=`, `?soft=`, `?z=` (baked in the worker), `?sky=`, `?lamp=`,
  `?floor=` (uniforms).

Out of scope: a raised model; K1's tiles (a 3 km map is one texture); the woods; the 3D world's light (G3); the
handover (G4).

## Acceptance

- Austerlitz and the example maps draw with no console error (`tools/map-page-check.mjs`); screenshots of Austerlitz
  before and after at the whole map and closer (the Pratzen, the Goldbach ponds), in `scratch/g2/`.
- The bake's time measured in the worker at 3 km; the frame measured on the preview build.
- `bakeLight` tested: flat ground fully lit and open to the sky; a block's shadow away from the sun at every azimuth,
  its length from the elevation, its edge softer with a larger disc; a pit's floor seeing less sky than its rim; every
  second node the same as every node there; the default sun the 3D world's.
- The owner's verdict by eye, against K1's print.

## Decisions

- Decision 0090 (proposed): the staff map lit as a model under the 3D world's sun and the sky, with the campaign
  map's palette (supersedes M6a's light and parchment; decision 0064's flat plane stands).

## Results

To be filled with the PR's measurements.

## Open questions

1. The readability bound (#141: the darkest about 0.6 of the paper): K1's shade is darker. `?floor=` sets it; checked
   when armies are on the map (G4).
2. The woods' tone on the cold paper, after the campaign map's (the owner).
