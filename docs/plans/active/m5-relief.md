---
status: active
last_reviewed: 2026-10-25
---

# Plan: M5, real relief in the language

Track M, on `epic/map-engine` (decision 0020). Phase M5 of `docs/proposals/map-engine.md` §10, step 1 of
`docs/plans/active/one-map-austerlitz.md`. One PR into the epic, or two if the importer grows (see Order).

## Problem

Every height in a map is invented today: `relief.base`'s noise and the landforms (`maps/kinds.json`). The one-map plan
draws Austerlitz on real ground, and decision 0061 makes maps designed at true local scale: the land keeps its real
shapes and slopes, while the empty distances between the places that matter are shortened. So a map must be able to
take pieces of a real heightfield, place them, and keep editing on top (the 1805 cleanup of modern embankments and
quarries, `relief.level`, `.lower`, `.cut`). The prototype has real heights (`tools/dem-fetch.mjs`, `?dem=`), but only
as a page-specific, git-ignored script, squeezed 2.5×, which decision 0061 drops.

## Approach

### The language: a source and a kind

- **A `dem` source** holds the provenance and the file, once per map:

  ```json
  { "id": "cuzk", "kind": "dem", "ref": "ČÚZK DMR 4G, 49.13 N 16.76 E", "file": "austerlitz.rdem",
    "hash": "sha256:…", "credit": "© ČÚZK, 2026 (DMR 4G)", "licence": "CC BY 4.0" }
  ```

  `sources` entries gain `file`, `hash`, `credit` and `licence`. A `dem` source requires all four; other kinds may set
  `credit` and `licence`. The file path is relative to the map file.
- **A `relief.dem` kind** places a piece of that file on the map. Its `source` names the `dem` source:

  ```json
  { "id": "pratzen", "kind": "relief.dem", "source": "cuzk", "area": [[…]], "shift": { "x": 1200, "z": -400 },
    "edge": 40 }
  ```

  - `area` (or shape `none`, for the whole extent) is where on the map the piece lies;
  - `shift` {x, z} is the offset from a map point to the file point it reads (both frames centred, x east, z north):
    no shift puts the file's centre on the map's. No scale (decision 0061: true local scale) and no rotation in M5
    (open question 1);
  - `edge` (m) blends the piece into whatever lies under it, as `relief.plateau` and `relief.level` blend;
  - heights are absolute (metres above sea level), taken back to the map's frame by its `datum`, which a map with a
    `relief.dem` must set. The validator checks the piece's heights against `datum` and the kinds' height range.
  - Several pieces may overlap; the usual (priority, id) order decides, a later piece setting the height over an
    earlier one inside its area, blended over its `edge`.
- **Where it applies:** `relief.dem` is a landform that **sets** the height in its area (the others add). Landforms
  after it in the order add on top, and the edits apply after all landforms, before nothing else changes:
  `apply.ts` builds the landforms, snapshots `H0` (the ground the water levels read), then the edits. A DEM goes in
  with the landforms, so streams read the real ground.

### The file: `.rdem`

A small binary heightfield, little-endian:
- a header: the magic `RDEM`, a version, `nx`, `nz`, the cell in millimetres, and the base height in centimetres;
- the heights as `u16` centimetres above the base, south row first, west to east (655 m of range per file, which
  covers every European battlefield the game plans; a wider range is a later version);
- the source's own cell, 5 m: the file keeps the measured data, not a resampling of it. A 6 km square is 1201² nodes,
  2.9 MB; the whole Austerlitz field (13.5 × 9.5 km, so that step 4 can choose its pieces) is 10.3 MB.

The file holds only the data; its provenance and credit live in the map's `sources`, and the `hash` there pins it.

### Resampling, in `apply`

`apply` reads the 5 m nodes and computes each 2 m node by **bicubic (Catmull-Rom) interpolation**, so the source grid
shows no facets (the one-map plan's requirement; bilinear shows a 5 m lattice in the hill shading). It needs only
`+ − × /`, so it stays inside `src/map/`'s restricted float64 (decisions 0006, 0013) and gives the same bytes
everywhere. The file is decoded with `DataView.getUint16`, which the lint allows.

`checkFiles(map, cat, files)` checks the files a map's sources name and returns them decoded; `apply(map, cat, dems)`
takes them as its third argument. Callers load the files:
- the CLI (`tools/map.ts`) and `tools/build-sim-data.ts` read them relative to the map file;
- the page: the map's files are listed by a build glob (`?url`) and fetched; the worker request carries them as
  `ArrayBuffer`s; the hot reload also watches `maps/*.rdem`.

A missing file or a hash that does not match is a validation error naming the source.

### The importer: `tools/dem-import.ts`

From `tools/dem-fetch.mjs`, kept for the prototype: a centre (lat, lon) and a size in km in, a `.rdem` and the source
entry (with its hash and credit) out.
- **True metres, north up.** Today's tool asks for Web Mercator, where a 5 m pixel is 3.3 m of ground at this
  latitude; the model's own grid (S-JTSK) has true metres but is turned off north. The importer asks for a transverse
  Mercator at scale 1 centred on the crop (the service takes a custom projection), so the file's frame is the map's.
- **Large crops in tiles:** the service's export size limit is checked, and a large crop is fetched in tiles and
  stitched.
- **Holes** are filled from their neighbours, as today, and more than 5 % missing fails.
- Re-importing needs the network, so `check:data` checks only that the committed file matches its `hash` and that the
  maps compile.

- **Two models:** DMR 4G (5 m, the default) and DMR 5G (2 m, `--model 5g`), both on the same service.

### Maps and checks

- `maps/austerlitz.map.json`: the real relief alone, the field as one `relief.dem` over the whole extent, centred on the
  crop's centre. **6 km**, the size decision 0061 gives Austerlitz. It validates and draws; the designed version (pieces
  moved closer) is step 4's work, once the editor exists.
