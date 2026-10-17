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
  (the meadow map, `uGrowth`): only where grass stands; the short grass's brush where none grows. The dark side a
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
