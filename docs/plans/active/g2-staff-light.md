---
status: active
last_reviewed: 2026-10-30
---

# Plan: G2, the staff map lit as a model, after the campaign map

Track G (`docs/plans/active/track-g.md`), on `epic/gameplay-map`. The map page's lit view (`src/render/lit/`, M6,
decision 0064), lit the way Track K's campaign map is (K1's plan, § The rebuild, on `proto/k1-theatre-look`,
PR #262). Started as "M10a" on Track M; Track G took it over.

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
  `bakeLightRows` (in K1's bake tool, PR #262): R the sun's soft shadow (a ray from each node toward a sun disc 2.5°
  across, so the penumbra widens with the distance to what casts it), G the sky each node sees (the horizon in eight
  directions, from 4 m to 256 m away). The sun at any azimuth and elevation, not one of eight directions. Baked on
  every fourth node (`LIGHT_STEP`, 8 m), read through a bilinear filter: on every second one a save took 1.4 s to
  redraw on the page check's map (`tools/map-page-check.mjs`, its limit 1 s); the sky's horizon read on whole nodes.
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

- The look: the owner's eye on the shots in `scratch/g2/` (2026-10-30): ×3 chosen over ×2; the woods taken out.
- The page's bakes (the light, the masks, the ink) on Austerlitz (1501 × 1501 nodes) in its worker, on the preview
  build: 0.41 to 0.43 s with the light on every fourth node (three loads, a load of 4 to 5), against M6a's 0.39 to
  0.40 s; with the light on every second node 0.77 to 0.78 s (two rounds, a load of 4.4 from other sessions: the owner
  allowed up to 5). Close up (3 px a metre, `scratch/g2/step2-*` and `step4-*`) the two read alike; the ponds' banks
  are smoother on 8 m. On the dev server under a load of 15 to 40: 0.85 to 0.97 s;
  in Node 1.8 to 2.8 s. An edit that leaves the heights, the sun and z as they were bakes nothing (the cache compares a
  kept copy of the heights).
- The frame, on the same preview builds in a 1920 × 1080 window: 60 frames at each of three views (the whole map, the Pratzen,
  Satschan), each forced to finish by a one-pixel read; the median 3.1 to 5.0 ms for G2 against 3.3 to 4.2 ms for the
  epic (90th percentile 3.7 to 5.9 against 4.3 to 5.9). The two rounds disagree by more than the two builds do: no
  difference measurable at this load, both far under the 6.7 ms of 150 fps (measured with the light on every second
  node; on every fourth its texture is a quarter the size and the shader the same).

## Open questions

1. The readability bound (#141: the darkest about 0.6 of the paper): K1's shade is darker. `?floor=` sets it; checked
   when armies are on the map (G4).
2. The woods' tone on the cold paper, after the campaign map's (the owner).
3. The houses: their shadows come from their true wall heights while the ground's light reads its heights ×3, and a
   house in a hill's baked shadow is drawn in full light (its boxes do not read the light texture). To settle with the
   3D world's houses (G4).
4. The water's face is flat, but the bake reads its bed: a pond or a stream takes its banks' shadow and less sky, as
   K1's basins sunk into the model do (a 1.5 m pond is a 4.5 m basin to the light). In the shots the owner has seen;
   to keep or to light flat (the bake on the water's level) by the owner's eye.
5. The water is K1's blue in every season: M6a's pale winter wash is gone, and on a winter map (Austerlitz) the deep
   blue is near the armies' saturation. The owner has seen it in the G2 shots and asked no change; checked with the armies (G4).

## Review

Round 1 (`/code-review high`, 10 findings, 2 severe):
- fixed, severe: the ray toward the sun ended once the disc's middle cleared the highest ground, cutting the soft
  edge of that ground's shadow to a hard line (now its lower rim; tested); the ray's steps (×1.15) jumped narrow banks,
  leaving nodes lit in their shadow (now no longer than the penumbra's width; tested on an 8 m bank);
- fixed: a sun on the horizon or with no disc (`?sun=0`, `?soft=0`) turned the map black or NaN (`clampSun`; tested);
  the light baked again on every edit (`lightCache`; tested); the sun's vector copied from the 3D world's materials
  (one module, `src/look/sun.ts`); the houses' fallback sun; the slope halved within a cell of the map's edge
  (one-sided differences in the shader, checked by eye: no test harness runs the shader); the system doc's water and
  woods;
- kept: the water's winter wash gone (open question 4); the measurements (Results).

Round 2 (10 findings, 1 severe):
- fixed, severe: the docs check failed (paths only on K1's branch, the plan not in the index);
- fixed: the slope's four height reads skipped past the map's edge; the sun's term capped at three times flat
  ground's (a low `?sun=` saturated every face); `uCells` unused; the cache's test now counts the bakes (it passed a
  cache that baked every time); the hash's time measured; the tilt read through the same helper as the light's
  settings; decision 0090's sun module;
- kept: the light over the ink at a floor of 0 (the owner's look, K1's; open question 1, checked with the armies); the
  houses (open question 3); the ray's steps far out (a work shades a node d metres away only if its height ×3 rises
  d × tan(26°) above it: at 200 m about 30 m, which no work on a battlefield is).

Round 3 (9 findings, none severe; fixed or answered, then stopped, the third round):
- fixed: the cache's hash missed an edit that only flips heights' signs (a raise turned into a lower, tested): it
  compares a kept copy of the heights now; a disc under 1° stepped every cell out to a kilometre (the disc 1° at
  least); `?sky=`, `?lamp=`, `?floor=` kept within 0..1 (a sky past 1 turned the divisor negative); the bake's per-node
  arrays gone; the houses' shadows from the ground's clamped sun, not a 5° floor of their own; the bake's time comment
  (the worker's, not Node's); the view's header;
- answered: the water shaded from its bed (K1's basins; open question 4); the frame (Results, measured once the code
  is final).

After round 3, the final checks: the page check (`tools/map-page-check.mjs`) failed its one-second redraw after a save
(1.43 s, the epic 0.64 s). The light moved to every fourth node and the sky's horizon to whole-node reads (the same
directions and steps, no bilinear read); the bake tests pass unchanged.
