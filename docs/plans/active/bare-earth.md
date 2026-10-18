---
status: active
last_reviewed: 2026-10-18
---

# Plan: bare earth where no grass grows

## Problem

The owner (2026-10-18), with a close shot of a formation zone: the ground where no grass is drawn is (1) green, which
is false (the grass is the meadow's blades; ground without them is bare earth), and (2) low resolution. Where no grass
grows on a grassy class (meadow, pasture, a copse's floor), the meadow map's growth is 0: the formation zones (kept
clear for the units), the river banks' reach and the margins the rules shrink. There the terrain paints the grassy
class's green macro colour (the bake: 0.5 m a texel, magnified at the close zooms), with no blades over it. The owner's
texture: ground-texture.jpg in the owner's local refs, texture folder (dry, cracked earth, 5000 × 3750, not committed).

## Generic, not this map's

The map engine (Track M, `maps/kinds.json` on `epic/map-engine`) describes ground by kind and attributes: each ground
kind sets a `material` (loam, clay, sand, gravel, rock, peat, earth), `moisture`, `stones`, `wear`, and a vegetation
`growth` (none, low, stand, tree); the yard is earth with growth none, every grassy kind loam. So the look keys bare
ground on what grows, not on this map's zones: **bare where nothing grows** (the growth 0, by any cause: a rule such as
a formation zone or a bank, a field's margin, a kind with growth none such as the yard, today's `bare` class), and
**the soil by material**: its colour and texture from a soil table by material (`soilColour` in `macro.glsl`: loam
now, the owner's texture; clay, sand and gravel when a map asks), so Track M's `material` (and `moisture`, to
darken it) plug in when the map engine lands. Today's cover grid has no material: every class reads loam.

## Scope

1. **The earth texture** (`data/ground-earth-v1.png`): the owner's photo cropped square, made seamless, its value only
   (greyscale, 1024²: the pack's colours are never used, our palette paints it), its mean measured; made by a script
   (`tools/earth-texture.py`) from the local reference.
2. **Bare earth where no grass grows:** on the grassy classes, where the meadow map's growth is 0, the ground is the
   soil's colour (our palette, by material), its edge soft (the map's bilinear growth and a little grain), at every
   zoom: in the macro bake (the wide zooms) and in the terrain's live paint (the close ones). The bare class (`bare`)
   takes the same earth.
3. **Its detail up close:** the earth texture multiplies the earth's value at the terrain's fragment (two reads at
   unrelated scales and offsets, a 5 m repeat, mipmapped), fading out as the pixel's footprint spans it.
4. Seasons: the earth goes with the ground's season (the autumn turn) as the bare class does; under snow a grassy
   class's soil keeps its class's whole snow (as trodden, a zone's breadth showed the snow's pattern repeating).

Not in scope: new cover classes or map edits. (Amended after review round 1: the cracks' mask is the macro colour, so
all bare loam takes them up close, the ploughed land, the roads and tracks too, their dirt marks handing over to the
cracks by the same weight; the villages, under the soil's red, keep the dirt.)

## Approach

The meadow map (`buildMeadowMap`, `src/look/meadow.ts`) already holds the growth the terrain needs; the terrain reads
it near the camera today (`meadowUnder`, shore.glsl). The bake and the live paint read it where they pick the grassy
class's colour (`cellColour`/`groundAt`, macro.glsl), so both zooms agree. The detail is one more pair of texture reads
on the earth's pixels only, behind the same footprint fade as the dirt (`dirtOn`).

## Acceptance

- The owner's close view (a formation zone at the default focus): earth, not green, with the texture's cracks and
  grain readable at the closest zoom; the edge to the grass soft, not a line.
- Wide zooms: the formation zones read as earth, the meadows as green, no seam where the live paint meets the bake.
- The readability guard ok at the start and cover views (the units now stand on earth: a block that separates on the
  base may not fail).
- The cost: paired one-page A/B (`?bench=earth`: the earth's live detail off and on) at the default, close and wide
  zooms, at most +0.3 ms on the dev Mac.
- Goldens: the change shows where expected (the zones, the bare class) and nowhere else.

## Results

- **The owner on screen (2026-10-18):** "it looks nice": the formation zones and the margins (banks, headlands) as
  earth accepted.
- **The cost** (`?bench=earth`, paired in one page, the dev Mac, GPU frame p50): the first version +0.8–1.0 ms at
  every zoom (the growth and class read on every pixel, the surface fading out only at a 0.5 m footprint). After the
  growth read first, and the fade from 6 to 25 cm: wide +0.1, default +0.35, close +0.5 ms. Of the close cost, the
  growth and class about 0.27, the two earth reads about 0.2. The machine was shared with another agent's renders
  during the last runs (load up to 15): to measure again quiet.
- **The readability guard** against main: ok at the start view (largest drop in separation 0.033) and the cover view
  (0.055). The cover run took three attempts: the first timed out and the second's Chrome exited, with the machine
  shared; the cover camera alone renders on both builds.
- **Goldens** against main: differ where expected, the formation zones and the growth's margins (the river's banks,
  every grassy class's edge with another class) at the summer cameras; winter identical (the snow covers the soil).
  The margins end with the meadow map at the tile's edge (beyond it the growth counts as whole: meadowGrowth).
- `npm test`: 265 tests pass.
- **Review round 1** (10 findings), fixed: the cracks' mask is now the bake's own colour (the live mask's unwarped,
  one-tap edge disagreed with the bake's by up to 1.5 m: cracks on green, a 2 m staircase); the margins beyond the
  meadow map from the cover (they ended on the tile's square); the tile seamless one axis at a time (a cut at each
  edge's middle); the bare class's dirt past the cracks (mid zooms had no marks); bare soil held snow as the bare class (reverted: the goldens showed the snow's own pattern repeating in rows over a
  formation zone's breadth; the soil on a grassy class keeps its class's whole snow, scope 4 so amended); the turned read's gradients; the bench arm without binders; `bareOf` takes macro's warp.
- **The cost after round 1** (`?bench=earth`, paired, GPU frame p50; the machine shared, load 16 to 19): close +0.2,
  default +0.1, wide 0.0 to +0.1 ms; the frame within 0.2 ms. Inside the +0.3 ms acceptance. (Before, with the
  growth and class read on every pixel: up to +1.0 ms; a mask from the warped class on soil-coloured pixels: +0.6 to
  +1.0.)
- **Review round 2** (10 findings, none severe: fixed what was worth it, the rounds stop): one weight for the cracks
  and the dirt's hand-over (`earthWeight`, with `uEarthOn`: the dirt stays where the cracks are off, and no stacking
  with the wear's dirt); the meadow's orange flowers out of the mask (no saturated colour is earth); the far ring's
  margins as part soil in its 4 m texels and the tile's edge weight at the warped point; the bake's growth taps apart
  from the pixel's cached texel; the bench's arms after the texture's load; the plan's scope amended (all bare loam);
  the tile's masks built a row at a time (the same output, a second).
- **Final:** `npm test` 265 pass; goldens against main differ only in the bare zones and margins (summer), winter
  identical; the guard ok at the start (largest drop 0.034) and cover (0.055) views; the cost (paired, GPU frame p50,
  1 s holds) close +0.17 to +0.25, default +0.12 to +0.15 ms, wide within the noise.
- **The "Chrome exited" failures** during these runs were another session on the machine running
  `pkill -f headless`, which kills every headless Chrome (Chrome's own log stopped with no crash). Retried until they
  ran through.
