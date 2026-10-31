---
status: proposed
date: 2026-10-30
---

# 0094 The campaign map's tiles: binary, planar, the shape as row differences, deflated, with a manifest

## Context

Decision 0093 bakes the campaign map offline in tiles: a coarse level for the far zoom and a 100 m level for the
close one. The K1 prototype stored them as base64 inside script files, so a page opened from `file://` could load
them: 280 MB for the 1805 theatre's 100 m level, and a page that parses JavaScript to read data. K2a moves the bake
into the game's code (`docs/plans/active/k2a-bake.md`); the game is served, so it can fetch binary.

## Decision

We will store each tile as one small binary file (`src/render/campaign/tiles.ts`):
- a 16-byte header (a magic, the format's version, the level, the tile's column and row, its size, its planes); the
  reader is told which tile it asked for, so a tile of another place or another version is refused, not drawn;
- **planar** channels: the shape as Uint16 in a fixed step (0.5 m) above the level's base (below the lowest ground:
  the lakes sink under it), then a byte plane each for the sun, the sky and
  the forest; each plane is uploaded as is, and planes of one kind deflate better than interleaved bytes;
- the shape's rows as **differences from the node before** (modulo 2^16): relief is smooth, so the numbers are small;
- the whole tile **deflated** (zlib's format): Node's zlib writes it, the browser's own `DecompressionStream`
  reads it, so no decoder ships;
- a **manifest** (`manifest.json`) of its own format version: the build directory its levels lie in, the frame, every
  parameter the bake depends on and the levels' grids; the page uses tiles only when their parameters match its own.
  Each build has a directory of its own and the manifest, written last and whole, makes it live, so the page never
  reads a manifest of one build with the tiles of another.

## Consequences

Good: the 1805 theatre's 100 m level is 91 MB on disk (280 MB as the prototype's base64), its far level 18 MB; no
library to decode; the format is versioned and checked; packing is pure and tested, compression stays the caller's.

Bad: deflate is not the smallest choice (a predictor for the light planes, or a codec such as Brotli or WebP's
lossless mode, could do better, measured later if the size matters); a tile is unpacked on the main thread unless
the page moves it to a worker (K2c).

## Alternatives considered

- **The prototype's base64 scripts**: they load from `file://`, but are three times the size and parsed as code.
- **PNG images** (shape in 16 bits, the light in RGB): the browser decodes them, but its colour handling may alter
  the bytes, and the shape's 16 bits need a second image.
- **One file a level**: fewer requests, but the page streams a ring of tiles around the camera and would range-read
  a large file for each.
