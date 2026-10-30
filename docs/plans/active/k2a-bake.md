---
status: active
last_reviewed: 2026-10-30
---

# Plan: K2a, the campaign map's bake in the game's code

Track K (`docs/plans/active/track-k.md`), on `epic/campaign`, after K1 (`docs/plans/done/k1-theatre-look.md`) and
K1b (`docs/plans/done/k1b-forests.md`). The first step of moving the prototype's map into the game: the bake that
makes the map's one shape and its light, as one module the game owns, and a tool that writes its output as binary,
compressed tile levels with a manifest. The page that draws them is K2b.

## Scope

- `src/render/campaign/bake.ts`: the bake as pure functions on a grid, moved from the tools' bake module (which goes):
  the heights despiked, the one shape (large forms, detail, mountains lifted, the edge flattened), the lakes'
  distance and their sinking, the sun's soft shadow and the sky's occlusion by rows, and the forest field's smoothing
  and resampling (from `tools/worldcover.ts`, which keeps only the reading of WorldCover). No DOM, no Node: K2b can
  run it in a worker if a map is ever baked in the browser. Renderer data, not the campaign's rules: plain float, not
  under the exact-number lint of `src/campaign/`.
- `src/render/campaign/tiles.ts`: the tile format, both ways (decision 0094):
  - a tile is `size` × `size` nodes of one level, a 16-byte header (magic, version, level, tile column and row, size,
    channels) then the channels, planar: the shape as Uint16 in `scale` metres, each row stored as the differences
    from the node before (relief is smooth: small numbers that compress well), then one byte plane each for the sun,
    the sky and the forest;
  - `packTile` and `unpackTile` work on the raw bytes; the compression is the caller's (Node's zlib in the tool, the
    browser's `DecompressionStream('deflate')` in the page), so the module stays pure and synchronous;
  - the manifest: the format's version, the frame, the bake's parameters (the shape's, the sun's, the forest's box),
    the levels (cell, nodes, tiles, scale) and the credit. The page uses tiles only when their parameters match.
- `tools/campaign-tiles.ts` rewritten on the module: two levels, 250 m (the whole theatre, far) and 100 m (close),
  each baked (heights, shape, lakes, light on all cores, the forest field), cut into tiles of 256 nodes, deflated,
  written under `scratch/campaign/` with `manifest.json`. Until K2b replaces the prototype, the 100 m level is also
  written as the prototype's `.js` tiles (it cannot fetch binary from `file://`), from the same bake.
- `tools/campaign-theatre.ts` and `prototypes/campaign-map.html` unchanged but for their imports.
- Docs: `docs/systems/campaign-map.md` (new: the bake and the format), decision 0094 (the tile format), the track's
  table and `docs/INDEX.md`.

## Acceptance

- Vitest (`test/campaign-bake.test.ts`, moved and extended; `test/campaign-tiles.test.ts`): a tile packs and unpacks
  to the same values, its edge tiles padded with the grid's edge; the shape's row differences round-trip at the
  Uint16 limits; a tile deflated by Node's zlib inflates in `DecompressionStream`; a wrong magic, version or length
  refused; the light baked by bands (as the workers do) gives the bytes of one pass.
- The prototype's image: the prototype's tiles written by the new tool equal, byte for byte, those written before
  K2a (so the page draws the same image), and the 100 m level unpacked carries the same shape and light (one bake,
  two packings: the binary shape above its base, the prototype's from zero).
- Measured: each level's size on disk (against the prototype's base64 tiles), and the bake's time on this machine.

## Results

- The bake moved whole: the prototype's 640 tiles and meta file written by the rewritten tool are byte for byte
  those of K1b's tool (the page unchanged, so its image is the same); every tile of the binary 100 m level, inflated
  by `DecompressionStream` and unpacked, carries the light of the prototype tile of the same place byte for byte,
  and its shape less the base (140 steps) held at zero is the prototype's; the binary level keeps 18,413 lake-bed
  nodes below the lowest ground that the prototype holds at zero (a check script, 3 s for the 640 tiles in one Node
  thread; rerun after each round).
- Sizes, the 1805 theatre: the 100 m level 91 MB (the prototype's base64: 280 MB; raw: 210 MB), the 250 m level
  18 MB.
- The build: 69 s on 8 cores (the owner's WSL machine, an i7-9700K): 10 s for the 250 m level, 58 s for the 100 m
  one, most of it the light.
- Tests: `test/campaign-tiles.test.ts` (13), `test/campaign-bake.test.ts` (one more: the bands give the bytes of one
  pass), `test/worldcover.test.ts` (unchanged, its smoothing and resampling now from the bake module).

## Review rounds

- **Round 1** (`/code-review high`): severe: the shape was stored from zero, so a lake sunk below the lowest ground
  lost its bed (18,413 nodes of the 100 m level) while its light kept it: the shape now stands above the level's base
  (-70 m, the deepest a lake sinks), in the manifest; a level's grid rounded where the frame was not a whole number
  of cells: `frameGrid` refuses it now, the forest field's too; a failed build left new tiles under the last
  manifest: each output is built beside the last and swapped in whole; the manifest's parameters left out some the
  bake depends on: all of them now, the lowest ground with them. With: `packTile` refuses a place past the header,
  `unpackTile` refuses a tile of another place than the one asked for; the forest field loaded once and the far
  level's heights the theatre's own; one `levelLayout`; the tiles deflated on the thread pool; the manifest's format
  apart from the tiles'. The prototype's tiles unchanged, byte for byte.
- **Round 2**: severe: an output given with a trailing slash put the build inside it, and the swap then removed both
  (no tiles left): the paths resolved first; the swap not all at once (the old removed before the new was in, the
  two outputs one after the other): the old ones renamed aside, the new ones renamed in, the old ones removed last,
  a failed rename put back, a crashed run's leftovers cleared. With: the manifest's parameters with the forest
  field's cell and WorldCover's level; every level's heights sampled at its recorded zoom (the far level had taken
  the theatre's, under a zoom it did not come from); each tile cut once for both outputs; as many deflates at once as
  libuv's pool has threads, written without blocking; the acceptance's claim of the same bytes twice replaced by what
  the test checks (bands against one pass); a stray doc comment. Left: the prototype still holds its lake beds at
  zero, as before K2a (its shader reads its shape from zero; the page that replaces it, K2b, reads the base).

## Open questions

- One bake for both map views (decision 0058): the battle map's lit view bakes its own relief
  (`src/render/lit/bake.ts`), at another scale and from compiled map layers. Whether the two share a light model is
  K2b's question, with the renderer.
