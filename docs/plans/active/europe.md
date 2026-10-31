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
