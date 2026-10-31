---
status: active
last_reviewed: 2026-10-31
---

# Plan: the campaign map of Europe

Track K (`docs/plans/active/track-k.md`), the Europe phase brought forward from K6 by the owner (2026-10-31), on
`epic/campaign`, after K2d (`docs/plans/done/k2d-ink.md`). The campaign map today is the 1805 theatre, 800 × 500 km:
its bake holds each level whole in memory (the 100 m level is 8001 × 5001 nodes, 40 M), and its page loads the far
level whole into one texture. Europe, from Lisbon to Moscow and from Sicily to southern Scandinavia, is about
4,000 × 3,200 km (estimated from the map): 32 times the theatre. Its 100 m level would be about 40,001 × 32,001 nodes
(1.3 G), its 250 m level 16,001 × 12,801, past one texture. The roads of Europe stay K6's (traced from period maps);
the names beyond the 1805 theatre come with them.

## Estimates (scaled from the theatre's measured figures, 32 times its area)

| | Theatre (measured) | Europe (estimated) |
|---|---|---|
| Terrain tiles fetched (zoom 9 and 10) | 187 + 714 tiles, 118 MB | about 29,000 tiles, 3.8 GB |
| WorldCover read (the forests) | 8 sheets, 60 MB of range reads | about 250 sheets, about 2 GB |
| Bake on 8 cores (the i7-9700K) | 70 s | about an hour |
| Output (`scratch/campaign/`) | 109 MB of tiles, 8 MB of fields | about 3.5 GB, plus a 1 km level of about 40 MB |

All fetched once, cached under `scratch/` (git-ignored) as today; nothing committed.

## Phases

Each one PR or more into `epic/campaign`, reviewed by the workflow in `AGENTS.md`.

### EU1: the bake by tiles, for a map of any size

The bake as it is cannot hold Europe: every step reads a whole level. EU1 bakes each level tile by tile, each with the
margin its steps reach, so the memory stays that of a few tiles whatever the map's size:
- the heights of a tile and its margin sampled from the terrain tiles;
- the shape's large forms (a 3 km blur, the mountain regions over 6 km, the edge's flattening over 12 km) from a
  coarse level of the whole map (1 km: 4,001 × 3,201 nodes for Europe, 56 MB of floats), its detail from the tile;
- the lakes' distance (to 12 km) and the forests' smoothing (1.5 km) within a margin of 12 km;
- the sun's shadow (rays to 60 km) from the tile's own heights out to its margin and from the coarse level beyond it;
  the sky's occlusion (to 9 km) within the margin;
- the far fields (the lakes' mask, the lines, the contours) by tiles too.
- **Acceptance**: on the 1805 theatre, the tiles baked by tiles against the tiles baked whole: the shape within a
  few metres (where the large forms come from the coarse level), the light within a few levels, and the image at
  K2b's four views (a mean difference under 2 levels); the memory a level takes measured (a few hundred MB at most,
  whatever its size); the bake's time.

**Results** (EU1), on the owner's WSL machine (an i7-9700K, 8 cores):
- The levels baked in blocks of 4 × 4 tiles with a margin of 24 km (`levelBlocks` in `src/render/campaign/tiles.ts`;
  `tools/campaign-tiles.ts`): every step exact on a block's own nodes but the sun's rays past the margin, which read
  a coarse shape of the whole map (1 km, 801 × 501 nodes for the theatre, 0.4 s); the light's workers kept for the
  whole run. The shapes' blurs as a whole level's on the block's nodes (`buildShape` takes the block's place in the
  level for the frame's edge), the forests resampled from the block's corner, the light baked on the block's columns.
- Against the whole-level bake of the same theatre, tile by tile: the shape, the sky and the forests the same to the
  bit at both levels, the sun the same at 250 m and within 1 level at 100 m (the rays past the margin); the fields'
  and the labels' files the same, byte for byte. (A first run differed in the sky by up to 16 levels at a few nodes:
  a ray past the map's edge read the coarse shape, where the whole level holds its edge; fixed.)
