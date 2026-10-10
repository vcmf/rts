---
status: active
last_reviewed: 2026-10-10
---

# L2b results: the terrain detail layer (build 8dec615)

The run of `docs/plans/active/l2-detail.md`'s acceptance on the dev Mac. The look page built with
`npm run build`, served by `npx vite preview`; main's build served beside it as the base.

## The checks (`node tools/detail-check.mjs <url> --selftest`)

Frames 1280×720, SwiftShader. Every check passes on the page and fails on its sabotage.

| Check | The page | Its sabotage |
|---|---|---|
| Scale: the grain's wavelength in 48 windows (8 zooms × 2 pitches × near, centre, far), within ±25% of the median | median 3.44 px at 720 lines (5.2 px at 1080), from −10% to +19% | the L0 grain: median 0.69 px, fails |
| Seams: steps on the test hill with a smooth grain, at 3 zooms | 0, 0, 0 | the L0 grain's hard axis switch: 580, 550, 11,756; implicit derivatives (mip lines): 603, 2,233, 4,239 |
| Shimmer: pixels off their prediction by over 8/255 under a quarter-pixel shift, worst frame pair (limit 0.5%) | 0.187% | hard band edges: 2.0% |

For reference, the L0 grain scores 1.48% on the shimmer measure. What is left on the page sits on the baked
shadows' edges (`docs/known-issues.md`).

**Tiling:** `node tools/detail-check.mjs <url> <outDir> --only tiling` writes the 12 review images (the
widest zoom, three yaws, summer and winter, the terrain alone, this layer and the L0 grain) under random
names, with `answers.json`. The debug view's largest autocorrelation at the lags one texture tile can
repeat at is 0.03. **The 3-reviewer test is the owner's to arrange;** its tally goes here.

## Goldens

- Main against this page: every region of the 8 cameras differs (the ground covers the whole frame).
- Main against this page with `?detail=l0` (the terrain on the L0 grain): **0 of 16 regions at all 8
  cameras**, pixel for pixel. The detail layer changes the terrain and nothing else.

## Readability guard (`node tools/guard.mjs <url> --base <main>`)

The negative: 0 of 24 grey blocks separate (largest 0.017). Against main, the separations move by about
±0.005 per block (the grain's marks fall differently under each block), more at the cloud-shadow spot
(winter Austria 0.085 → 0.139, Britain 0.227 → 0.290).

**Two blocks that pass on main now fail, both by less than that noise:**

| Block | Main | L2b |
|---|---|---|
| Summer wheat, France | 0.102 | 0.095 |
| Summer wheat, Britain | 0.105 | 0.099 |

Both passed main by 0.002–0.005 over the 0.10 limit. **An open question for the owner** (the acceptance
says no block that passes on main may fail): the guard has no margin for the ground's own texture, so any
change to the grain can move a block that sits on the limit across it.

## Bench (this machine: a proxy, no gate)

`node tools/bench-look.mjs <url> --gpu metal`, 1920×1080, Apple M1 Pro through ANGLE Metal, A B B A per
camera: `l2b-2026-10-10-8dec615-mac-proxy.json`. Means of the two runs of each arm, the detail layer
minus the L0 grain, in ms:

| Zoom (3 yaws) | GPU frame | Terrain pass (inflated) | Frame interval |
|---|---|---|---|
| Closest | +1.2 to +1.8 | +0.4 | +0.05 to +0.45 |
| Default | +1.0 | +0.6 | +0.15 to +0.20 |
| Widest | +1.3 to +1.4 | +0.7 to +0.8 | +0.10 to +0.15 |

- **This machine cannot settle the cost gate** (≤ +1 ms GPU for the terrain, on the laptop). Metal's
  queries are inflated (the passes add up to 1.3–1.6× the frame). The L0 arm's GPU frame at the closest zoom
  moves between 2.9 and 4.2 ms from session to session while the detail layer's stays at 4.8–4.9. The
  terrain pass's difference is the steadiest figure: +0.4, +0.6 and +0.8 ms, about the same in every session.
- Draw calls (38), triangles (2.07 M) and texture memory (about 205 MB) are unchanged: the layer adds no
  draw and no texture.
- Fetches on gentle ground: the index 1, two octaves × up to two variants, the blotch 1 (L0: 2).
- **The laptop's run decides:** `look.html?bench` on the RTX 3060 laptop, saved here as
  `l2b-<date>-<hash>.json`.
