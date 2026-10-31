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
  only where every tile its reads reach (two nodes either way) is in its slot. A slot given to a new tile is marked
  empty at once (its table texel), so neither its old tile nor its neighbours' edges next to it are drawn until the
  new tile is written; the slot is not cleared on the GPU.
- **Each tile uploaded alone**: a tile that arrives is written into its slot's rectangle of the two textures
  (`texSubImage2D`, Babylon's `updateTextureData`): 256 × 256 floats and 256 × 256 × 4 bytes, about 0.5 MB, not
  75 MB. At most 2 tiles uploaded in a frame, the rest the next frame.
- **The area follows the camera**: centred on the tile under the camera's target, re-centred when the target leaves
  the area's middle by more than a tile; the area's tiles not cached nor loading queued nearest first; at most 6
  loading at once; a tile that fails tried again 5 s later if still in the area; the decoded tiles kept in a cache as
  today.
- **Pure parts** in `src/render/campaign/ring.ts`, tested: a tile's slot, the area's place and tiles, the slots a
  move gives to new tiles, the tiles to load (the failed ones again after their wait), the slots' table, the uploads
  waiting.

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
- After review round 1 (the shader's four reads of the slots' table): the worst panning frame 6.4 ms at 1080p and
  6.6 ms at 4K, the mean 2.8 and 2.6 ms; the image unchanged.

**Review rounds** (K2c1):
- **Round 1** (`/code-review high`): severe: a tile that failed was never fetched again while it stayed in the area
  (a hole for the session): the tiles to load are now all the area's tiles not cached nor loading, a failed one again
  5 s later. With: every slot given to a new tile was cleared by an upload queued ahead of the tiles (the first tile
  up close drawn after about 72 frames): no clears now; at a tile's edge, the shader's reads reached a neighbour slot
  still cleared or holding another tile (a seam in the light while the tiles stream in): the detail used only where
  every tile its reads reach is in its slot; the move's logic pulled out of the view into `ring.ts` and tested
  (`assignSlots`, `tilesToLoad`); a second `start` no longer adds a second render loop; the half floats converted into
  a reused array; one value for the textures' side.
- **Round 2**: no severe finding; fixed: a tile already in its slot but let go by the cache was fetched again (now
  present when cached or in its slot); a failed tile's retry timer could come a hair before its wait ended and drop
  it (the timer now 100 ms after), and failures retried every 5 s for ever (now doubling to 60 s); failures of tiles
  that left the area forgotten; cached tiles sent nearest the target first after a jump; the shader reads the slots'
  table once inside a tile, four times only near its edge; the system doc. Left: loads under way for tiles that left
  the area are not cancelled (they finish into the cache); the detail starts at a tile's edge without a fade while
  its neighbour loads (the far level shows there for a few frames). Measured, the version of round 1 and this one
  alternated three times on test machine A: a mean of 2.7 to 3.0 ms against 2.6 to 2.9 ms, the worst 5.0 to 13.3 ms
  against 4.9 to 8.5 ms: the same, the single slow frames in both (the GPU shared with another page in that hour).

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

The patch is 501 × 501 vertices (50 km, a multiple of the far mesh's 500 m), its triangles cut as the far mesh's so
its diagonals lie on the far mesh's; the band where both are drawn is one far quad wide. The shaders share their
detail reads and the far mesh's height through two GLSL files put in by the view (`shaders/detail.glsl`,
`shaders/farmesh.glsl`).

**Results** (K2c2), on test machine A:
- Up close, the Alps' silhouettes from the 100 m relief (screenshots at 30 and 60 km); the patch's edge unseen: the
  view at Lake Constance from 90 km with and without the patch differs only inside the patch's trapezoid, by its
  finer relief (a mean of 0.5 level a channel, 0.4% of the pixels by more than 16), with no line along its border;
  from 100 km and further, where the detail is not used, the same image as without it.
- Panning up close, the patch drawn: a mean of 2.9 to 3.0 ms and the 95th centile 4.4 to 4.5 ms at 1080p over two runs,
  3.5 and 5.1 ms at 4K; the worst single frames 7.7 to 12.9 ms, as without the patch in the same hour (K2c1's
  results: the GPU shared with another page).
- Learnt: Babylon's shader preprocessor reads a `#include<…>` in a comment as an include and waits for its file, the
  material never ready and no error logged.

**Review rounds** (K2c2):
- **Round 1** (`/code-review high`): severe: the patch took the far height at the edge of a tile not yet drawn and the
  detail beside it (a cliff along the tile's edge, the geometry jumping when the tile came): a tile now fades in over
  0.4 s as it is first drawn, and toward a neighbour not yet drawn over 10 nodes (1 km) from their edge, in the light
  and the geometry alike (`shaders/detail.glsl`); the band where the patch eased into the far mesh moved with the
  patch in steps of 500 m (heights jumping there while panning): the detail now eases out from 19 to 22.5 km from the
  camera's target, moving with it, the band beyond; the shader took the far level's nodes as one over a float
  (3200.0002 for 3201, a crack at the edge): passed exact; the includes registered with Babylon
  (`ShaderStore.IncludesShadersStore`, as `src/look/units.ts` does) instead of put in by hand. With: the patch drawn
  first, the far mesh under it then hidden by the depth test, not shaded; the pointer's map point up close from the
  100 m shape; the patch's size checked against the far mesh and the close cells, none on a frame too small for it,
  the old one disposed on a new close level; one setter for both materials, one off-map rectangle. Measured after:
  the same image (a mean of 0.2 to 0.8 level against round 0's), panning a mean of 2.8 to 3.0 ms and the 95th
  centile 4.0 to 4.5 ms at 1080p and 4K, the worst single frames 5.0 to 8.4 ms.
- **Round 2**: severe: near the frame's edges the patch, pushed in off its target, could take the detail at its own
  edge (a crack beside the far mesh): the detail now eases in over 2 km from the patch's band wherever the patch lies
  (`patchRamp`, tested, and the same in `shaders/patch.vert`). With: the map's height on the CPU (the pointer, the
  scale, the camera's clearance) follows the drawn surface's shares, not the 100 m shape whole; the pointer's point
  found by walking the ray down and halving (`rayGround`, tested), the fixed point not converging on the 100 m
  relief's steep slopes; a level the patch does not fit leaves it off (a warning) instead of stopping the page; the
  patch skips its detail reads where its share is none; one bilinear read for both levels' heights; the far mesh's
  quad kept once; a close level set again lets the last one's textures go. Left: the far mesh's height is written
  twice, in TypeScript (tested) and in GLSL (`shaders/farmesh.glsl`), kept the same by hand. Measured after: the image
  the same (a mean under 0.01 level), the patch's edge whole at the frame's east edge; panning a mean of 2.9 and
  3.2 ms at 1080p and 4K, the 95th centile 4.1 and 4.3 ms, the worst single frames 6.4 and 7.7 ms.

## Open questions

- A denser mesh far out too (a mesh in rings around the camera) if Europe's far views need it.
- Up close, a lake's shore in the light shows a saw-tooth (the 100 m tiles' sunk beds against the water's steps from
  the far level), from K2b on, with or without the patch (seen at the frame's east edge, 40 km).
