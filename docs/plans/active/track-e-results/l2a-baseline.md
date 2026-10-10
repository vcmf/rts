---
status: active
last_reviewed: 2026-10-10
---

# L2a baselines (main as of L0, build be40f57)

The measurements L2b and later stage-1 phases are compared with (`docs/plans/active/l2-detail.md`).

## Readability guard

`node tools/guard.mjs <look page URL>`, the default view, 6 clusters × 4 coats, summer and winter. A block
separates when its greyscale value differs from the ground's under it by at least 0.10.

**11 of 48 blocks do not separate on main:**

| Season | Coat | Spots that fail (separation) | Why |
|---|---|---|---|
| Summer | Britain `#B3302A` | sunlit slope 0.07, cloud shadow 0.05, flat 0.10 (just under), meadow 0.01 | Red has about the value of the lit green ground: it separates by hue, not in greyscale |
| Summer | Austria `#E9E3D3` | flat 0.01, meadow 0.03 | White against the light band of the gold-green ground |
| Summer | Russia `#2F6B3C` | open low ground 0.09 | Dark green on mid green |
| Winter | Austria `#E9E3D3` | sunlit slope 0.03, cloud shadow 0.09, wheat 0.01, open low ground 0.05 | White on snow (the art bible already flags white on snow) |

These are palette questions for the owner, not regressions: the coats or the ground's value bands would
have to move (art bible §4: "keep terrain under the battle area mid-value and low-chroma").

**Also reported, not gated:** in summer most coats are less saturated than the ground's 99th percentile
(0.72: the gold patches and the flowers); only Britain's red reaches it. In winter France, Britain and some
Russian blocks are the most saturated objects. The art bible says armies are always the most saturated.

**The negative** (summer, the same blocks painted grey, each at the grey that matches the ground's value
under it): 0 of 24 separate, the largest at 0.014. The 0.10 limit is a floor; the readability gate (L4,
stage 2) sets the real bar with people.

## Bench (this machine: a proxy, no gate)

`node tools/bench-look.mjs <URL> --gpu metal`, 1920×1080, Apple M1 Pro through ANGLE Metal, headless
Chrome without vsync: `l2a-2026-10-10-be40f57-mac-proxy.json`.

| Zoom | GPU frame p50 (3 yaws, 2 runs each) | Frame interval p50 |
|---|---|---|
| Closest (r 45) | 4.0–4.7 ms | 3.0–3.1 ms |
| Default (r 125) | 6.3–6.5 ms | 4.1–4.3 ms |
| Widest (r 260, steepest pitch) | 9.2–9.7 ms | 5.5–5.6 ms |

- 38 draw calls, 2.07 M triangles (the scatter's thin instances dominate).
- About 205 MB of textures, an estimate: render-target depth buffers are not counted.
- **Metal's timer queries are not trustworthy in absolute terms.** The GPU frame time is longer than
  the interval between frames: ANGLE's Metal backend appears to count time across frames. The passes
  add up to about 1.3–1.5× the GPU frame. Comparisons between arms in one session are still usable;
  absolute and per-pass numbers come from the laptop's run (Windows, D3D11).
- Run to run, the same camera varies by up to about 10%. This is why arms run A B B A.
