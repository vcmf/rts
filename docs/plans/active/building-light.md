---
status: active
last_reviewed: 2026-10-20
---

# Plan: the buildings' static light, baked once

Measured (Metal, interleaved, three rounds, against main; the coordinator, 2026-10-20): the village at the default zoom
0.8 ms under main (the buildings cover ground), at the closest zoom 1.2 ms over it (the houses fill the screen and are
shaded per pixel). `building.frag` reads about 13-14 textures a pixel: `shadowAt` (two grain jitters, four shadow-map
taps), `LM` (one), `bounceAt` (the cover, the light map, the season's colour), the detail (one), the paint grain (two),
the cloud (three), the mist (one, three more where misty). And the bounce it computes is never used: `paint()` adds
`pBounce` only under `#define BOUNCE`, which the material lacks. The owner chose to bake each building's static light
once (static light is baked once per map: AGENTS.md).

## Approach

- **A second UV set** (`tools/building-to-js.py`): Blender's smart UV project on the cut mesh into a new layer, its
  islands apart by a margin, exported as `uv2` (the page's `aUV2`).
- **The light atlas** (`src/look/building-light.ts`): one 256² tile per building instance (seven: six houses and the
  windmill) in a 1024 × 512 RGBA8 atlas, 2 MB. A tile spreads about 350 m² of a house's surface (its walls and roof) at
  about 60 % packing: about 9.5 cm a texel, finer than the sun's shadow map on the ground (about 20 cm a texel: the
  baked shadow's edge is the map's, not the atlas's), and 512² would quadruple the memory for no sharper edge.
  Baked by a render target over the building meshes in their `uv2` space (each instance's tile by a per-instance
  `aTile`), each texel its world position and normal, evaluating the runtime's static terms exactly: R the sun's
  visibility `shadowAtRaw(vW + N·0.15, N)` (without the panel's switch, which the runtime multiplies back), G the light
  map's sky occlusion, B its mist mask, A its sun (the mist's air: `airOf`); A stored at 1/255 and up, so an unwritten
  texel (0) can be told apart: a dilation pass then fills four texels round every island from its nearest written
  texel (no seam where the bilinear read straddles an island's edge). Baked after the light map and again whenever it
  is (the light map rebakes after the sun's shadow map: a season's release, the leaves' drop, a new grain).
- **The bounce, fixed**: the material gains `#define BOUNCE`, so the ground's bounce the header promised lights the
  walls from below (a look change: shown to the owner, `?bldbounce=0` to compare). Its colour is a function of the
  building's root (`bounceAt(vRoot, …)`: the ground's class, its season and snow, the light map's sun there), so it is
  baked once per instance into a 8 × 1 target (rebaked with the ground's bounce map: the season, the shadows, the
  grain); only its fade with height stays per pixel.
- **The runtime** (`building.frag`, `BLD_BAKED`, on by default): one read of the atlas (and one texel of the bounce) in
  place of `shadowAt`, `LM` and `bounceAt`; the cloud (it moves), the rim, the grain, the air and the mist's shafts
  (view-dependent) stay. `?bldlm=0` restores the runtime path (the A/B).

## Acceptance

- The A/B: screenshots `?bldlm=0` against the default at the village close, the windmill close, autumn and winter
  match closely (the bake's texels against the per-pixel taps); the bounce shown on and off.
- The building material within 16 texture units on Metal (the page's guard, `Materials.make`), one short Metal load
  without a compile error.
- The bake's time on load stated (SwiftShader; Metal by the coordinator); the bench by the coordinator against the
  close-zoom target (the +1.2 ms gone).
- `npm test`, the checks as main.

## Status (2026-10-20)

- Built: the light UVs (the import's second layer), the atlas (seven instances in 1024 × 512, 256² a tile: about
  4 MB with its dilated copy), the bake (after the light map; again with it), the bounce per instance (8 × 1, half
  floats; again with the ground's bounce map), `BLD_BAKED` and `BOUNCE` on the building material, `?bldlm=0` and
  `?bldbounce=0`.
- The bake's time on load: 61.5-71 ms on Metal, 3.2 s in SwiftShader (the dilation's 81 reads a texel, in software).
- Texture units: the building material 5 (the house's program is the windmill's, Babylon's cache), the bake 3, the
  bounce 3; the terrain still 16, the water 16: one Metal load without a compile error.
- The A/B (SwiftShader, `?bldlm=0` against the bake, both with the bounce): 0.65-1.49 % of the pixels differ,
  0.15-0.22 % by more than 12 levels (the shadow's edges at the bake's texels); the bounce on against off: 1.6-8.1 %
  differ, most in winter (the snow's bounce lifts the walls' feet), by 4 levels on average. To the owner:
  the main checkout's output/buildings-review/7-light-bake.png.
- Measured (the coordinator, Metal): close 7.63/8.03 ms baked against 8.18/8.42 runtime (0.4 ms saved); but at the
  default zoom 1.1 ms slower than the runtime: the atlas had no mips (minified, its reads missed the cache). Now
  mipmapped (trilinear, its chain made after the dilation) and read no coarser than level 3 (`MAX_LOD`): a tile's side
  divides into level-3 blocks, its islands 8 texels (`INSET`, one level-3 block) from its edge, the dilation two passes
  of four texels: no read at levels 0-3 reaches a neighbour's tile, no unwritten texel darkens an edge. The A/B against
  the runtime: 0.81 / 0.53 / 0.27 % of the pixels differ at the close, default and widest zoom (0.16 / 0.08 / 0.04 % by
  more than 12 levels: the shadow's edges), no tile bleeding at the walls' and roofs' edges. The bake about 0.5 s on
  Metal on load (a loaded machine). Texture units on Metal: the building 5, the terrain 15, the water 16.
- To do: the bench again (the coordinator), the owner's look at the bounce.

