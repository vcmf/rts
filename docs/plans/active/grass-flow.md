---
status: active
last_reviewed: 2026-10-17
---

# Plan: combed grass, step 1: the flowing ground pattern (`?grass=flow`)

## Problem

The owner (2026-10-17) wants the meadow to have Tiny Glade's beauty (the owner's Tiny Glade screenshots, kept locally, not committed). The
research (`docs/research/painterly-grass.md`) found what makes that grass read as painted: combed flow (patches
sharing a lean), light and dark streaks from it, a strong root-to-tip gradient, deep soft gaps, soft value masses
at distance. Our meadow has none of the flow: the brush tile's blades lie every way (`tools/meadow-brush.py`), and
each 3D clump turns at random (`meadow.vert`). At our camera a blade is under a pixel wide at every zoom (the
research, §1), so the look must come from the pattern and the light first, not from more blades.

## Scope

Step 1 of the research's order, as an arm of the look page, `?grass=flow` (the default unchanged):
- **a flow field** (`flowAt` in `src/look/shaders/meadow.glsl`): a slow map-wide lean direction and strength, shared
  by the ground and the grass;
- **the ground pattern combed** (`meadowPattern` in `src/look/shaders/macro.glsl`): the brush tile read along the flow
  and stretched along it, light and dark streaks by the lean against the sun, deeper cool gaps, soft value masses;
  still in the macro bake, so nothing a frame;
- **the 3D clumps lean with it** (`meadow.vert`): their turn and lean from the field, the hash only jittering it.

Grown with the owner's rounds (below): the strokes at runtime by zoom and by growth, larger, denser clumps with a hue
each, the seasons keeping the pattern; then the cost review: the flow and the comb as textures, ring chunks culled on
the CPU.

Out of scope: shells, near blades, flowers and petals, parting around props and units (later steps).

## Approach

