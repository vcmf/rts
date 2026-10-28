---
status: active
last_reviewed: 2026-10-10
---

# Plan: L2, the terrain detail layer

Phase L2 of Track E (`docs/plans/active/track-e-look.md`): brush detail on the ground that holds its
size across the zoom range, with no seams, shimmer or tiling, and the bench harness the stage-1
budgets are measured with.

## Problem

The terrain's paint grain (`src/look/shaders/painter.glsl`, `paint()`) reads one texture at two fixed
world scales, 5.5 m and 21 m, projected on the dominant axis of the normal:
- **Its size on screen follows the zoom.** At the default camera one 5.5 m tile spans about 62 px of a
  1080p frame, so the 512² texture is minified about 8× and its fine marks are averaged away by the
  mips. At the closest zoom it is about 3× larger. The grain the player sees changes with every wheel
  step.
- **The axis switch is hard.** Where the dominant axis changes (steep banks, the far ring's slopes)
  the pattern jumps: a seam.
- **The band edges have a fixed softness** in light units: where the grain varies faster than a pixel
  they alias, and a slow pan flickers.
- **Nothing measures any of this,** and there is no way to measure GPU cost per pass at all.

## Scope

Three PRs, the first two now:

1. **L2a, the bench harness and the readability guard** (no change to the look; the goldens match
   main):
   - a bench mode of the look page (`?bench`) that runs fixed cameras and writes a JSON result:
     frame times, GPU time per pass, draw calls, triangles, texture memory, the build hash; a headless
     driver for this machine; the owner runs the page on the laptop;
   - the readability guard of stage 1 (track plan, "Current focus"): flat blocks in the four army
     coats at battalion size on the ground, and a greyscale check that each separates from the ground
     under it, in summer and winter;
   - baseline results in `docs/plans/active/track-e-results/`.
2. **L2b, the detail layer** (research §c terrain 1–5, the terrain proposal's runtime layer 4), with
   its checks: scale stability, seams, shimmer, and the image set for the tiling review.
3. **L2c, brush masks per terrain class,** when the owner's brushes land (art bible §7). Not planned in
   detail here; the layer takes any greyscale texture, so L2c is a texture and a class mask.

## Approach

### L2a: the bench

**The page mode.** `look.html?bench` builds the world as usual, then runs a fixed list of cameras: the
closest, the default and the widest zoom, each at yaw −45°, 0° and +45° (decision 0010), held for a
set time each. It records:
- **Frame time** (the interval between frames, on the frames that time the whole frame): p50, p95, max.
  In a browser it is held at the display's refresh; arms are compared by GPU frame time.
- **GPU time per pass**, from `EXT_disjoint_timer_query_webgl2`, with our own `TIME_ELAPSED` queries:
  the terrain (tile, far ring, apron), the scatter (every thin-instance mesh), the water, and the
  finishing pass. Queries cannot nest, so whole-frame GPU time is measured on alternate frames. A
  mesh's draws are timed only in the camera's own render pass (`engine.currentRenderPassId`), never
  in a bake. Without the extension (Safari) the GPU fields are `null`, not zero; SwiftShader has it,
  and times software rendering. A pass is timed as segments of consecutive draws (a query per mesh
  inflated the totals 11–30× on ANGLE Metal).
- **Draw calls and triangles** per frame (Babylon's scene instrumentation).
- **Texture memory:** the sum over the scene's textures of size × bytes per texel × the mip factor,
  labelled an estimate (WebGL cannot report it).
- **The build:** the git hash baked in at build time, the user agent, the GPU renderer string
  (`WEBGL_debug_renderer_info` where available), the canvas size and device pixel ratio.

**Arms.** A bench run can compare variants of the page in one session, interleaved (A B B A per
camera) so heat and clocks drift equally on both. L2a ships the harness with a single arm; L2b adds
the L0 grain as the second arm, which gives the "+1 ms over L0's terrain" figure.

**Running it.** On the laptop: `npm run build`, `npx vite preview`, open the look page with `?bench`
in Chrome, wait for the result, save the JSON it offers into `docs/plans/active/track-e-results/` as
`l2-<date>-<hash>.json`. Here: `node tools/bench-look.mjs <url>` drives a headless Chrome and writes
the same JSON; its numbers are labelled by renderer and pass no gate (track plan, "Measuring").

### L2a: the readability guard

`tools/guard.mjs` renders the look page with blocks added on the ground and checks them in greyscale:
- **Blocks:** one per army coat (as built then, the art bible's: France `#2C4FA8`, Russia `#2F6B3C`, Austria
  `#E9E3D3`, Britain `#B3302A`; now four uniforms' coats from the era's dyes, `tools/army-blocks.mjs`, decision
  0068), at battalion size: a line of about 100 men in three ranks, 20 m × 3 m, 1.8 m
  tall. Painted with the shared painter at unit crispness (`jitter` 0.3), so they take the same light,
  shadow and haze as the ground.
- **Places:** spots on the default view chosen to cover the sunlit slope, the shadow side, the flat,
  the bank and a field, so the coats meet the ground's light, mid and shadow bands.
- **The check:** in a greyscale capture (Rec. 709 luma of the final frame), each block's mean luma
  against the ground's at the same pixels, in a render without blocks. A block's pixels come from two
  mask renders (the blocks flat white, then flat black). A block separates when they differ by at least
  **0.10** (on 0–1). Also reported, not gated: whether the block is more saturated than the 99th
  percentile of the ground's saturation in the frame ("armies are the most saturated objects").
- **Seasons:** summer and winter.
- **Use:** every stage-1 screenshot set runs it. A block that fails on main is reported to the owner
  (a palette question); a change may not make a passing block fail.
- **Its negative test:** a block painted at the grey that matches the ground's value under it must fail.

### L2b: the detail layer

In `paint()`, for the terrain only (other surfaces keep today's grain until L7):

- **Projection: biplanar** (Quílez), the two most aligned of the three planes, weights sharpened and
  zero below 1/√3, so on gentle ground only the Y plane is read and the second fetch is skipped.
  Texture derivatives come from the world position's screen derivatives, taken once before any axis
  choice, and every read is a `textureGrad`: a change of plane or scale never reaches the mip
  selection.
- **Scale: two power-of-two octaves cross-faded by the pixel footprint** (Age of Sail's MetaTexture).
  The footprint is computed, not differentiated: view distance × the angle of one pixel of a
  1080-line frame ÷ √(cos incidence), smooth across triangles. The texture tile spans a fixed number
  of 1080p pixels (`P`, a SPEC value set by eye in L2b against the primary targets); octave A has the
  largest power-of-two world size at or below `footprint × P`, octave B twice that, and the weight is
  the fractional part of the log. The grain stays the same size in the frame at every zoom, on near
  and far edges of the tilted view, and does not depend on the screen's resolution.
- **The 21 m blotch term stays fixed in the world** (research §c terrain 3: a large value variation
  can keep its world scale), on the same projection.
- **Variance renormalised:** blending decorrelated reads lowers contrast (by √Σw² of the normalised
  weights). The blended grain is divided by that factor about its mean, so the grain's strength does
  not pump with zoom or slope.
- **Anti-tiling:** Quílez's index variation, two reads per octave at offsets chosen by a low-frequency
  index read once in world space. The index depends on the position only, so a texture scale reads
  the same whether it sits in octave A or B, and the octave hand-over stays continuous.
- **Band edges `fwidth`-aware:** the ramp's transitions keep their design width but never become
  narrower than the light value's change across one pixel, so they cannot alias.

**As built** (what L2b changed against the above, and why):
- `P` is 2048 (`SPEC.detail.px`): at 1024 the grain read as pixel noise. One texel spans about 2.7 px of
  a 1080-line frame; the grain's correlation length is about 5 px.
- **A strength, `SPEC.detail.amp` = 0.4:** at the texture's full contrast (the renormalised blend) the grain
  broke every band edge into static. L0's grain was weak only because the mips averaged it away. 0.4 was
  set by eye against L0 at its closest zoom.
- **The index at 400 m** (`SPEC.detail.index`), not 160 m: at 160 m the index field changes within a few
  pixels at the far edge of the widest view, and the hand-over between variants became a visible contour
  (the seam check found it).
- **The variant hand-over depends on the index alone** (Quílez's `- 0.1·(a − b)` term dropped), so a variant
  with no weight is not read.
- **The cube's diagonals:** biplanar weights all reach zero where the normal points along a cube diagonal (a
  55° slope facing between two axes), and the pair of planes read flips there: a discontinuity, found on the
  test hill. The grain fades to its mean as the weights' sum falls under 0.25, which keeps it continuous.
  The fade starts at about 47° of slope (facing a diagonal); the tile's steepest cell is 42°, and 74 of the far
  ring's 33,124 cells pass 35° (the steepest 51°).
- **Band edges:** never narrower than two pixels' change of the light value (under a horizontal shift, one
  pixel left 0.24% of the pixels shimmering, two leave 0.18%). The widening takes the whole light value,
  baked shadows and cloud shadows included: where they step within a pixel the ramp opens to a soft edge
  about two pixels wide, which is the anti-aliasing they lacked.
- **The pixel's angle follows the camera** (a uniform, not a define from the SPEC's field of view): frames
  wider than 16:9 keep the horizontal field of view and see less vertically.
- **The blotch term is renormalised** like the grain, so two blended planes do not weaken it on slopes.
- **Cost:** reading each plane's coordinates once and skipping zero-weight variants did not move the
  Mac's numbers; the reads are kept simple and the laptop decides.
- **The L0 grain stays behind a define** (`DETAIL_L0`) as the bench's and the checks' baseline arm,
  until the prototype exit (L9).

Fetches on gentle ground: index 1, octave A 2, octave B 2, blotch 1: 6 (today 2). On steep ground the
second plane adds up to 5 more. Cost is measured (bench, both arms), not assumed.

### L2b: the checks (a new tool in tools/, detail-check)

All render the look page headless with the clock frozen. A debug define (`DETAIL_DEBUG`) makes the
terrain write its grain value to red and its view depth to green and blue (16 bits).
Frames are 1280×720: a 1920×1080 screenshot crashes headless Chrome here, and the grain's size is set in
1080-line pixels, independent of the frame's.
- **Scale stability:** the debug view over a zoom sweep (radius from the closest to the widest, 8
  steps, at the default pitch and the steepest), with every other mesh hidden. In windows at the
  near edge, the centre and the far edge of the frame, the grain's correlation length is the lag
  where its autocorrelation falls to one half, along x and along y; the wavelength is their
  geometric mean. **Pass:** every window of every frame within ±25% of the median. As built: 192 px
  windows (at 128 px the estimate's own noise was about ±10%).
- **Seams:** a test hill (a turned profile with faces at 0–90° in 15° steps, all around) on the
  ground, the grain texture swapped for a smooth one (only broad features), the debug view at three
  zooms. A smooth texture gives a smooth image except at silhouettes (found from the depth), so a jump
  between neighbouring pixels is a seam or a mip line. **Pass:** no pixel over the threshold away from
  silhouettes. The threshold is set from the smooth texture's own steepest gradient, recorded in the
  tool. As built, the hill's foot sits 2 m below the lowest ground under it; a pixel belongs to the hill
  when the hill drawn alone shows the same depth, and pixels where the hill and the ground both match (the
  line where they meet) are left out; the hill's corners are rounded over 3 m (terrain normals turn over a cell or two; a
  crease turns them within a pixel), faces seen within about 10° of edge-on are skipped (a second debug
  view, `DETAIL_DEBUG_INC`, gives the incidence), and a step must also keep at least 0.8 of its size when
  the frame is rendered at twice the resolution (four quarter frames through the projection): a seam is a
  step at any resolution, a fast but smooth transition shrinks.
- **Shimmer:** the final image, terrain only (scatter and water hidden), at the default zoom, over a
  slow pan of about a quarter of a pixel a frame. A frame's pixel flickers when its value leaves the
  range of its 3×3 neighbourhood in the previous frame by more than 4/255 (a sub-pixel move cannot do
  that to a filtered image). **Pass:** fewer than 0.1% of pixels per frame pair. The limit is checked
  against the sabotages below and may be tightened once the real values are known, never loosened
  without a note here.
  **Note (L2b): the measure and the limit changed.** The 3×3 range test cannot see an aliased edge (an edge
  that crawls stays inside its neighbours' range): hard band edges scored 0.038%, under the page's 0.05%.
  The check now shifts the image a quarter pixel a frame, right and down, through the projection (the
  sampling grid moves under a still world) and counts pixels whose luma differs by over 8/255 from the
  previous frame resampled a quarter pixel along: a filtered image is predicted that way, hard edges and
  specks are not. Measured: the page 0.48%, the L0 grain 3.1%, hard band edges 3.4%. What is left on the
  page is on the baked shadows' edges (`docs/known-issues.md`), so the limit is **1%**, to tighten when L5
  smooths them.
- **Tiling:** the image set for the 3-reviewer test (the widest zoom, three yaws, summer and winter,
  randomised names, an answer sheet). As built: the terrain alone, both arms (L2b and the L0 grain), 12
  images and `answers.json` in the tool's output folder; the tally goes in `docs/plans/active/track-e-results/`. The tool also reports,
  not gates, the autocorrelation of the debug view at the texture's repeat distance.
- **Negative tests** (`--selftest`): each check passes on the page and fails on its sabotage:
  - scale: the L0 grain (`DETAIL_L0`);
  - seams: the L0 grain's hard axis switch, and implicit derivatives (`texture` in place of
    `textureGrad`, which draws mip lines at octave hand-overs);
  - shimmer: hard band edges (a step in place of the `fwidth`-aware ramp).

The results of L2b's run are in `docs/plans/active/track-e-results/l2b-detail.md`.

## Acceptance

From the track plan (research P1), on this machine unless marked:
- **L2a:** the bench runs headless here and writes its JSON; the GPU fields are filled where the
  extension exists and `null` where it does not. The guard runs in summer and winter, its
  negative block fails, and the baseline (main) is recorded. Goldens: 0 regions over tolerance against
  main.
- **L2b:**
  - scale stability within ±25%; no seams or mip lines on the test hill at three zooms; shimmer under
    the limit; every sabotage fails its check;
  - **tiling:** 3 of 3 reviewers cannot point to a repeat (the owner arranges them);
  - **cost:** ≤ +1 ms GPU for the terrain pass over the L0 arm, **on the laptop** (owner's bench run);
    this machine's numbers are reported, not gated;
  - the readability guard: no block that passes on main fails;
  - goldens: the differences are the terrain's, and are shown in the PR.

## Not in L2

The macro colour bake (L5), the stroke masks per class (L2c), foliage and buildings (L7), units
(stage 2). Snow, cloud-shadow and flower terms keep their fixed world scales: they are albedo and mask
work (research §c terrain 7).

## Risks

- **Two octaves may not hold ±25%.** A cross-fade of two decorrelated textures has a correlation length
  between theirs; the content of the texture decides how much it swings. If it fails, a third octave
  with bell-shaped weights (self-similar under a shift of one octave) is the fallback, at 2–3 more
  fetches.
- **Constant-size grain on the far ring.** At the far edge of the widest view the footprint is metres;
  the grain then sits on the far ring's 14 m triangles at a world scale of tens of metres. Expected to
  read as paint; checked in the goldens.
- **The bench on this machine** cannot be compared with the laptop's; only the laptop gates cost.
