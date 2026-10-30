---
status: done
last_reviewed: 2026-10-30
---

# Plan: K1b, forests printed green on the campaign map (prototype)

Track K (`docs/plans/active/track-k.md`), on `epic/campaign`, after K1 (`docs/plans/done/k1-theatre-look.md`). The
owner (2026-10-30), with a reference print of Reno (a USGS sheet rendered as a lit model, its forests a bright
green): "put some green like this to our map where it's forest; again it must be baked into the terrain before
applying the light".

## Scope

- `tools/worldcover.ts`: ESA WorldCover 2021 (10 m land cover, © ESA WorldCover project, CC BY 4.0), read from its
  cloud-optimised GeoTIFFs on AWS without the full files: the header, then only the tiles of one reduced level
  (about 70 m a pixel) by range requests, cached under scratch/worldcover/; its tree-cover class sampled onto a grid in
  the theatre's projection as coverage (0–255, several samples a cell). The header's parse is a pure function,
  tested.
- One forest field a frame, made once: the cover at 100 m, smoothed, cached (`forestField`). `tools/campaign-theatre.ts`
  makes it and resamples it to its 250 m layer; `tools/campaign-tiles.ts` reads it as its forest channel at 100 m (the
  light's bytes become sun, sky, forest).
- `prototypes/campaign-map.html`: the forest printed on the paper in green, before the light (so the sun, the
  shadows and the sky's occlusion fall on it as on the rest of the print); the detail area's forest up close.

The forests are today's, not 1805's (Europe had more and other woods): a look test; the period's woods come with the
theatre's data (K3).

## Acceptance

- The tools write the layer; the coverage plausible (the Black Forest, the Bohemian Forest, the Alps' slopes green;
  the Danube plain mostly open).
- The page renders with no console error; screenshots far and close; the frame measured on test machine A.
- The owner's look.

## Results

- `tools/worldcover.ts` reads 8 WorldCover files of 3° at their 4500-pixel level (about 70 m a pixel), 25 tiles each by
  range requests (two files at a time, each file's tiles eight at a time), cached; `parseCog`, the ranges, the
  smoothing and the resampling are tested (`test/worldcover.test.ts`). Plausible: the Black Forest 0.74 covered, the
  Bohemian Forest 0.68, the Danube plain at Straubing 0.05, the Munich gravel plain 0.00.
- First look, the cover printed as is: today's farm copses speckled the whole map (35 % of it). Generalised as the
  reference does: the cover smoothed over about 1 km (three box means of 500 m either side) and printed where it
  passes 0.6 (`?woodfrom=`), in a light yellow-green (`#97c158`, `?woods=` its strength, 0.8): the large forests (the
  Black Forest, the Bohemian and Bavarian Forests, the Alps' lower slopes, the Vienna Woods) read as green masses, lit
  and shaded with the relief.
- The builds: the theatre 33 s (it makes the forest field), the tiles 55 s (the field read from its cache in 20 ms).
- A frame on test machine A at 1600 × 900, close up with 144 tiles: 1.7 ms still, 2.2 ms with the ink (measured
  before round 3, which changed only the tools).

## Review rounds

- **Round 1** (`/code-review high`): severe: a range answered with the whole file (200) or cut short was cached as a
  tile, poisoning every later build. Fixed: only a 206 of exactly the length asked is kept, a cached range of another
  length fetched again. With: a missing file (open sea, 404) and empty tiles skipped; the cover smoothed once, by the
  tools (`WOOD_BLUR_M`), recorded in the theatre and the tiles' meta and checked by the page; the files' tiles and the
  files fetched side by side; the cover sampled while the light bakes; the detail area read once a pixel; one base64
  decoder; the header parse guarded against reading past its bytes and against a directory chain that loops;
  `fileName`, `chooseLevel` and `pixelOf` pulled out and tested, one behaviour a test; the attribution in full, as
  ESA asks.
- **Round 2**: severe: the theatre and the tiles smoothed by different widths (each grid rounded the radius), so forest
  edges jumped where the tiles fade in; the format was not checked (a predictor or another band would decode silently
  wrong). Fixed: `smoothCover`, three box means of 500 m either side, which both cells divide, recorded as
  `forestBoxM` and checked by the page; the bits, bands and predictor checked, a missing tag named. With: downloads 8
  at a time and retried; the forest texture without mips (averaged it fell under the print threshold far out); the
  files to read cover the samples' half-cell reach; the page's warning names the stale theatre; a file shorter than
  the header's range accepted by its Content-Range; the sampling loop indexed numerically (the tile build at 70 s);
  round 1's caching fix tested (`range` takes its fetch). Left: the TIFF tag reading also in `tools/dem-tiff.ts` (one
  shared reader when the importers meet, Track M).
- **Round 3** (the last): severe: round 2's fix did not make the grids smooth alike (a box of r cells spans 2r + 1
  nodes: 1250 m at 250 m, 1100 m at 100 m). Two rounds failing on the same point: redesigned, not patched. One forest
  field a frame (`forestField`): the cover at 100 m, smoothed once, cached; the tiles use it, the theatre resamples it
  bilinearly (`resampleField`), so the two layers agree by construction (tested where their nodes meet). With: a
  failed range retried after 0.5 s then 1 s, and not at all when a retry cannot change the answer (a whole file,
  another client error); the files two at a time; the sheets' index bounds-checked and built without string keys;
  non-square levels and tiles refused (TileLength read); the light's workers stopped when one fails, and no longer
  sharing the cores with the forest sampling (the field is made before the light); tests of the smoothing and the
  resampling. Per the workflow, no fourth round.
