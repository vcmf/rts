---
status: active
last_reviewed: 2026-10-30
---

# Plan: K1b, forests printed green on the campaign map (prototype)

Track K (`docs/plans/active/track-k.md`), on `epic/campaign`, after K1 (`docs/plans/active/k1-theatre-look.md`). The
owner (2026-10-30), with a reference print of Reno (a USGS sheet rendered as a lit model, its forests a bright
green): "put some green like this to our map where it's forest; again it must be baked into the terrain before
applying the light".

## Scope

- `tools/worldcover.ts`: ESA WorldCover 2021 (10 m land cover, © ESA WorldCover project, CC BY 4.0), read from its
  cloud-optimised GeoTIFFs on AWS without the full files: the header, then only the tiles of one reduced level
  (about 70 m a pixel) by range requests, cached under scratch/worldcover/; its tree-cover class sampled onto a grid in
  the theatre's projection as coverage (0–255, several samples a cell). The header's parse is a pure function,
  tested.
- `tools/campaign-theatre.ts`: the theatre gains a forest layer at 250 m.
- `tools/campaign-tiles.ts`: the tiles gain a forest channel at 100 m (the light's bytes become sun, sky, forest).
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
  range requests, cached; `parseCog` is tested (`test/worldcover.test.ts`). The cover at 250 m (3 × 3 samples a node)
  for the theatre, at 100 m (2 × 2) for the tiles. Plausible: the Black Forest 0.74 covered, the Bohemian Forest
  0.68, the Danube plain at Straubing 0.05, the Munich gravel plain 0.00. The theatre's build rose to 17–20 s, the
  tiles' to 85–90 s (the cover's sampling), 76 s once the cover is sampled while the light bakes.
- First look, the cover printed as is: today's farm copses speckled the whole map (35 % of it). Generalised as the
  reference does: the cover smoothed over about 1 km, printed where it passes 0.6 (`?woodfrom=`), in a light
  yellow-green (`#97c158`, `?woods=` its strength, 0.8): the large forests (the Black Forest, the Bohemian and
  Bavarian Forests, the Alps' lower slopes, the Vienna Woods) read as green masses, lit and shaded with the relief.
- A frame on test machine A at 1600 × 900, close up with 144 tiles: 1.7 ms still, 2.2 ms with the ink.

## Review rounds

- **Round 1** (`/code-review high`): severe: a range answered with the whole file (200) or cut short was cached as a
  tile, poisoning every later build. Fixed: only a 206 of exactly the length asked is kept, a cached range of another
  length fetched again. With: a missing file (open sea, 404) and empty tiles skipped; the cover smoothed once, by the
  tools (`WOOD_BLUR_M`), recorded in the theatre and the tiles' meta and checked by the page; the files' tiles and the
  files fetched side by side; the cover sampled while the light bakes; the detail area read once a pixel; one base64
  decoder; the header parse guarded against reading past its bytes and against a directory chain that loops;
  `fileName`, `chooseLevel` and `pixelOf` pulled out and tested, one behaviour a test; the attribution in full, as
  ESA asks.

