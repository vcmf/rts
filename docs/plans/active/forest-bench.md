---
status: active
last_reviewed: 2026-10-13
---

# Plan: a forest bench (the leaf cards' cost where trees fill the frame)

Track E, L7 (`docs/plans/active/track-e-look.md`, what L7 still owes: foliage ≤ 3 ms in a battlefield forest).
The owner (2026-10-13), on the cards' cost: "is the performance cost dangerous?", then "do the forest bench".

## Problem

The bench's cameras orbit the camera's start (`START`, `src/look/post.ts`); its woods are small groves, and the
dense test wood (`?wood`, `docs/plans/done/soft-shadows.md`) is 95 m away, a corner of the widest view only. The
cards' cost grows with the crowns on screen (alpha-tested quads over each other), so no bench has measured them
where a forest fills the frame.

## Scope (tooling on the look page)

- `?wood=big`: a forest of about 150 m by 110 m west of the river (its own random stream, the placement rule as
  every tree; `?wood` alone keeps the small wood).
- `?benchat=<x>,<z>`: the bench's cameras orbit that point instead of the start (with `?bench` only); the JSON
  records it.

## Acceptance

- `npm test`; the default page unchanged (goldens against main: neither switch is on by default).
- The bench's views at the forest (screenshots: it fills them), then `?trees=cards&wood=big&benchat=…` with
  `?bench=trees` (cards against pack crowns) and `?bench=volume` (L7b against L7a), each arm interleaved on one page,
  the paired difference per camera reported with the repeat spread (Results, below).

## Results (2026-10-13, the dev Mac, a proxy)

The bench's views at the forest (`?trees=cards&wood=big`, focus −110, −25): it fills the closest and the default
views and much of the widest. Runs: `node tools/bench-look.mjs '…/app/look.html?trees=cards&wood=big&benchat=-110,-25&bench=…' --gpu metal --hold <s>`
(run 1 and the volume run `--hold 4`, run 2 `--hold 5`; the JSON files in `docs/plans/active/track-e-results/`,
named `forest-2026-10-13-2241ba9-…-mac-proxy.json`: they were taken on the working tree committed as 2241ba9, so
their `build` field reads `61d031a-dirty`). Each camera runs both arms twice, interleaved (A B B A), so the paired
difference per camera holds the machine's state; the repeat spread is the largest difference between the two
runs of one arm at one camera.

**The measure is the frame interval** (`frameMs`, no vsync: the page's own pace). The GPU frame timer runs longer
than the frame on ANGLE Metal (L2a's baseline), so its absolute values are not frame times; it is kept in the JSON.

| Cards against pack crowns, frame interval p50 (ms) | close | default | widest |
|---|---|---|---|
| Run 1: cards, pack | 5.97, 5.47 | 11.28, 9.52 | 16.13, 15.03 |
| Run 1: paired difference (yaw −45°, 0°, +45°) | +0.10, +0.40, +1.00 | +2.15, +1.05, +2.10 | +1.30, +0.95, +1.05 |
| Run 1: repeat spread | 0.70 | 4.80 | 1.10 |
| Run 2: cards, pack | 9.92, 8.92 | 8.10, 6.70 | 8.52, 8.07 |
| Run 2: paired difference (yaw −45°, 0°, +45°) | +0.40, −0.10, +2.70 | +1.30, +1.45, +1.45 | +0.40, +0.75, +0.20 |
| Run 2: repeat spread | 5.10 | 0.10 | 0.70 |

- **Where a forest fills the frame the cards cost about +1.4 ms a frame at the default zoom** (run 2, its repeats
  within 0.1 ms; run 1 agrees, +1.05 to +2.15 ms, noisier) **and +0.2 to +1.3 ms at the widest.** The closest zoom is
  too noisy in run 2 to read; run 1 puts it at +0.1 to +1.0 ms.
- **The default frame in the forest** (run 2): 6.7 ms with the pack crowns, 8.1 ms with the cards, of the 16.7 ms a
  frame at 60 fps; before units, smoke and anti-aliasing. The machine's load changed between the runs (run 1's
  frames are slower throughout), so the absolute values move from run to run; the paired differences are the result.
- **The passes are not split here:** ANGLE Metal's per-pass queries add up to more than the frame (1.4–1.6 times),
  and the post pass rises with the cards as much as the scatter pass does, although it does not change with the arm.
- **The volume light (L7b against L7a, one run):** not readable: its paired differences straddle zero at the
  default and the widest zoom (−0.6 to +1.95 ms, −1.1 to −0.05 ms) with repeat spreads of 1.9 to 3.6 ms. L7b's own
  bench on the normal scene put it within ±0.2 ms.
- Draw calls 51 against 39; triangles 2.62 M against 2.84 M here. L7a's plan counted +8.9k triangles for the cards
  on the normal scene; why the sign differs between the two scenes was not looked into.

**Checks:** `npm test` passes (255 of 255); the goldens of the default page against main match at all 8 cameras
(neither switch is on by default); the bench's views at the forest were looked at before the runs.

## Review (`/code-review high`)

- **Round 1** (2241ba9): severe: the results read the GPU frame timer, which runs long on ANGLE Metal, as frame
  times (11.3 to 14.4 ms "of the 16.7 ms"); the frame interval is the measure now (6.7 to 8.1 ms, +1.4 ms). Moderate:
  the per-pass split read as real; the runs' order and quietness misdescribed; the volume bullet's evidence; a focus
  outside the play area recorded but clamped; an empty part of `?benchat` taken as 0; the cameras' order unstated;
  the holds unstated; the system doc; the JSON named by a hash that is not their code, and the checks unreported.
  All fixed.
