---
status: active
last_reviewed: 2026-10-11
---

# Plan: W3, the water-data bake (depth, shore distance, flow)

Water phase W3 (`docs/plans/active/prototype-plan.md` §4.3), after W2 (`docs/plans/active/w2-river-banks.md`) in
Track E's stage 1 (`docs/plans/active/track-e-look.md`). Research: `docs/research/stylized-water.md` §2.6, §4.3.

## Problem

The water shader knows its depth only per ribbon vertex (`aDepth`, `src/look/water.ts`): about one value per 0.7 m
across and 1.5 m along, interpolated over triangles, and nothing at all outside the ribbon. W4 (the bed-painting
shader and the shoreline) and W5 (wet banks, bars) need, at any point of the tile:
- the **water depth** (signed: below the water, and how high dry ground stands above it);
- the **distance to the shoreline** (signed, + in the water), for foam lines and the wet band; the shoreline is
  where the water meets the carved ground (bars included), not an offset from the centre line;
- the **flow** (direction and speed), for strokes that follow the current.

## Scope

- The bake, offline, in `tools/build-look-data.ts`, from the authored height `H` and the river's samples.
- Its storage in the look data (format version 4) and its texture on the page, bound to the terrain's and the
  water's materials.
- Debug views (depth, shore distance, flow arrows) and checks.

**Not in W3:** using the data in the drawn frame (W4: the bed shader, the shoreline, foam; W5: banks). The default
frame does not change: the materials declare the texture only under the debug define.

## Approach

### What is baked

One RGBA8 grid over the tile at `SPEC.water.texel` (0.5 m, the bank normals' grid: 1600² texels over the 800 m tile), texel centres at
`(i + 0.5)·texel − tile/2`:

| Channel | Content | Encoding |
|---|---|---|
| R | depth `zw − H` (the water level of the nearest river sample, as the carve uses it, minus the authored height) | `SPEC.water.depth` [−1, 2] m → 0..255 (1.2 cm steps) |
| G | signed distance to the shoreline, + in the water | ±`SPEC.water.sdf` (16 m) → 0..255 (12.5 cm steps), 127.5 = the shore |
| B, A | flow: the nearest sample's tangent × speed / the river's top speed, eased to 0 at the shore | −1..1 → 0..255 |

- **Depth is signed** (research §2.9 wants the height above water for the bars): the shoreline is its zero, and
  bilinear filtering of a signed value puts the drawn shoreline between texels, not on them. Depth is set only in
  the river's corridor (within `bankReachAt` plus the carve's blend); elsewhere the ground is dry by definition.