- The bake 116 s (it was 70 s: a block of the 100 m level is baked on 2.2 times its own nodes, its margin's), its
  peak memory 1.4 GB (the whole-level bake: 2.4 GB). What still grows with the map: the forests' field, held whole
  (100 m: 1.3 GB for Europe, to be read by blocks in EU2), and the fields' level's heights and lakes' distance, held
  whole for its fields (the 1 km level for Europe: small).
- Tested: `test/campaign-blocks.test.ts` (the blocks hold every tile once; a block's shape the whole level's on its
  own nodes; a ridge past a block shadows it through the far shape).

**Review rounds** (EU1):
- **Round 1** (`/code-review high`): severe: a sun's ray past the map's edge was held at the block's own edge, which
  for a block inside the map is not the map's (a false shadow the whole level never had): a point past the map's
  edge is now held at it first, then read from the block or the far shape; a failed band no longer left the other
  workers running (the pool stopped however the bake ends). Weighed and measured: the reviewer's other severe point,
  that a block's shape is exact only to 10.5 km round its own nodes and a ray should read the far shape past that:
  done so, the sun was up to 255 levels off the whole level's at a few hundred nodes of the 100 m level (0.002%: the
  1 km shape misses or makes narrow peaks), against 1 level when the block is read out to its whole margin; so the
  block is read out to its span, the far shape past it (the seam the point feared measured at 1 level). With: the
  coarse cell the first of 1 km, 500 m, 250 m the frame divides; one named type for a shared shape; `Place` used in the
  tiles' module; a block's heights and lakes' distance returned only for the fields' level. Left: a block's forests
  and light sized to its margin, not its own nodes (2.2 times at 100 m); a block's shape copied once to share it.
- **Round 2**: no severe finding; fixed: the coarse shape always 1 km (the frame's extents whole kilometres, or the
  bake refuses: a fallback to 250 m would have held a whole continent at 250 m); the fields' level refused past 20 M
  nodes (they are made on it whole); a tile cut from a block it is not wholly in refused (its reads would have wrapped
  into the rows beside it); the light's pool its own module (`tools/campaign-light.ts`) and tested
  (`test/campaign-light.test.ts`: a block baked by the pool is the light baked in one thread; a worker gone fails the
  next bake); the blocks' test on both axes and the blocks' own nodes tiling the level once. Left for EU2, where they
  count at a continent's size: a block's preparation (its heights, shape, lakes, tiles' writing) does not overlap the
  light of the one before, so the light's workers wait meanwhile; the terrain tiles under a margin are read and
  decoded again for each block that reaches them (a cache of decoded tiles across blocks).

### EU2: Europe's sources and its bake

- The frame: a Lambert azimuthal equal-area projection centred on Europe (the EU's own, EPSG:3035, is centred at
  52° N 10° E), the half extents covering Lisbon to Moscow and Sicily to southern Scandinavia.
- The water from Natural Earth (already global), the heights and forests fetched over the frame (the estimates
  above), the 1805 theatre's labels as the labels (Europe's names come with K6).
- Three levels: 1 km (the whole continent, one texture), 250 m and 100 m.
- **Acceptance**: the bake's time, memory and size on disk measured; spot checks of its tiles against the theatre's
  where the two overlap.
- **Before it runs**: the owner's go for the downloads and the hour of baking (the estimates above).

### EU3: the page for a continent

- The far level (1 km) loaded whole, as today's 250 m one; the 250 m level streamed in a ring of tiles around the
  camera between the far and the close zoom, as the 100 m one is (K2c), the 100 m ring and the patch up close.
- The camera's limits from the frame (a continent's distance far out).
- **Acceptance**: pan and zoom across Europe at 150 fps on test machine A (the track's), the tiles streaming without
  a frame over 6.7 ms (K2c's measure), and the 1805 theatre drawn as today within it.

## Open questions

- Where the built page finds 3.5 GB of tiles (a CDN, a tile server): with the theatre as data (K3), as K2b left it.
- A smaller format for the tiles (decision 0094's open question), if the size on disk matters at a continent's scale.