- The sim's data at 6 km is about 200 MB in today's format 2, too large to commit: compiling Austerlitz for the sim waits
  on the sim track's compact grids (S-data). So a test compiles a smaller map, `maps/dem-test.map.json` (2 km, one
  piece of the same file with an edge blend and an edit on top), for the sim, and checks the heights it reads.
- Tests: the decoder (header, range, hash), bicubic against a known surface (a plane and a quadratic come back exact
  where they should, no 5 m lattice in the second differences), placement (`from`/`at`), overlapping pieces and their
  blend, `datum`, the validator's negatives (missing file, wrong hash, missing datum, heights out of range, a `dem`
  source without credit), and determinism (the same bytes twice).

### Documents

- Decision 0063: real relief as placed pieces of a pinned heightfield, read by bicubic.
- `docs/systems/map.md`, the proposal's §3 (sources, `relief.dem`) and §5, the one-map plan's step 1, and
  `docs/plans/active/prototype-plan.md` W6 (replaced, pointing here).

## Order

1. The `.rdem` format, its decoder, bicubic resampling and `relief.dem` in `apply`, with a small synthetic `.rdem` in
   the tests.
2. Sources with `file`, `hash`, `credit` and `licence`; the validator; the CLI and the page loading files.
3. The importer and the real files: `maps/austerlitz.rdem`, `maps/austerlitz.map.json`, `maps/dem-test.map.json`.

If 3 grows (the service's grid and limits), it becomes its own PR after 1–2.

## Acceptance

- `maps/austerlitz.map.json` validates and draws on the map page (`app/map.html`), with no 5 m facets in the hill
  shading (a screenshot at the closest zoom against the prototype's `?relief=shaded`).
- `maps/dem-test.map.json` compiles for the sim; its heights match the file's within interpolation's error.
- The same map gives the same bytes twice, in Node and in the page's worker.
- `npm test`, `npm run check:data`, `npm run build`, `node tools/check-docs.mjs` pass; every existing map and the
  valley's sim data unchanged.

## Results

- Built as planned, in one PR. `maps/austerlitz.rdem`: 2701 × 1901 nodes at 5 m, 183.7–325.2 m, no pixel without
  data, 10.3 MB; our SHA-256 equals `shasum -a 256`'s.
- `maps/austerlitz.map.json` (6 km, one piece, datum 180 m) validates and draws: `apply` 3.5 s, the draft 0.3 s,
  540 MB peak in Node. The hill shading at full resolution shows no 5 m lattice; today's railway and road embankments
  and a quarry show, for step 4's cleanup.
- `maps/dem-test.map.json` (2 km): a shifted piece, a second piece with an 80 m edge, a level edit and a stream;
  it compiles for the sim. Its second piece, cut from higher ground, stands as a mesa (open question 4).
- The map page: Austerlitz compiles in its worker in 2.9 s (apply 1.5 s), the test map in 0.7 s, with no issues; the
  test map's heights hash the same in the page's worker and in Node (FNV-1a `8682daa2`). `tools/map-page-check.mjs`
  passes.
- Checks: `npm test` passes but for the two cost tests, under a load average of 52 from other sessions (CI skips
  them); `check:data` (the two new maps' expansions included), the build and `check-docs` pass.

## Open questions

1. **Rotation of a piece.** Designed maps may want a piece turned (a ridge set at another angle). M5 places pieces
   without rotation; rotation is a small addition (`turn`, degrees) once step 4 shows a need.
2. **Decision 0061's square 2–6 km rule** is not enforced by the validator; today's example maps (2–2.4 km, not square
   in play) would fail it. Enforce it on new maps only, or leave it to the editor (M7)?
3. **The 6 km map in the page's worker:** about 72 MB of float64 heights and the layers, 540 MB peak in Node. If the
   page cannot hold it, the draft page draws Austerlitz at a coarser preview cell until S-data.
4. **Joining pieces:** a piece keeps its absolute heights, so one from higher ground stands as a mesa until an edit
   lowers it. A `lift` on the piece, or blending its difference to the ground under it, would join pieces without
   edits; decide when step 4 arranges Austerlitz.