- **Against the authored `H`, not the drawn heightfield:** the 1.79 m grid cannot hold the shoreline the 0.5 m
  bank normals shade; W4 paints the shoreline from this data. The two disagree within a cell of a shallow bar's edge;
  the check measures how far (it informs W4's shoreline).
- **The shore distance from an exact Euclidean distance transform** (Felzenszwalb–Huttenlocher) of the wet mask,
  inside and outside, minus half a texel so the zero falls between a wet and a dry texel; clamped to ±16 m.
- **Flow** where the corridor is: the direction of the nearest segment, the speed `RIVER.v` over the river's top
  speed, times `smoothstep(0, 1.5 m, shore distance)` (slack water at the edge; research §4.3: fade strokes where
  slow). Dry texels carry the edge's 0.

### Storage and the page

- **The look data, version 4:** the bank normals' span layout becomes a general one (`SpanGrid`: a grid, its
  channel count, row spans and the covered texels' bytes), used by the bank normals (3 channels) and the water data
  (4). The water's spans cover the texels whose shore distance is above −16 m; the rest take the fill value
  (dry, 16 m from the shore, no flow).
- **The texture:** RGBA8 1600², trilinear with mips (13.7 MB; counted in `minSpec.bakeMB`), clamped; set on the
  terrain's and the water's materials as `uWater`.
- **Debug views** (define `WATER_DEBUG`, uniform `uWaterView`), on the terrain and the water ribbon:
  1 depth (blue under the water by depth, dry ground by height above it), 2 shore distance (1 m contour bands, the
  shore in white), 3 flow (an arrow per 2 m cell, along the flow, length by speed), 4 and 5 the raw texels (RGB, and
  the alpha) for the check. `?water=depth|sdf|flow` on the page; `__look.waterView(n)` for the tools.

### Checks

- **The bake** (`tools/water-check.mjs`, Node):
  - **Depth:** the decoded texture at 2,000 random corridor points (bilinear, as the GPU samples) against
    `zw − H` there: within the bilinear interpolation's own error (measured on the authored surface), 95th percentile.
  - **Shore distance:** against a brute-force reference, the distance to the zero contour of the depth on a 0.125 m
    grid around each point: 95th percentile within 0.3 m (half a texel plus quantisation). **Sabotage:** the shore
    distance as `wetEdge − |n|` from the centre line (what a bake without the transform would do) fails it on the
    bars and at bends.
  - **Flow:** the direction within 5° of the nearest segment's tangent where the water is over 1 m from the shore.
  - **Against the drawn ground:** the share of wet texels where the drawn heightfield stands above the water, and the
    farthest of them from the shore (reported for W4, not gated).
- **The page** (`tools/water-check.mjs <url>`): the raw debug view at the closest zoom over the sharpest bend; at
  points projected on the drawn ground, the pixels against the Node-decoded texture: within 3/255. **Sabotage:**
  the texture sampled upside down (`WATER_SAB_FLIP`) fails it.
- **Goldens:** main against this page: no differences (the default frame does not read the data).
- **Unit tests:** the distance transform against brute force; the span grid's encode and decode.
- **Load:** the look data's size and the page's decode and upload time, reported.

## Acceptance

From the prototype plan (W3: "Debug view shows correct depth, SDF and flow arrows; no per-frame cost added"):
- the bake and page checks pass, and their sabotages fail;
- the debug views at three zooms show depth, shore distance and flow arrows (owner's eye);
- the goldens match the base exactly (no per-frame change);
- `npm run check:data` and `npm test` pass.

## Risks

- **The medial axis on the inside of tight bends** (the nearest segment switches): flow turns abruptly there.
  Only where the inner bar is dry, so its flow is 0; judged on the flow view.
- **Data size:** about 160 k covered texels × 4 bytes (estimate), 0.6 MB more on the 1.75 MB file (measured below).
- **The tile's edge:** the texture ends there, clamped; the water past it is the far ring's painted line (W4 fades).

## Results (dev Mac, against W2 as the base)

- **As built, the shore distance is exact, not the transform's.** The bake check showed the transform's distance
  (to the nearest opposite texel's centre, minus half a texel) off by up to 25 cm, worse than the sabotage. The data
  now holds the distance to the shoreline's segments (marching squares between texel centres), searched within
  the transform's distance (an upper bound). Each segment's ends are found by bisection on the authored surface: a
  point bar meets the water nearly flat (the bar's profile has no slope at the water's edge), so the depth between
  two texels is far from linear there, and a linear crossing landed near the dry texel (20–30 cm off).
- **The check's shore limit, as built:** within 1.5 m of the shore (farther out, a bilinear read rounds the ridge
  midway between two shores by up to a quarter texel; foam and the wet band read the near shore), the largest error
  under 12 cm (half an encoding step, 6.25 cm, and the chords). A 95th percentile cannot tell the sabotage apart:
  the section's own water's edge is right wherever the section alone shapes the shore; it is wrong where the carve
  meets the trough.
- **The depth range is [−1, 2] m** (planned [−1.5, 2.5]): the floodplain stands about 1.1 m above the water, so its
  dry side clamps evenly instead of showing the river query's reach as a step. The deepest water is 1.49 m; the build
  fails on water deeper than the range.
- **The bake** (`node tools/water-check.mjs --selftest`), 28,800 points in twelve 48 m regions (after review round 1):
  - depth: within 0.56 cm of the exact depth read the same way (half a step: 0.59 cm); against the depth at the
    point itself, 95th percentile 4.3 cm (the 0.5 m grid's, on the scarps);
  - shore distance: 5,632 points within 1.5 m of the shore, median 1.9 cm, 95th percentile 4.9 cm, largest 8.9 cm
    (limit 12). The section's-edge sabotage: largest 32.8 cm, 3 points over, fails; its error is local (where the carve
    meets the trough), so the gate is the largest error by design; the half-texel offset fails it on 4,448 points;
  - flow: direction 95th percentile 0.33° (limit 5°); reversed, the sabotage, 180°;
  - depth's sabotage (texel centres half a texel off): 81 cm off, fails;
  - **for W4:** 778 of 32,003 wet texels (2.4%) have the drawn heightfield above the water, at most 0.56 m into it
    (the shallow bars' edges, where the 1.79 m grid rounds the bar up).
- **The page:** 579 points on the sharpest bend at the closest zoom, 2 off by over 3/255 (largest 4.3/255); the
  texture read upside down: 578 off, fails.
- **Goldens:** the base (W2) against this page: 0 of 16 regions at all 8 cameras, pixel for pixel. The default
  shaders do not declare the texture, so the frame's cost is unchanged (no bench needed).
- **Load:** the look data 2.63 MB (was 1.75; the water data 0.88 MB: 1,822 spans, 215 k texels). The texture is made
  on the first debug view (6 ms, 13.7 MB GPU with mips), so a normal load does not pay for it until W4 reads it; the
  page's build 3.2–3.5 s on both, within its noise.
- **Debug views:** `?water=depth|sdf|flow` (screenshots in the PR).
- **Review round 1** (nothing severe; fixed and stopped): the depth and the shore distance disagreed on 33 texels
  beyond the carve (ground below the water level but outside it: now one step below 0); the depth and the flow had
  no sabotage (now a half-texel offset and the flow reversed, each failing its own part); zero flow decoded as
  +0.004 (now 128 ± 127, exact); the tool used the file without `checkLookData`, and the format did not bound a grid's
  bytes a texel; a saddle cell's centre ignored the carve's extent (now the wet rule); the texture was made on every
  load (now on the first view); the check repeated the module's wet rule and bisection (now shared); the flow view's
  arrow read picked a coarse mip at every cell's edge (now biased to the finest). Baking from the authored surface
  rather than the heightfield is recorded as proposed decision 0019.