The flow is a low-frequency angle field (two octaves of the meadow's value noise, domain-warped so it swirls) and a
strength field (patches lying flatter). The tile is read in a frame turned to the flow and stretched about three times
along it, so its marks run with the comb. The streak is the lean's dot product with the sun's direction on the
ground, times the strength. The sun is fixed per map, so the bake holds it (decision 0001: the look in the
materials; AGENTS.md: static light baked once).

## The design as it stands (2026-10-17, after the owner's rounds)

The owner judged it zoom by zoom: the strokes baked at 5 m read as fur and cowlicks zoomed out, and as smeared paint
where no 3D grass grows (the formation zones); the dark side read as near black; close up the clumps were too small,
too sparse and one colour. So:
- **The bake holds the broad part only:** soft bands where the flow leans to or from the sun, soft masses, the clump
  field. Nothing a frame.
- **The strokes at runtime, by zoom** (`strokeK`: whole up close, gone by the default zoom's far half) and **by growth**
  (the meadow map, `uMeadow`, shared with the ground's under-layer): only where grass stands; the short grass's brush where none grows. The dark side a
  deeper green, never toward black. At 60% since the denser clumps carry the close look.
- **The clumps:** 1.4 times wider, 15% taller (never over `HEIGHT_MAX`), fewer thinned between the patches, a hue each
  (blue-green to yellow-lime, stronger toward the tips), leaning with the flow.

## Cost review (the owner: 90 fps at the close zoom against the 120 soft target, decision 0036)

The strokes evaluated the flow field five times a pixel (each five value noises) and the comb's noise twice a cell:
about 27 value noises and 8 texture reads on nearly every pixel at the close zoom (the research agent's count, and
ours). Measured (the dev Mac, Metal, the bench's frame interval, best of three interleaved rounds: the machine was
loaded by another session's Blender, load average 5 to 37; the best run is the least disturbed):

| Zoom | main | flow before | flow, the flow and the comb as textures |
|---|---|---|---|
| close | 5.7–9.6 ms | 13.9–15.0 ms (67–72 fps) | 5.5–6.4 ms (156–182 fps) |
| default | 7.3–7.9 | 13.6–15.6 | 7.6 |
| widest | 11.8–13.5 | 9.1–12.6 | 7.1–8.3 |

Changed:
- **The flow as a texture** (`src/look/flow.ts`, 2 m texels over the tile, made on load from the same field): the
  strokes, the bake and the clumps' lean read one fetch (`flowTex`), and all three agree; the field itself beyond the
  tile (the far bake).
- **The comb's noise as a tiling texture** (`uComb`), not value noise.
- **The grass's fragments** read the bake alone (`bakeOnce`), not the ground's zone and stroke logic.
- **The four cover taps a pixel** gone: the growth map already keeps to meadow and pasture and fades over their edges.
- **Ring chunks culled on the CPU** (`cullRing`, 8 × 8 chunks a ring): only the chunks in view and in the band are
  drawn (a culled slot still cost its every vertex). The same image (at most one pixel in a million moved: the
  instances' order).

After the chunks, on a quieter machine (load average 4 to 14), best of three: close 5.6–5.9 ms (169–179 fps; main
4.2–4.4), default 7.1–7.2 (main 5.7–5.8), widest 7.0–7.7 (main 6.0–6.9): over 120 fps at every zoom, about 1.4 ms
over main. The ablation (best of two): the strokes about 0.5–1.0 ms at the close and default zooms, the density and the
larger clumps 0.1–0.3 each, nothing at the widest (the strokes are off there; its extra is the ground's growth read
and the short grass's cover read). The chunks: 0 to 0.8 ms on the Mac (its tiler rejects culled clumps cheaply; more
expected on an immediate-mode GPU, not measured).

Open, if the min-spec laptop or the armies need more (the research's list): the per-clump ground colour in the vertex
shader; a cheaper mesh for the outer ring; grass drawn before the terrain (early-z on NVIDIA; Apple's hidden-surface
removal already skips hidden terrain); a camera-following near bake of the strokes.

`?grassoff=strokes,dense,big,hue` turns one part off at a time, for the ablation.

## Acceptance

- `?grass=flow` against the default from the same cameras (closest, close, default, widest; summer and autumn),
  judged by the owner.
- The default arm unchanged: the goldens against origin/main identical (`tools/golden.mjs`).
- The cost: nothing a frame for the pattern (in the bake); the clumps' extra instructions measured with
  `?bench=meadow`-style A/B, `tools/bench-look.mjs`, paired runs.
- The readability guard (`tools/guard.mjs`) with `?grass=flow` no worse than the default.

## Review rounds
- **Round 1** (`/code-review high`, 10 findings). Severe: the combed clumps reach about 2.5 m (1.4 times wider, the
  flow's lean) but kept 1.45 m from the formation zones and the banks (fixed: `CLUMP_REACH_FLOW`, 2.6 m, for the
  meadow map's rules and the chunks' cull). Fixed too: the grass read the bake at its finest level (the ring's footprint
  again); the scatter pass missed the meadow (each ring starts with its slots); the chunks were culled against the last
  frame's camera (now before the camera's render); the autumn value-keeping touched every ground class (green ground
  only); a reversed `smoothstep`; the clump's hue from an interpolated varying (now hashed in the vertex shader); the
  shader arm's strokes ungated (the strokes on the bake arm only); per-frame allocations in the cull; the brush pattern
  duplicated, `COMB_PERIOD` hard-coded, the comb's unused mips.
- **The checks** (the machine free, 2026-10-18): goldens against origin/main identical at all 8 cameras (the chunks
  included); `npm test` 260 passed. The guard with `?grass=flow` first failed twice against main: `open-low.Austria`
  in autumn (0.091, main 0.108: the formation zones' ground differed) and `meadow.Britain` in winter (0.097, main
  0.104). Fixed: where no grass grows the ground is the default's (the broad bands divided out, the autumn value
  kept only where grass grows), and under the winter's snow the clumps, their density and the strokes are the
  default's. Then the guard passes (summer, autumn, winter; the cover view), both blocks at main's values, and
  `meadow.Britain` in autumn at 0.151 (main 0.024).
- **Round 2** (`/code-review high`, 10 findings). Severe: a ring with every chunk culled kept a forced count of 0,
  which Babylon draws as one clump without instances, in another shader variant (fixed: such a ring is not drawn).
  Fixed too: crops kept the combed grass's wider reach (their own rule again: crop cells as the default's); the river
  check tested 1.4 m whatever the reach (it reads the page's `__look.meadow.reach`: under `?grass=flow` no grass within
  2.6 m of a zone or the water); the shader arm missed the zone fix (the combed meadow needs the bake arm; the shader arm
  keeps the default pattern); the autumn's value-keeping read a global defaulting to on (now off unless set where grass
  grows); the flow field's numbers in two places (one home, `FLOW` in `src/look/flow.ts`, given to the GLSL as defines);
  the meadow map bound twice; the system doc copied tuning values (it names the constants). Left: the zone ground is
  rebuilt per pixel, an approximation of the default's bake (exact on meadow, within a few levels on pasture and up
  close); the short grass's cover read where no grass grows (the widest zoom's extra cost, above).
