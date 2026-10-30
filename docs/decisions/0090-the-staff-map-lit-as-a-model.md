---
status: proposed
date: 2026-10-30
---

# 0090 The staff map is lit as a model under the 3D world's sun and the sky, in the campaign map's palette (amends 0064)

## Context

The lit map view (decision 0064, M6a) shades the relief with a slope light, a hard cast shadow walked along one of
the grid's eight directions, and an exposure term, multiplied into a parchment. Track K's campaign print (K1, PR #262)
lights the theatre as a model instead: a warm sun in a soft shadow toward a sun disc, a cool sky in its baked
occlusion, on a cold white paper. The owner (2026-10-30) wants the same light and colours on the battle's staff map,
without the campaign map's height exaggeration. Track G joins the staff map and the 3D world on one camera (G4), so
the two views must share a light: the owner chose one sun, the 3D world's (`docs/plans/active/track-g.md`).

## Decision

We will light the staff map as a model:
- **The bake** in the compile worker gives, on every fourth node (8 m, read through a bilinear filter): the sun's soft shadow (a ray toward a sun disc
  2.5° across, so the penumbra widens with the distance to what casts it) and the share of the sky each node sees (the
  horizon in eight directions, up to 256 m away). It replaces the slope light, the cast shadow and the exposure.
- **The sun is the 3D world's** (`src/look/sun.ts`: north-west, about 27° high), at any azimuth and elevation,
  not one of the grid's directions.
- **The shader** lights the print per pixel: the sun's colour on the slope from the node heights, in its shadow; the
  sky's colour in its share (a quarter of the light); the whole divided by flat ground's light, so flat paper keeps its
  colour; a floor and a soft shoulder on the brightest faces.
- **The plane stays flat** (0064). The light alone reads the heights raised three times, as shaded-relief prints do;
  nothing is raised.
- **The buildings are part of the landscape** (G2b, the owner): the paper's tone a little darker, lit by the same
  light (the sun on each face, in the hills' baked shadow and sky where they stand); their shadows on the ground are
  the sun's share they take, under the same sky, not a decal of their own: the footprint swept away from the sun as far
  as its wall casts, on the 2 m cells (the light's 8 m nodes are too coarse for a house).
- **The palette** is the campaign map's: a cold white paper, a warm sun, a cool sky, grey contours with orange index
  lines, the water stepped from a pale to a deep blue by its depth.

This amends 0064's "relief (slope light, cast shadow, exposure)" and "one of the grid's 8 directions"; its flat plane,
its worker bakes and its float heights stand.

## Consequences

- Good: the staff map, the campaign map and the 3D world share one light and one palette, so the zoom's handover
  (G4) changes no light, and the campaign's zoom into a battle can stay in one look.
- Good: a soft shadow and the sky's occlusion read the hollows, sunken roads and stream valleys that the hard shadow
  cut as black shapes.
- Good: the page's bakes on a 3 km map take 0.41 s in its worker, against M6a's 0.40 s (the light on every fourth
  node; on every second one they took 0.78 s, and a save no longer redrew within the editor's second), and an edit
  that leaves the heights as they were bakes nothing; the frame is unchanged within the measurement's noise
  (about 4 ms at 1080p; the dev Mac, the G2 plan's Results).
- Bad: the light is baked for one sun; a sun that moves with the day (the campaign map's open question) needs a rebake
  or several bakes blended.
- Bad: the shade is darker than the readability bound of #141 asks (the darkest about 0.6 of the paper); a floor
  sets it, checked once armies are on the map (G4).
- Bad: the parchment's warmth is gone; the woods are not drawn until the owner has redone them on the campaign map.

## Alternatives considered

- **Keep M6a's light, recoloured:** the hard shadow along eight directions cannot take the 3D world's sun, and reads
  every fold as a black cut.
- **A raised model**, as the campaign map is: the owner asked for no exaggeration, and decision 0064's flat plane keeps
  the editor's picking and the overlays simple.
- **The staff map's own sun:** the light would turn at the handover between the two views.
