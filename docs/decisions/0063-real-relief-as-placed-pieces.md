---
status: accepted
date: 2026-10-25
---

# 0063 Real relief is placed pieces of a pinned heightfield, read by bicubic

## Context

Decision 0057 makes the map language the one description of the battlefield, and decision 0061 makes maps designed at
true local scale: the land keeps its real shapes and slopes, while the distances between the places that matter are
shortened. Austerlitz (`docs/plans/active/one-map-austerlitz.md`) is drawn on the real ground. Until now every height in
a map was invented (`relief.base` and the landforms), and the prototype's real heights were a page-specific,
git-ignored script squeezed 2.5×. The owner decided on 2026-10-24 that the derived heightfield is committed with
ČÚZK's credit. Plan: `docs/plans/active/m5-relief.md`.

## Decision

We will describe real relief in the language as pieces of a committed heightfield:
- **A `dem` source** names an `.rdem` file beside the map, pinned by its SHA-256, with its credit and licence.
- **A `relief.dem` feature** places a piece of it: the whole extent or an area, moved within the file by `shift`, at
  scale 1, never rotated or squeezed. It sets the height in its area, blends into the ground under it over its `edge`,
  and takes the file's heights above sea level back to the map by the map's `datum`. Landforms after it add; the edits
  apply after them all, which is how the 1805 cleanup is written.
- **The file keeps the source's own cell** (5 m for DMR 4G) as u16 centimetres above a base, and `apply` reads the
  map's 2 m nodes by bicubic (Catmull-Rom) interpolation, in exact arithmetic.
- **The importer asks for a local transverse Mercator** centred on the crop, so the file's metres are true and north
  is up, and the map's frame is the file's.

## Consequences

- Good: a designed map is real ground cut and arranged, in the same language as everything else, and the editor (M7)
  can move pieces by editing `shift` and `area`.
- Good: the file stays small (a 6 km square at 5 m is 2.9 MB; the whole Austerlitz field, 10.3 MB) and is the measured
  data, not a resampling; the hash makes a changed file an error, not a silent change.
- Good: no lattice of the source grid in the shading, and the same bytes in Node and the page.
- Bad: the heightfield is in git; each re-import adds its size to the history.
- Bad: a piece keeps its absolute heights, so pieces from different heights need an edit to meet (open in
  `docs/systems/map.md`).
- Bad: the importer depends on ČÚZK's image service, its projection support and its limits; `check:data` checks the
  committed file, not a re-import.

## Alternatives considered

- **Resample to 2 m at import and commit that:** no interpolation at compile time, but 6× the bytes (18 MB for 6 km)
  and a resampling baked in.
- **DMR 5G at its native 2 m:** finer, but 18 MB for 6 km and 58 MB for the whole field, with more modern detail to
  clean; the importer offers it (`--model 5g`) where a map needs it.
- **Web Mercator, as the prototype asked for it:** north up but distorted (a 5 m pixel is 3.3 m of ground at this
  latitude). **The model's own S-JTSK grid:** true metres, but its grid is turned several degrees off north (the Křovák projection's meridian convergence).
- **Bilinear reading:** cheaper, but it leaves a crease along every node line, visible in the hill shading.
- **The heights fetched at build time instead of committed:** the owner chose to commit them (2026-10-24).
