---
status: active
last_reviewed: 2026-10-31
---

# Plan: K2c, streaming the close zoom

Track K (`docs/plans/active/track-k.md`), on `epic/campaign`, after K2b (`docs/plans/done/k2b-page.md`). The page
(`app/campaign.html`) draws the close zoom from the 100 m tiles in a detail area of 12 × 12 tiles around the camera
(`src/render/campaign/view.ts`). Today that area is a window that refills when the camera moves more than two tiles:
its arrays are cleared, the cached tiles copied back in, and the whole area (75 MB) uploaded again, and every tile
that arrives uploads the whole area too. Panning up close, frames take 80 to 100 ms (K2b2's results). And the map's
mesh has a vertex every 500 m, so up close the 100 m relief is only in the light, not in the silhouettes.

After K2c, the track goes on to K2d (the names) and then Europe (the owner, 2026-10-31): the streaming is written so
that a level of any size works the same, Europe's 100 m level of 40,001 × 35,001 nodes as the theatre's.

Two PRs, each reviewed by the workflow in `AGENTS.md`:

## K2c1: a ring of tiles, each uploaded alone

- **The ring**: the detail area's textures hold 12 × 12 tile slots, and the tile at (i, j) of the level always lives
  in slot (i mod 12, j mod 12). The textures wrap (repeat), so a point's node, taken modulo the area, reads its tile's
  slot and its neighbours across a slot's edge, the wrap's edge included. When the camera moves, only the tiles that
  come into the area are loaded, into the slots of those that left; nothing is cleared, copied back or uploaded again.
- **Which tile a slot holds**: a small texture of 12 × 12 texels (the slots' table) holds the column and row of the
  tile in each slot, as 16 bits each (Europe's 100 m level has 157 × 137 tiles); the shader uses the detail at a point
  only where its slot holds the tile that point lies in, and that tile is loaded. A slot given to a new tile is
  marked empty at once (its table texel), so its old tile is never drawn in the new place.
- **Each tile uploaded alone**: a tile that arrives is written into its slot's rectangle of the two textures
  (`texSubImage2D`, Babylon's `updateTextureData`): 256 × 256 floats and 256 × 256 × 4 bytes, about 0.5 MB, not
  75 MB. At most a few tiles uploaded in a frame (a budget in bytes), the rest the next frame.
- **The area follows the camera**: centred on the tile under the camera's target, re-centred when the target leaves
  the area's middle by more than a tile; the tiles queued nearest first, the ones no longer wanted dropped from the
  queue; at most 6 loading at once; the decoded tiles kept in a cache as today.
- **Pure parts** in `src/render/campaign/ring.ts`, tested: a tile's slot, the area's tiles for a target, the tiles
  to load and to let go when the area moves, the queue's order, the upload budget.

**Acceptance**: Vitest on the ring's pure parts. On test machine A: no frame over 6.7 ms panning the Alps up close
(a scripted pan over the same path as K2b2's, each frame waited for on the GPU) at 1080p, measured at 4K too; the
same image as before at the four views of K2b2 once the tiles have loaded (a mean difference under 1 level).

**Results** (K2c1), on test machine A (Windows Chrome on its RTX 3080, headless over CDP, 1920 × 1080):
- Panning over the Alps up close at 45 km as a player would: 400 steps of 0.4 km, a step a frame, the tiles loading
  between frames, each frame waited for on the GPU (the page's own loop stopped, the GPU warmed up first): a mean of
  2.4 ms, the 95th centile 3.7 ms, the worst 4.8 ms at 1080p; 2.9, 4.2 and 5.5 ms at 4K (device pixel ratio 2, FSR 1
  at ×1.87). K2b's window refilled and uploaded 75 MB: 80 to 100 ms.
- Uploads: 2 slots a frame (4 slots a frame gave frames of 6 to 7.7 ms, their CPU 1.6 to 3.2 ms; the scratch arrays
  reused). Measured too: the first frame after the GPU idled takes 11 to 27 ms whatever it draws (its clocks), so a
  check warms the GPU up first.
- The same image as K2b's at the four views (a mean difference of 0.01 level a channel, the clouds' drift).
- Learnt: Babylon's shader preprocessor fails on a semicolon in a comment on a `uniform` line.

## K2c2: a denser mesh near the camera

- A **patch** of 512 × 512 vertices 100 m apart (51 km a side) follows the camera's target (moved by whole cells of
  the far mesh, so it never swims), raised by the 100 m shape where its tiles are loaded and by the far shape
  elsewhere; at its edge, its height is the far mesh's own (its edge lies on the far mesh's grid lines, where the far
  mesh is linear between its vertices), so the two meet without a crack.
- The far mesh's vertices inside the patch drop under the plate: the far surface falls away under the patch, which
  covers it from a camera that looks down at 30° and more.
- Only up close (where the detail area is used); far out, the far mesh alone, as today.

**Acceptance**: the silhouettes of the Alps up close from the 100 m relief (screenshots, before and after); no crack
or overlap at the patch's edge (a check of the heights along it, in Vitest on the edge's formula, and screenshots
along the edge); still no frame over 6.7 ms panning up close on test machine A.

## Open questions

- A denser mesh far out too (a mesh in rings around the camera) if Europe's far views need it.
