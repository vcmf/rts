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
texture: `design/refs/texture/ground-texture.jpg` (dry, cracked earth, 5000 × 3750, local, not committed).

## Generic, not this map's

The map engine (Track M, `maps/kinds.json` on `epic/map-engine`) describes ground by kind and attributes: each ground
kind sets a `material` (loam, clay, sand, gravel, rock, peat, earth), `moisture`, `stones`, `wear`, and a vegetation
`growth` (none, low, stand, tree); the yard is earth with growth none, every grassy kind loam. So the look keys bare
ground on what grows, not on this map's zones: **bare where nothing grows** (the growth 0, by any cause: a rule such as
a formation zone or a bank, a field's margin, a kind with growth none such as the yard, today's `bare` class), and
**the soil by material**: its colour and texture from a soil table by material (`SOIL` in the look's data: loam and
earth now, the owner's texture; clay, sand and gravel when a map asks), so Track M's `material` (and `moisture`, to
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
   unrelated scales and offsets, about a 4 m repeat, mipmapped), fading out as the pixel's footprint spans it.
4. Seasons: the earth goes with the ground's season (the autumn turn, snow) as the bare class does.

Not in scope: the tracks', villages' and ploughed land's surface (they keep `data/ground-dirt-v1.png`); new cover
classes or map edits.

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