- **The checks again** on the final code: goldens identical (8 cameras); the guard passes (summer, autumn, winter;
  the cover view); `tools/river-check.js` passes on both arms (under `?grass=flow`: no grass in the zones or on the
  water at 2.6 m, the crop cells as the default's); `npm test` 260 passed. (Babylon's shader preprocessor treats a
  semicolon in a comment as code, as it does an apostrophe: two rebuilds lost to it.)
- **Round 3** (`/code-review high`, 10 findings, none severe: fixed what was worth it, and stopped). Fixed: the instance
  buffer uploaded in part, which Babylon keeps to rebuild a lost context (the whole buffer now); the clumps' hue and
  lean stayed on under the winter's snow (now as the default's, as the docs say); `CLUMP_REACH_FLOW` worked out by hand
  from the shader's numbers (now computed from `GRASS_WIDE`, `GRASS_TALL`, `LEAN_MIN`, `LEAN_MAX`, `LEAN_JITTER` in
  `src/look/meadow-spec.ts`, which the shader reads as defines); the default page ran the growth rule twice on load
  (one pass when the reaches agree); the clumps took the full autumn value at the growing area's faded edge (now the
  growth at their root); a seam at the tile's edge (the growth and the flow blended over its last 10 m); the hue's
  hash on every arm (the combed meadow only); the value noise copied in `src/look/flow.ts`. Left: the global the autumn
  reads (`pFlowGrow`, set where grass grows; a parameter would touch every caller of `groundSeason`).
- **The checks on the final code:** goldens identical (8 cameras); the guard passes (summer, autumn, winter; the cover
  view); `tools/river-check.js` passes on both arms; `npm test` 260 passed.
- **The owner's fps** (2026-10-18, the close zoom, a 120 Hz screen): the default 120 (the cap), `?grass=flow` 109–110,
  without the strokes 111, without the larger denser clumps 111; and strides at the bottom of the frame without grass.
  Measured (the dev Mac, best of three): with every part off the arm costs as the default; the strokes alone were the
  last ~1 ms, at every zoom, even where few pixels drew them (their code in the ground's shader slowed all of it).
  Changed: the strokes from a near bake (one fetch in the ground; the bake again when the focus moves 6 m); over the
  inner ring only (the rings are centred on the focus: the bottom of the frame stood under the sparser outer rings,
  the owner's strides); the larger, denser clumps up close only (`CLOSE_ZOOM`); the default pattern where no grass grows
  baked (the meadow map before the bake), not rebuilt a pixel. Then: close 4.4–4.5 ms (the default 4.4), default
  5.9–6.1 (5.7–5.8), widest 6.6–7.1 (5.9–7.0). Merged main's roads (#113). The checks again: goldens identical, the
  guard (three seasons, the cover view), the river check on both arms, `npm test` 265 passed, the docs check: all pass.
  These changes came after the three review rounds.
