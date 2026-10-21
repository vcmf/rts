---
status: done
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
  windmill) in a square-ish atlas (⌈√n⌉ tiles a row: 768 × 768 RGBA8, within the GPU's largest texture or a clear
  error): the raw bake 2.4 MB, the atlas read with its mips 3.1 MB, the dilation's occupancy 37 kB, about 5.5 MB as
  built. The islands cover a fifth to a ninth of a tile (550 on a house, 760 on the windmill, the margins between them
  kept at least 5 texels: `LIGHT_MARGIN` 0.018, from 0.012): about 20 cm a texel on a house, 27 on the windmill
  (measured; 17 and 21 at the old margin), the sun's shadow map's on the ground about 20 cm; 512² would quadruple the
  memory.
  Baked by a render target over the building meshes in their `uv2` space (each instance's tile by a per-instance
  `aTile`), each texel its world position and normal, evaluating the runtime's static terms exactly: R the sun's
  cast shadow `shadowAtRaw(vW + N·0.15, N)`, 0 lit to 1 shadowed (without the panel's switch, which the runtime
  multiplies back), G the light
  map's sky occlusion, B its mist mask, A its sun (the mist's air: `airOf`); A stored at 1/255 and up, so an unwritten
  texel (0) can be told apart. Each face's corners and edges are drawn first as points and lines (a face thinner than a
  texel holds no texel's centre: 45 % of them, the timber, the frames, the sails' sides). A dilation pass then fills four texels round every island from its nearest written
  texel (no seam where the bilinear read straddles an island's edge) and every texel past them a neutral light (sunlit,
  open sky, no mist, R 0: nothing unwritten darkens an edge in a mip; the atlas cleared to it until the first bake). Mipmapped (the engine's chain, as the pass unbinds
  the atlas) and read no coarser than level 1: a level-1 read reaches 2 texels past its own, inside its half of the gap
  to the next island (at least 5 texels between any two islands' touched texels: the export fails under it, a test
  checks the data); a tile's islands 2 texels (`INSET`) from its edge. Baked after the light map and again whenever it
  is (the light map rebakes after the sun's shadow map: a season's release, the leaves' drop, a new grain), once the
  buildings are drawn (hidden, `__look.terrainOnly`, the bake waits for them). WebGL2 only (`textureLod`,
  `texelFetch`): WebGL1 takes the runtime path.
- **The bounce, fixed**: the material gains `#define BOUNCE`, so the ground's bounce the header promised lights the
  walls from below (a look change: shown to the owner, `?bldbounce=0` to compare). Its colour is a function of the
  building's root (`bounceAt(vRoot, …)`: the ground's class, its season and snow, the light map's sun there), so it is
  baked once per instance into an n × 1 target (7 × 1, half floats) (rebaked with the ground's bounce map: the season, the shadows, the
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

- Built: the light UVs (the import's second layer), the atlas (seven instances in 768 × 768, 256² a tile: about
  5.5 MB as built, round 3), the bake (after the light map; again with it), the bounce per instance (n × 1, half
  floats; again with the ground's bounce map), `BLD_BAKED` and `BOUNCE` on the building material, `?bldlm=0` and
  `?bldbounce=0`.
- The bake's time on load: 61.5-71 ms on Metal, 3.2 s in SwiftShader (the dilation's 81 reads a texel, in software).
- Texture units: the building material 5 (the house's program is the windmill's, Babylon's cache), the bake 3, the
  bounce 3; the terrain still 16, the water 16: one Metal load without a compile error.
- The A/B (SwiftShader, `?bldlm=0` against the bake, both with the bounce): 0.65-1.49 % of the pixels differ,
  0.15-0.22 % by more than 12 levels (the shadow's edges at the bake's texels); the bounce on against off: 1.6-8.1 %
  differ, most in winter (the snow's bounce lifts the walls' feet), by 4 levels on average. To the owner:
  the main checkout's output/buildings-review/7-light-bake.png.
- Measured (the coordinator, Metal): close 7.63/8.03 ms baked against 8.18/8.42 runtime (0.4 ms saved, against a
  runtime that then computed the bounce: the runtime path is main's again, without it, so the saving against main is
  to be benched again); but at the
  default zoom 1.1 ms slower than the runtime: the atlas had no mips (minified, its reads missed the cache). Now
  mipmapped (trilinear, its chain made after the dilation) and read no coarser than level 3 (`MAX_LOD`): a tile's side
  divides into level-3 blocks, its islands 8 texels (`INSET`, one level-3 block) from its edge, the dilation two passes
  of four texels: no read at levels 0-3 reaches a neighbour's tile, no unwritten texel darkens an edge. The A/B against
  the runtime: 0.81 / 0.53 / 0.27 % of the pixels differ at the close, default and widest zoom (0.16 / 0.08 / 0.04 % by
  more than 12 levels: the shadow's edges), no tile bleeding at the walls' and roofs' edges. The bake about 0.5 s on
  Metal on load (a loaded machine). Texture units on Metal: the building 5, the terrain 15, the water 16.
- Review round 1: WebGL1 takes the runtime path (the bake's reads are GLSL ES 3's; `building.frag` now enables the
  derivatives WebGL1 needs: it failed to compile there before, main's too); the light UVs' islands measured at least 5
  texels apart, so the reads are clamped at level 1, not 3 (at the widest zoom, 720p, 93-98 % of the buildings' pixels
  want a level under 2, 65-89 % level 0; level 2 would need islands 12 apart), `INSET` 2; one dilation pass of four
  texels (the level-1 reach is 2) and a neutral light past it (no texel left unwritten: read back, none); the mips the
  engine's (the explicit call dropped; levels 1 and 3 read back, their means the atlas's); the bake waits while the
  buildings are hidden (a terrain-only rebake left the atlas blank before: read back, now kept); its time read back on
  the bench only; `?bldbounce=0` builds no bounce; one `atlasLayout` for the targets, the tiles and the defines (a
  test). The memory then 4.7 MB (no scratch; 5.5 MB in the square atlas of round 3). The A/B against the runtime (SwiftShader, 720p): 0.74 / 0.42 / 0.17 / 0.20 %
  of the pixels differ at the close, default, widest and widest-low zoom, 0.16 / 0.08 / 0.04 / 0.04 % by more than 12
  levels (the cast shadows' edges on the roofs), no dark edge or leak at the widest.
  The bake 85 ms on Metal on load (one load). To the owner: the main checkout's
  output/buildings-review/9-light-bake-review1.png.
- Review round 2: R is the cast shadow (1 shadowed), so the neutral light is R 0 (the fill had it 1: shadowed); each
  face's corners and edges drawn as points and lines under its faces (55 % of the faces held a texel's centre, now
  every face has a written texel, read back); the islands' gap measured on the touched texels at export (4 at the old
  margin: `LIGHT_MARGIN` 0.018 makes 5; the texels about 20 / 27 cm, from 17 / 21) and by a test on the data; the bakes
  run by hand once their source held for a frame and what they draw is on and ready (one bake on load, counted; the
  not-ready retry through the same gate), again on a new grain; the atlas neutral until the first bake; the runtime
  path without `BOUNCE` (main's); the clamp kept in the shader (Babylon sets `TEXTURE_MAX_LEVEL` on cube maps only); the
  bounce's texel an instance attribute (`aTile`'s third). The A/B against the runtime (SwiftShader, 720p, both
  without the bounce): 0.51 / 0.43 / 0.57 / 0.36 / 0.14 / 0.15 % of the pixels differ at the village close, the windmill
  close, a house's frames, the default and the widest two, 0.13 / 0.17 / 0.13 / 0.07 / 0.03 / 0.03 % by more than 12
  levels (the cast shadows' edges, coarser at the bake's texels: the windmill's gallery and sails' shadows on its
  tower); with the bounce on the baked side 4.6 % differ at the close (the bounce's lift), the same 0.14 % by more than
  12. The bake 28 ms on Metal on load (one load); texture units: the building 5, the bake 3, the bounce 3, the water 16.
  To the owner: the main checkout's output/buildings-review/10-light-bake-review2.png.
- Review round 3 (the last): the bakes run by hand (out of the scene's targets: Babylon's restore no longer redraws
  them by itself), counted only when the dilation drew and no mesh was left out (Babylon's readiness per mesh, through
  the target's `customIsReadyFunction`: a bake missing one is due again); on a context's restore the atlas neutral and
  both bakes due (tested with `WEBGL_lose_context`: neutral just after, baked again once compiled; the page's light map
  itself comes back different, 16 % of its texels, outside this work); the atlas square-ish and checked against
  `MAX_TEXTURE_SIZE` (and the bounce's n); the LOD's log2 floored; the islands' gap counts a corner on a texel's edge in
  both texels (still 5: the data unchanged); the grain through `mats.onGrain`; the dilation rings out and stops, and
  skips an empty 8² block (an occupancy pass): a rebake 0.64-0.93 s in SwiftShader against 1.71-2.41 s (the first
  bake 0.25-0.27 s against 0.21-0.29 s); the whole mip chain kept (Babylon sets no `TEXTURE_MAX_LEVEL` on a 2D
  target); the bounce's layer 0x40000000 (the light map's trunks have 0x10000000). The A/B as round 2's (the same
  counts to 0.003 %); one bake on load; every face a written texel; the bake 108 ms on Metal on load (one load, a
  machine at load 10; 28 ms the round before), texture units as before.
- To do: the bench again (the coordinator), the owner's look at the bounce.

