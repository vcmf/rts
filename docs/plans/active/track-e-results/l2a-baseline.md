---
status: active
last_reviewed: 2026-10-10
---

# L2a baselines (main as of L0, build 5d67a2b)

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

**The negative** (summer, the same blocks painted with the terrain's material, 0.3 m tall): 0 of 24
separate, the largest at 0.009. At full height they would come close (0.097 measured): a ground-coloured
block 1.8 m tall almost separates by its shaded sides alone. The 0.10 limit is a floor; the readability
gate (L4, stage 2) sets the real bar with people.

## Bench (this machine: a proxy, no gate)

`node tools/bench-look.mjs <URL> --gpu metal`, 1920×1080, Apple M1 Pro through ANGLE Metal, headless
Chrome: `l2a-2026-10-10-5d67a2b-mac-proxy.json`.

| Zoom | Whole-frame GPU p50 (3 yaws, 2 runs each) |
|---|---|
| Closest (r 45) | 5.2–5.9 ms |
| Default (r 125) | 6.1–6.8 ms |
| Widest (r 260, steepest pitch) | 7.2–7.8 ms |

- Frame time is vsync-bound (p50 16.7 ms).
- 38 draw calls, 2.07 M triangles (the scatter's thin instances dominate).
- About 205 MB of textures, an estimate: render-target depth buffers are not counted.
- **Per-pass times are not usable on Metal:** the passes add up to 1.6–2.7× the frame (ANGLE's Metal
  backend inflates each query). The laptop's run (Windows, D3D11) is the one to read them from.
- Run to run, the same camera varies by up to about 10%. This is why arms run A B B A.
